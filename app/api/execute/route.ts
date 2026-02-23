import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

const WORKSPACE_CONTAINER = 'ai-platform-workspace'
const WORKSPACE_PATH = '/workspace'

// Language → execution strategy (image 字段仅用于兼容，docker exec 时已指定容器)
const LANG_CONFIG: Record<string, {
  image: string
  fileExt: string
  runCmd: (filePath: string) => string[]
}> = {
  python: {
    image: 'python:3.11-alpine',
    fileExt: 'py',
    runCmd: (f) => ['python', f],
  },
  python3: {
    image: 'python:3.11-alpine',
    fileExt: 'py',
    runCmd: (f) => ['python', f],
  },
  javascript: {
    image: 'node:20-alpine',
    fileExt: 'js',
    runCmd: (f) => ['node', f],
  },
  js: {
    image: 'node:20-alpine',
    fileExt: 'js',
    runCmd: (f) => ['node', f],
  },
  typescript: {
    image: 'node:20-alpine',
    fileExt: 'ts',
    runCmd: (f) => ['sh', '-c', `npx --yes tsx ${f}`],
  },
  ts: {
    image: 'node:20-alpine',
    fileExt: 'ts',
    runCmd: (f) => ['sh', '-c', `npx --yes tsx ${f}`],
  },
  bash: {
    image: 'alpine:latest',
    fileExt: 'sh',
    runCmd: (f) => ['sh', f],
  },
  sh: {
    image: 'alpine:latest',
    fileExt: 'sh',
    runCmd: (f) => ['sh', f],
  },
  shell: {
    image: 'alpine:latest',
    fileExt: 'sh',
    runCmd: (f) => ['sh', f],
  },
  ruby: {
    image: 'ruby:3.2-alpine',
    fileExt: 'rb',
    runCmd: (f) => ['ruby', f],
  },
  go: {
    image: 'golang:1.21-alpine',
    fileExt: 'go',
    runCmd: (f) => ['go', 'run', f],
  },
}

// 启动工作区容器（如果还未运行）
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

    // 确保工作区容器在运行
    try {
      await ensureWorkspaceRunning()
    } catch (e) {
      return NextResponse.json({
        error: `工作区启动失败: ${String(e)}`,
        output: '',
        exitCode: -1,
      }, { status: 503 })
    }

    // 在容器内临时创建代码文件
    const fileName = `execute-${uuidv4()}.${config.fileExt}`
    const containerPath = `${WORKSPACE_PATH}/${fileName}`

    // Step 1: 写入代码到容器
    const writeCmd = ['bash', '-c', `cat > "${containerPath}" << 'EOF'\n${code}\nEOF`]
    try {
      await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...writeCmd], { timeout: 5000 })
    } catch (e) {
      return NextResponse.json({
        error: `无法写入代码文件: ${String(e)}`,
        output: '',
        exitCode: -1,
      }, { status: 500 })
    }

    // Step 2: 执行代码
    const runArgs = config.runCmd(containerPath)
    const execCmd = ['exec', '-w', WORKSPACE_PATH, WORKSPACE_CONTAINER, ...runArgs]

    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      const result = await execFileAsync('docker', execCmd, {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      })
      stdout = result.stdout
      stderr = result.stderr
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string }
      stdout = execErr.stdout || ''
      stderr = execErr.stderr || ''
      exitCode = typeof execErr.code === 'number' ? execErr.code : 1

      if (execErr.killed || execErr.signal === 'SIGTERM') {
        return NextResponse.json({
          output: stdout,
          error: '⏱ 执行超时（15秒）',
          exitCode: -1,
          language: lang,
        })
      }
    }

    const combined = [stdout, stderr].filter(Boolean).join('\n').trim()

    return NextResponse.json({
      output: combined.slice(0, 10240) + (combined.length > 10240 ? '\n... (输出已截断)' : ''),
      exitCode,
      error: exitCode !== 0 && !combined ? `进程退出码 ${exitCode}` : null,
      language: lang,
      image: config.image,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message, output: '', exitCode: -1 }, { status: 500 })
  }
}
