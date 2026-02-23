import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

const WORKSPACE_CONTAINER = 'ai-platform-workspace'
const WORKSPACE_PATH = '/workspace'

// Language → execution strategy
const LANG_CONFIG: Record<string, {
  image: string
  fileExt: string
  usePersistentWorkspace: boolean  // Python 用持久容器，其他用 --rm
  runCmd: (filePath: string) => string[]
}> = {
  python: {
    image: 'python:3.11-slim',     // 持久容器
    fileExt: 'py',
    usePersistentWorkspace: true,
    runCmd: (f) => ['python', f],
  },
  python3: {
    image: 'python:3.11-slim',
    fileExt: 'py',
    usePersistentWorkspace: true,
    runCmd: (f) => ['python', f],
  },
  javascript: {
    image: 'node:20-alpine',
    fileExt: 'js',
    usePersistentWorkspace: false,  // JS 用独立容器
    runCmd: (f) => ['node', f],
  },
  js: {
    image: 'node:20-alpine',
    fileExt: 'js',
    usePersistentWorkspace: false,
    runCmd: (f) => ['node', f],
  },
  typescript: {
    image: 'node:20-alpine',
    fileExt: 'ts',
    usePersistentWorkspace: false,
    runCmd: (f) => ['sh', '-c', `npx --yes tsx ${f}`],
  },
  ts: {
    image: 'node:20-alpine',
    fileExt: 'ts',
    usePersistentWorkspace: false,
    runCmd: (f) => ['sh', '-c', `npx --yes tsx ${f}`],
  },
  bash: {
    image: 'alpine:latest',
    fileExt: 'sh',
    usePersistentWorkspace: false,
    runCmd: (f) => ['sh', f],
  },
  sh: {
    image: 'alpine:latest',
    fileExt: 'sh',
    usePersistentWorkspace: false,
    runCmd: (f) => ['sh', f],
  },
  shell: {
    image: 'alpine:latest',
    fileExt: 'sh',
    usePersistentWorkspace: false,
    runCmd: (f) => ['sh', f],
  },
  ruby: {
    image: 'ruby:3.2-alpine',
    fileExt: 'rb',
    usePersistentWorkspace: false,
    runCmd: (f) => ['ruby', f],
  },
  go: {
    image: 'golang:1.21-alpine',
    fileExt: 'go',
    usePersistentWorkspace: false,
    runCmd: (f) => ['go', 'run', f],
  },
}

// 启动工作区容器（Python 专用）
async function ensureWorkspaceRunning(): Promise<void> {
  try {
    const result = await execFileAsync('docker', ['inspect', WORKSPACE_CONTAINER])
    const data = JSON.parse(result.stdout)
    if (data[0]?.State?.Running) return
  } catch {
    // 容器不存在
  }

  try {
    await execFileAsync('docker', ['start', WORKSPACE_CONTAINER], { timeout: 5000 })
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch {
    try {
      await execFileAsync('docker', [
        'run', '-d',
        '--name', WORKSPACE_CONTAINER,
        '--memory', '512m',
        '--cpus', '2',
        '--network', 'none',
        '-v', 'ai-workspace:/workspace',
        'python:3.11-slim',
        'tail', '-f', '/dev/null'
      ], { timeout: 30000 })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (e) {
      throw e
    }
  }
}

// Python 代码：用持久化容器
async function executePythonInWorkspace(code: string, fileExt: string): Promise<string> {
  const fileName = `execute-${uuidv4()}.${fileExt}`
  const containerPath = `${WORKSPACE_PATH}/${fileName}`

  // Step 1: 写入代码
  const writeCmd = ['bash', '-c', `cat > "${containerPath}" << 'EOF'\n${code}\nEOF`]
  await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...writeCmd], { timeout: 5000 })

  // Step 2: 执行
  const runCmd = ['python', containerPath]
  const execCmd = ['exec', '-w', WORKSPACE_PATH, WORKSPACE_CONTAINER, ...runCmd]

  try {
    const result = await execFileAsync('docker', execCmd, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    })
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '(执行成功，无输出)'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    if (e.killed || e.signal === 'SIGTERM') return `⏱ 执行超时（15秒）\n${combined}`
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  }
}

// 其他语言：用各自独立容器（--rm）
async function executeInTemporaryContainer(
  code: string,
  image: string,
  fileExt: string,
  runCmd: (f: string) => string[]
): Promise<string> {
  const tmpFile = join(tmpdir(), `exec-${uuidv4()}.${fileExt}`)
  await writeFile(tmpFile, code, 'utf8')

  const containerPath = `/code/main.${fileExt}`
  const dockerArgs = [
    'run', '--rm',
    '--network', 'none',
    '--memory', '128m',
    '--cpus', '0.5',
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/tmp:size=10m',
    '-v', `${tmpFile}:${containerPath}:ro`,
    '--security-opt', 'no-new-privileges',
    image,
    ...runCmd(containerPath),
  ]

  try {
    const result = await execFileAsync('docker', dockerArgs, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    })
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '(执行成功，无输出)'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    if (e.killed || e.signal === 'SIGTERM') return `⏱ 执行超时（15秒）\n${combined}`
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  } finally {
    try { await unlink(tmpFile) } catch {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code, language = 'python' } = await req.json()

    if (!code?.trim()) {
      return NextResponse.json({ error: 'No code provided' }, { status: 400 })
    }

    const lang = language.toLowerCase().trim()
    const config = LANG_CONFIG[lang]

    if (!config) {
      return NextResponse.json({
        error: `不支持的语言: ${language}。支持: ${Object.keys(LANG_CONFIG).join(', ')}`
      }, { status: 400 })
    }

    let output = ''
    let exitCode = 0
    let error: string | null = null

    try {
      if (config.usePersistentWorkspace) {
        // Python：使用持久化工作区
        await ensureWorkspaceRunning()
        output = await executePythonInWorkspace(code, config.fileExt)
      } else {
        // 其他语言：用各自的容器
        output = await executeInTemporaryContainer(code, config.image, config.fileExt, config.runCmd)
      }
    } catch (e) {
      error = `执行失败: ${String(e)}`
      exitCode = 1
    }

    return NextResponse.json({
      output: output.slice(0, 10240) + (output.length > 10240 ? '\n... (输出已截断)' : ''),
      exitCode,
      error: error || (exitCode !== 0 && !output ? '进程失败' : null),
      language: lang,
      image: config.image,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message, output: '', exitCode: -1 }, { status: 500 })
  }
}
