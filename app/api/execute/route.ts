import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

// Language → Docker image + execution strategy
const LANG_CONFIG: Record<string, {
  image: string
  fileExt: string
  buildCmd?: (filePath: string) => string[]
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
    // Use ts-node via npx
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

export async function POST(req: NextRequest) {
  const tmpFile = join(tmpdir(), `exec-${uuidv4()}`)
  let codeFilePath = ''

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

    // Write code to a temp file
    const codeFile = `${tmpFile}.${config.fileExt}`
    codeFilePath = codeFile
    await writeFile(codeFile, code, 'utf8')

    // Build docker run args
    // Mount the temp file into the container as /code/main.<ext>
    const containerPath = `/code/main.${config.fileExt}`
    const runArgs = config.runCmd(containerPath)

    const dockerArgs = [
      'run',
      '--rm',                          // Auto-remove after exit
      '--network', 'none',             // No network
      '--memory', '128m',              // 128MB RAM
      '--cpus', '0.5',                 // 50% CPU
      '--pids-limit', '64',            // Max 64 processes
      '--read-only',                   // Read-only filesystem
      '--tmpfs', '/tmp:size=10m',      // Allow /tmp writes
      '-v', `${codeFile}:${containerPath}:ro`,  // Mount code file read-only
      '--security-opt', 'no-new-privileges',
      config.image,
      ...runArgs,
    ]

    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      const result = await execFileAsync('docker', dockerArgs, {
        timeout: 15000,           // 15s timeout
        maxBuffer: 1024 * 1024,   // 1MB output limit
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

      // Docker not running
      if (stderr.includes('Cannot connect') || stderr.includes('docker daemon')) {
        return NextResponse.json({
          error: '⚠️ Docker 未运行，请先启动 Docker Desktop',
          output: '',
          exitCode: -1,
        }, { status: 503 })
      }
    }

    // Combine stdout + stderr (like a real terminal)
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
    if (message.includes('ENOENT') && message.includes('docker')) {
      return NextResponse.json({
        error: '⚠️ 未找到 docker 命令，请确认 Docker Desktop 已安装并运行',
        output: '',
        exitCode: -1,
      }, { status: 503 })
    }
    return NextResponse.json({ error: message, output: '', exitCode: -1 }, { status: 500 })
  } finally {
    // Cleanup temp file
    if (codeFilePath) {
      try { await unlink(codeFilePath) } catch {}
    }
  }
}
