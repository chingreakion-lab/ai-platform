import { execFile } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'

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
  read_local_file: {
    description: '读取用户 Mac 电脑上的本地文件内容。可以读取任意绝对路径的文件，如 /Users/xxx/project/src/main.ts。',
    parameters: {
      path: {
        type: 'string',
        description: '本地文件的绝对路径，例如 /Users/mimap/Desktop/my-project/src/index.ts',
      },
    },
    required: ['path'],
  },
  list_local_dir: {
    description: '列出用户 Mac 电脑上某个本地目录的文件和子目录结构。可以传入绝对路径。',
    parameters: {
      path: {
        type: 'string',
        description: '本地目录的绝对路径，例如 /Users/mimap/Desktop/my-project',
      },
      depth: {
        type: 'string',
        description: '递归深度（1-4），默认 2。越大返回越多文件，可能很长。',
      },
    },
    required: ['path'],
  },
  write_local_file: {
    description: '将内容写入用户 Mac 电脑上的本地文件。路径必须是绝对路径，禁止 .. 路径穿越。会自动创建父目录（覆盖已有文件）。',
    parameters: {
      path: {
        type: 'string',
        description: '本地文件绝对路径，如 /tmp/ai-platform/app/api/test/route.ts',
      },
      content: {
        type: 'string',
        description: '要写入的完整文件内容（会覆盖原文件）',
      },
    },
    required: ['path', 'content'],
  },
  execute_local_shell: {
    description: '在用户 Mac 本地执行 bash 命令（不经过 Docker）。超时 30 秒，输出最多 50KB。可执行 npm、git、curl、npx 等本地命令。',
    parameters: {
      command: {
        type: 'string',
        description: '要执行的 bash 命令，如 "git status" 或 "npx tsc --noEmit"',
      },
      cwd: {
        type: 'string',
        description: '工作目录绝对路径，默认 /tmp/ai-platform',
      },
    },
    required: ['command'],
  },
  screenshot_local: {
    description: '截取本平台（localhost:3099）的页面截图，让 AI 能看到当前界面长什么样。用 Gemini Vision 分析图像内容并返回详细描述。',
    parameters: {
      path: {
        type: 'string',
        description: '要截图的页面路径，默认 "/"（首页）。如 "/settings" 或 "/"',
      },
      description: {
        type: 'string',
        description: '想分析界面的哪个方面，如 "整体布局"、"侧边栏"、"聊天区域"',
      },
    },
    required: [],
  },
  web_search: {
    description: '搜索互联网，获取最新信息、文档、新闻等。返回搜索结果列表（标题、链接、摘要）。适合查资料、找文档、了解最新动态。',
    parameters: {
      query: {
        type: 'string',
        description: '搜索关键词，如 "Next.js 15 app router 教程" 或 "Python requests 库文档"',
      },
      language: {
        type: 'string',
        description: '结果语言：zh-cn（中文，默认）、en（英文）、ja（日文）',
      },
    },
    required: ['query'],
  },
  read_webpage: {
    description: '读取网页的正文内容。输入网页 URL，返回该页面的文字内容（去除HTML标签）。适合阅读文章、查看文档、提取网页信息。',
    parameters: {
      url: {
        type: 'string',
        description: '要读取的网页地址，如 "https://nextjs.org/docs/app/api-reference"',
      },
    },
    required: ['url'],
  },
  chatdev_tool: {
    description: `调用 ChatDev 2.0 的专业工程师工具（运行在 localhost:6401）。可用工具：
- save_file(path, content) — 保存文件到工作区
- read_file_segment(path, start_line, line_count) — 按行读取文件片段
- apply_text_edits(path, start_line, end_line, replacement) — 精准行编辑（比整文件替换更安全）
- search_in_files(pattern, globs) — 在工作区文件中用正则搜索内容
- describe_available_files() — 列出工作区所有文件
- list_directory(path) — 列出目录结构
- create_folder(path) — 创建目录
- delete_path(path) — 删除文件或目录
- uv_run(script, args) — 用 uv 运行 Python 脚本（自动管理依赖）
- install_python_packages(packages) — 安装 Python 包
- web_search(query) — 搜索互联网
- read_webpage_content(url) — 读取网页正文
- get_current_time() — 获取当前时间`,
    parameters: {
      tool_name: {
        type: 'string',
        description: '工具名称，如 save_file、read_file_segment、apply_text_edits、search_in_files、uv_run 等',
      },
      arguments: {
        type: 'string',
        description: 'JSON 字符串格式的工具参数，如 {"path": "main.py", "content": "print(1)"} 或 {} 表示无参数',
      },
      workspace: {
        type: 'string',
        description: '可选：工作区绝对路径，默认使用 ChatDev 的 direct_tool_workspace',
      },
    },
    required: ['tool_name', 'arguments'],
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
    // 确保目录存在（只有路径里包含 / 才需要 mkdir）
    const lastSlash = path.lastIndexOf('/')
    if (lastSlash > 0) {
      const dirPath = path.slice(0, lastSlash)
      const dirCmd = ['sh', '-c', `mkdir -p "${WORKSPACE_PATH}/${dirPath}"`]
      await execFileAsync('docker', ['exec', WORKSPACE_CONTAINER, ...dirCmd], { timeout: 5000 })
    }

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

function readLocalFile(filePath: string): string {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return `❌ 文件不存在: ${resolved}`
    const stat = fs.statSync(resolved)
    if (stat.isDirectory()) return `❌ 这是一个目录，请使用 list_local_dir 工具`
    if (stat.size > 2 * 1024 * 1024) return `❌ 文件太大 (${Math.round(stat.size/1024)}KB)，超过 2MB 限制`
    return fs.readFileSync(resolved, 'utf-8')
  } catch (e) {
    return `❌ 读取失败: ${String(e)}`
  }
}

function listLocalDir(dirPath: string, maxDepth = 2): string {
  try {
    const resolved = path.resolve(dirPath)
    if (!fs.existsSync(resolved)) return `❌ 目录不存在: ${resolved}`
    if (!fs.statSync(resolved).isDirectory()) return `❌ 不是目录: ${resolved}`

    const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.DS_Store', '.cache', 'coverage'])
    const lines: string[] = [`📁 ${resolved}`]
    let fileCount = 0

    function walk(dir: string, depth: number, prefix: string) {
      if (depth > maxDepth || fileCount > 300) return
      let entries: fs.Dirent[]
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      entries = entries.filter(e => !IGNORE.has(e.name)).sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      entries.forEach((entry, i) => {
        if (fileCount > 300) return
        const isLast = i === entries.length - 1
        const connector = isLast ? '└── ' : '├── '
        const childPrefix = isLast ? '    ' : '│   '
        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}📁 ${entry.name}/`)
          walk(path.join(dir, entry.name), depth + 1, prefix + childPrefix)
        } else {
          const stat = fs.statSync(path.join(dir, entry.name))
          const size = stat.size > 1024 ? `${Math.round(stat.size/1024)}KB` : `${stat.size}B`
          lines.push(`${prefix}${connector}${entry.name} (${size})`)
          fileCount++
        }
      })
    }

    walk(resolved, 1, '')
    if (fileCount > 300) lines.push('... (超过300个文件，已截断)')
    return lines.join('\n')
  } catch (e) {
    return `❌ 列目录失败: ${String(e)}`
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
// Local File System Tools (for local/chief mode)
// ────────────────────────────────────────────────────────────────────────────────

function validateLocalPath(inputPath: string): { safe: boolean; resolved: string; error?: string } {
  if (!path.isAbsolute(inputPath))
    return { safe: false, resolved: '', error: `❌ 路径必须是绝对路径: ${inputPath}` }
  const resolved = path.resolve(inputPath)
  if (resolved !== path.normalize(inputPath))
    return { safe: false, resolved: '', error: `❌ 禁止使用 .. 进行路径穿越: ${inputPath}` }
  return { safe: true, resolved }
}

async function writeLocalFile(inputPath: string, content: string): Promise<string> {
  const { safe, resolved, error } = validateLocalPath(inputPath)
  if (!safe) return error!
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, content, 'utf-8')
    return `✅ 已写入本地文件: ${resolved} (${content.length} 字符)`
  } catch (e) {
    return `❌ 写入失败: ${String(e)}`
  }
}

async function executeLocalShell(command: string, cwd?: string): Promise<string> {
  const MAX = 50 * 1024
  const workDir = cwd ? path.resolve(cwd) : '/tmp/ai-platform'
  try {
    const r = await execFileAsync('bash', ['-c', command], {
      timeout: 30000,
      maxBuffer: MAX,
      cwd: workDir,
      env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:' + (process.env.PATH || '') },
    })
    const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '✅ 命令执行成功，无输出'
    return out.length > MAX ? out.slice(0, MAX) + '\n... [输出已截断，超过 50KB]' : out
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
    const out = [e.stdout, e.stderr].filter(Boolean).join('\n').trim().slice(0, MAX)
    return e.killed ? `⏱ 命令超时（30秒）\n${out}` : `❌ 退出码 ${e.code}\n${out || '(无输出)'}`
  }
}

async function screenshotLocal(pagePath = '/', focusDescription = '整体布局'): Promise<string> {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`http://localhost:3099${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1500)

    const screenshotBuffer = await page.screenshot({ fullPage: false })
    await browser.close()

    const imageBase64 = screenshotBuffer.toString('base64')
    const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''

    if (!GEMINI_KEY) {
      return `[截图成功（${pagePath}），base64长度: ${imageBase64.length} 字节，但缺少 GEMINI_API_KEY 无法自动分析]`
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `请详细描述这个 AI 协作平台的界面截图。重点分析：${focusDescription}。描述要具体，包括颜色、布局、文字内容、可见的 UI 元素、功能区域。` },
              { inline_data: { mime_type: 'image/png', data: imageBase64 } }
            ]
          }]
        })
      }
    )

    const geminiData = await geminiRes.json()
    const analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '（Gemini 未返回分析结果）'
    return `📸 截图分析（页面: ${pagePath}，关注: ${focusDescription}）\n\n${analysis}`
  } catch (e) {
    return `❌ 截图失败: ${String(e)}`
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Web Search & Webpage Reader (from ChatDev 2.0)
// ────────────────────────────────────────────────────────────────────────────────

async function webSearch(query: string, language = 'zh-cn'): Promise<string> {
  const SERPER_KEY = process.env.SERPER_DEV_API_KEY || process.env.SERPER_API_KEY || ''
  if (!SERPER_KEY) {
    return `❌ 缺少 SERPER_DEV_API_KEY 环境变量。请在 .env.local 里添加：\nSERPER_DEV_API_KEY=your_key_here\n（免费申请：https://serper.dev）`
  }

  try {
    const langMap: Record<string, { hl: string; gl: string }> = {
      'zh-cn': { hl: 'zh-cn', gl: 'cn' },
      'zh': { hl: 'zh-cn', gl: 'cn' },
      'en': { hl: 'en', gl: 'us' },
      'ja': { hl: 'ja', gl: 'jp' },
    }
    const { hl, gl } = langMap[language] || { hl: 'zh-cn', gl: 'cn' }

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, hl, gl, num: 8 }),
    })

    if (!res.ok) return `❌ 搜索失败: HTTP ${res.status}`

    const data = await res.json() as {
      knowledgeGraph?: { title?: string; description?: string }
      answerBox?: { answer?: string; snippet?: string }
      organic?: Array<{ title: string; link: string; snippet?: string }>
    }

    const lines: string[] = [`🔍 搜索：「${query}」\n`]

    // 直接答案（Answer Box）
    if (data.answerBox?.answer || data.answerBox?.snippet) {
      lines.push(`📌 直接答案：${data.answerBox.answer || data.answerBox.snippet}\n`)
    }

    // 知识图谱
    if (data.knowledgeGraph?.title) {
      lines.push(`📚 ${data.knowledgeGraph.title}：${data.knowledgeGraph.description || ''}\n`)
    }

    // 搜索结果
    const results = data.organic || []
    results.slice(0, 6).forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title}**`)
      lines.push(`   ${r.link}`)
      if (r.snippet) lines.push(`   ${r.snippet}`)
      lines.push('')
    })

    if (results.length === 0) lines.push('（没有找到相关结果）')

    return lines.join('\n')
  } catch (e) {
    return `❌ 搜索出错: ${String(e)}`
  }
}

async function readWebpage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return `❌ 无法访问网页: HTTP ${res.status} ${url}`

    const html = await res.text()

    // 简单提取正文（去除脚本、样式、HTML标签）
    const noScript = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    const noStyle = noScript.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    const noHtml = noStyle.replace(/<[^>]+>/g, ' ')
    const decoded = noHtml
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    const cleaned = decoded.replace(/\s{3,}/g, '\n\n').trim()

    const MAX_CHARS = 8000
    const truncated = cleaned.length > MAX_CHARS
      ? cleaned.slice(0, MAX_CHARS) + `\n\n... [页面内容已截断，共 ${cleaned.length} 字符]`
      : cleaned

    return `🌐 网页内容（${url}）：\n\n${truncated}`
  } catch (e) {
    return `❌ 读取网页失败: ${String(e)}`
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// ChatDev Tool Bridge
// ────────────────────────────────────────────────────────────────────────────────

async function chatdevTool(toolName: string, argsJson: string, workspace?: string): Promise<string> {
  let args: Record<string, unknown>
  try {
    args = argsJson.trim() === '{}' || argsJson.trim() === '' ? {} : JSON.parse(argsJson)
  } catch {
    return `❌ arguments 必须是有效的 JSON 字符串，收到：${argsJson}`
  }

  try {
    const body: Record<string, unknown> = { tool_name: toolName, arguments: args }
    if (workspace) body.workspace = workspace

    const res = await fetch('http://localhost:6401/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      return `❌ ChatDev 返回 HTTP ${res.status}: ${await res.text()}`
    }

    const data = await res.json() as { result?: string; error?: string; available_tools?: string[] }

    if (data.error) {
      let msg = `❌ ChatDev 工具错误: ${data.error}`
      if (data.available_tools) {
        msg += `\n\n可用工具列表:\n${data.available_tools.join(', ')}`
      }
      return msg
    }

    return data.result ?? '(工具执行完成，无输出)'
  } catch (e) {
    const msg = String(e)
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      return `❌ 无法连接到 ChatDev (localhost:6401)。请确保 ChatDev 正在运行。`
    }
    return `❌ ChatDev 调用失败: ${msg}`
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
      case 'read_local_file':
        output = readLocalFile(String(args.path || ''))
        break
      case 'list_local_dir':
        output = listLocalDir(String(args.path || ''), Math.min(4, parseInt(String(args.depth || '2')) || 2))
        break
      case 'write_local_file':
        output = await writeLocalFile(String(args.path || ''), String(args.content || ''))
        break
      case 'execute_local_shell':
        output = await executeLocalShell(String(args.command || ''), args.cwd ? String(args.cwd) : undefined)
        break
      case 'screenshot_local':
        output = await screenshotLocal(String(args.path || '/'), String(args.description || '整体布局'))
        break
      case 'web_search':
        output = await webSearch(String(args.query || ''), String(args.language || 'zh-cn'))
        break
      case 'read_webpage':
        output = await readWebpage(String(args.url || ''))
        break
      case 'chatdev_tool':
        output = await chatdevTool(
          String(args.tool_name || ''),
          String(args.arguments || '{}'),
          args.workspace ? String(args.workspace) : undefined,
        )
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

// 所有模式共享的工具（不依赖环境）
const SHARED_TOOL_NAMES = ['web_search', 'read_webpage', 'chatdev_tool']
// Docker 模式工具集（隔离容器环境）
const DOCKER_TOOL_NAMES = ['execute_code', 'write_file', 'read_file', 'shell', 'read_local_file', 'list_local_dir', ...SHARED_TOOL_NAMES]
// Local 模式工具集（主工程师，直接操作本地文件系统）
const LOCAL_TOOL_NAMES = ['write_local_file', 'execute_local_shell', 'read_local_file', 'list_local_dir', 'screenshot_local', ...SHARED_TOOL_NAMES]

function getFilteredSchemas(workspaceType: 'docker' | 'local') {
  const names = workspaceType === 'local' ? LOCAL_TOOL_NAMES : DOCKER_TOOL_NAMES
  return Object.entries(TOOL_SCHEMAS).filter(([name]) => names.includes(name))
}

// Claude (Anthropic) 格式
export function getClaudeTools(workspaceType: 'docker' | 'local' = 'docker') {
  return getFilteredSchemas(workspaceType).map(([name, schema]) => ({
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
export function getOpenAITools(workspaceType: 'docker' | 'local' = 'docker') {
  return getFilteredSchemas(workspaceType).map(([name, schema]) => ({
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
export function getGeminiTools(workspaceType: 'docker' | 'local' = 'docker') {
  const { SchemaType } = require('@google/generative-ai')

  return [{
    functionDeclarations: getFilteredSchemas(workspaceType).map(([name, schema]) => ({
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
