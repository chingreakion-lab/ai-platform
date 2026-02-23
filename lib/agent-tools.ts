import { execFile } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

const WORKSPACE_CONTAINER = 'ai-platform-workspace'
const WORKSPACE_PATH = '/workspace'

// ────────────────────────────────────────────────────────────────────────────────
// Tool Result Type
// ────────────────────────────────────────────────────────────────────────────────

export interface ToolResult {
  output: string
  error?: string
  exitCode?: number
}

// ────────────────────────────────────────────────────────────────────────────────
// Tool Schemas (统一定义)
// ────────────────────────────────────────────────────────────────────────────────

export const TOOL_SCHEMAS = {
  execute_code: {
    description: '在持久化工作区容器里执行代码。Python/bash 代码在持久容器执行，JS/TS 支持 node 和 tsx 运行时。',
    parameters: {
      language: { 
        type: 'string', 
        description: '代码语言: python | javascript | typescript | bash | ruby | go' 
      },
      code: { 
        type: 'string', 
        description: '要执行的代码内容' 
      },
    },
    required: ['language', 'code'],
  },
  write_file: {
    description: '在工作区（/workspace）写入文件。路径相对于 /workspace，如 "src/main.py"。会自动创建父目录。',
    parameters: {
      path: { 
        type: 'string', 
        description: '文件路径（相对于 /workspace，例如 "data/output.txt"）' 
      },
      content: { 
        type: 'string', 
        description: '文件内容' 
      },
    },
    required: ['path', 'content'],
  },
  read_file: {
    description: '读取工作区（/workspace）里的文件内容。返回文件的文本内容。',
    parameters: {
      path: { 
        type: 'string', 
        description: '文件路径（相对于 /workspace）' 
      },
    },
    required: ['path'],
  },
  shell: {
    description: '在工作区容器里执行 shell 命令（bash）。工作目录是 /workspace。可用于安装包、查看文件列表等。',
    parameters: {
      command: { 
        type: 'string', 
        description: 'shell 命令，如 "ls -la" 或 "pip install numpy"' 
      },
    },
    required: ['command'],
  },
}

// ────────────────────────────────────────────────────────────────────────────────
// Language Configuration
// ────────────────────────────────────────────────────────────────────────────────

const LANG_CONFIG: Record<string, { fileExt: string; runCmd: (f: string) => string[] }> = {
  python:     { fileExt: 'py', runCmd: f => ['python', f] },
  python3:    { fileExt: 'py', runCmd: f => ['python', f] },
  javascript: { fileExt: 'js', runCmd: f => ['node', f] },
  js:         { fileExt: 'js', runCmd: f => ['node', f] },
  typescript: { fileExt: 'ts', runCmd: f => ['sh', '-c', `npx --yes tsx ${f}`] },
  ts:         { fileExt: 'ts', runCmd: f => ['sh', '-c', `npx --yes tsx ${f}`] },
  bash:       { fileExt: 'sh', runCmd: f => ['sh', f] },
  sh:         { fileExt: 'sh', runCmd: f => ['sh', f] },
  ruby:       { fileExt: 'rb', runCmd: f => ['ruby', f] },
  go:         { fileExt: 'go', runCmd: f => ['go', 'run', f] },
}

// ────────────────────────────────────────────────────────────────────────────────
// Tool Executors
// ────────────────────────────────────────────────────────────────────────────────

async function executeCode(language: string, code: string): Promise<string> {
  const lang = language.toLowerCase().trim()
  const config = LANG_CONFIG[lang]
  if (!config) return `❌ 不支持的语言: ${language}`

  const fileName = `code-${uuidv4()}.${config.fileExt}`
  const containerPath = `${WORKSPACE_PATH}/${fileName}`

  try {
    // 写代码到容器内的临时文件
    const writeCmd = ['bash', '-c', `cat > "${containerPath}" << 'EOF'\n${code}\nEOF`]
    await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...writeCmd], { timeout: 5000 })

    // 执行代码
    const runCmd = config.runCmd(containerPath)
    const execCmd = ['exec', WORKSPACE_CONTAINER, ...runCmd]
    
    const result = await execFileAsync('docker', execCmd, {
      timeout: 30000, 
      maxBuffer: 2 * 1024 * 1024,
    })
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '✅ 执行成功，无输出'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    if (e.killed) return `⏱ 执行超时（30秒）\n${combined}`
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  }
}

async function writeFile(path: string, content: string): Promise<string> {
  try {
    // 确保目录存在
    const dirPath = path.replace(/\/[^/]*$/, '') || '.'
    const dirCmd = ['sh', '-c', `mkdir -p "${WORKSPACE_PATH}/${dirPath}"`]
    await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...dirCmd], { timeout: 5000 })

    // 写入文件
    const fullPath = `${WORKSPACE_PATH}/${path.replace(/^\//, '')}`
    const writeCmd = ['bash', '-c', `cat > "${fullPath}" << 'EOF'\n${content}\nEOF`]
    await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...writeCmd], { timeout: 5000 })
    
    return `✅ 已写入: ${path} (${content.length} 字符)`
  } catch (e) {
    return `❌ 写入失败: ${String(e)}`
  }
}

async function readFile(path: string): Promise<string> {
  try {
    const fullPath = `${WORKSPACE_PATH}/${path.replace(/^\//, '')}`
    const result = await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, 'cat', fullPath], { 
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024,
    })
    return result.stdout || '(文件为空)'
  } catch (e) {
    return `❌ 读取失败: ${String(e).includes('No such file') ? '文件不存在' : String(e)}`
  }
}

async function executeShell(command: string): Promise<string> {
  try {
    const result = await execFileAsync('docker', [
      'exec', '-w', WORKSPACE_PATH, WORKSPACE_CONTAINER,
      'bash', '-c', command
    ], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
    
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '✅ 命令执行成功，无输出'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    if (e.killed) return `⏱ 命令超时（30秒）\n${combined}`
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Main Tool Executor
// ────────────────────────────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, string | number | boolean>): Promise<ToolResult> {
  let output = ''
  
  try {
    switch (name) {
      case 'execute_code':
        output = await executeCode(String(args.language || ''), String(args.code || ''))
        break
      case 'write_file':
        output = await writeFile(String(args.path || ''), String(args.content || ''))
        break
      case 'read_file':
        output = await readFile(String(args.path || ''))
        break
      case 'shell':
        output = await executeShell(String(args.command || args.cmd || ''))
        break
      default:
        output = `❌ 未知工具: ${name}`
    }
  } catch (e) {
    output = `❌ 工具执行异常: ${String(e)}`
  }

  return { output }
}

// ────────────────────────────────────────────────────────────────────────────────
// Tool Definitions for Different Providers
// ────────────────────────────────────────────────────────────────────────────────

// Claude (Anthropic) 格式
export function getClaudeTools() {
  return Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    name,
    description: schema.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(schema.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
      required: schema.required,
    },
  }))
}

// OpenAI / Grok (xAI) 格式
export function getOpenAITools() {
  return Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    type: 'function' as const,
    function: {
      name,
      description: schema.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(schema.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: schema.required,
      },
    },
  }))
}

// Gemini 格式
export function getGeminiTools() {
  const { SchemaType } = require('@google/generative-ai')
  
  return [{
    functionDeclarations: Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
      name,
      description: schema.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(schema.parameters).map(([k, v]) => [k, { 
            type: SchemaType[v.type.toUpperCase() as keyof typeof SchemaType] || SchemaType.STRING, 
            description: v.description 
          }])
        ),
        required: schema.required,
      },
    })),
  }]
}
