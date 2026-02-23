import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const WORKSPACE_CONTAINER_NAME = 'ai-platform-workspace'
const WORKSPACE_PATH = '/workspace'

/**
 * 启动持久化工作区容器
 * 容器保持运行，所有 AI agent 通过 docker exec 在同一容器内执行
 */
async function startWorkspace(): Promise<{ success: boolean; error?: string }> {
  try {
    // 检查容器是否已存在
    await execFileAsync('docker', ['inspect', WORKSPACE_CONTAINER_NAME])
    // 如果存在，尝试启动（可能已停止）
    try {
      await execFileAsync('docker', ['start', WORKSPACE_CONTAINER_NAME])
    } catch {
      // 容器可能已在运行，忽略错误
    }
    return { success: true }
  } catch {
    // 容器不存在，创建新的
    try {
      await execFileAsync('docker', [
        'run', '-d',
        '--name', WORKSPACE_CONTAINER_NAME,
        '--memory', '512m',
        '--cpus', '2',
        '--network', 'none',
        '-v', 'ai-workspace:/workspace',
        'python:3.11-slim',
        'tail', '-f', '/dev/null'
      ])

      // 等待容器启动
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 预装依赖（可选，但推荐）
      try {
        const pkgs = ['pip', 'install', '--no-cache-dir', 'numpy', 'pandas', 'matplotlib', 'requests']
        await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER_NAME, ...pkgs], { timeout: 120000 })
      } catch (e) {
        // 预装失败不影响容器启动
        console.error('预装依赖失败:', e)
      }

      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }
}

/**
 * 检查容器状态
 */
async function getWorkspaceStatus(): Promise<{
  running: boolean
  containerName: string
  error?: string
}> {
  try {
    const result = await execFileAsync('docker', ['inspect', WORKSPACE_CONTAINER_NAME])
    const data = JSON.parse(result.stdout)
    const state = data[0]?.State
    
    return {
      running: state?.Running === true,
      containerName: WORKSPACE_CONTAINER_NAME
    }
  } catch (e) {
    return {
      running: false,
      containerName: WORKSPACE_CONTAINER_NAME,
      error: String(e)
    }
  }
}

/**
 * 在容器内执行命令
 */
async function execInWorkspace(command: string[]): Promise<{
  success: boolean
  stdout: string
  stderr: string
  code: number
  error?: string
}> {
  try {
    // 先确保容器在运行
    const status = await getWorkspaceStatus()
    if (!status.running) {
      const started = await startWorkspace()
      if (!started.success) {
        return {
          success: false,
          stdout: '',
          stderr: started.error || '容器启动失败',
          code: 1,
          error: started.error
        }
      }
      // 等待容器就绪
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const result = await execFileAsync('docker', [
      'exec', WORKSPACE_CONTAINER_NAME, 'bash', '-c',
      command.join(' ')
    ], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 })

    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      code: 0
    }
  } catch (e: any) {
    return {
      success: false,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      code: e.code || 1,
      error: String(e)
    }
  }
}

/**
 * 停止工作区容器
 */
async function stopWorkspace(): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync('docker', ['stop', WORKSPACE_CONTAINER_NAME])
    // 可选：删除容器以释放资源
    // await execFileAsync('docker', ['rm', WORKSPACE_CONTAINER_NAME])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()

    switch (action) {
      case 'start':
        const startResult = await startWorkspace()
        return NextResponse.json(startResult)

      case 'stop':
        const stopResult = await stopWorkspace()
        return NextResponse.json(stopResult)

      case 'exec':
        const { command } = await req.json()
        if (!command || !Array.isArray(command)) {
          return NextResponse.json({ error: 'command is required and must be an array' }, { status: 400 })
        }
        const execResult = await execInWorkspace(command)
        return NextResponse.json(execResult)

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const action = searchParams.get('action') || 'status'

  if (action === 'status') {
    const status = await getWorkspaceStatus()
    return NextResponse.json(status)
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const result = await stopWorkspace()
  return NextResponse.json(result)
}
