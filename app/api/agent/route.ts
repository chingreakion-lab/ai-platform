import { NextRequest } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS_DOC = `你有以下工具可以使用，通过在回复中输出 XML 标签来调用：

<tool_call>
<name>execute_code</name>
<language>python|javascript|bash|go|ruby|typescript</language>
<code>
# 你的代码
</code>
</tool_call>

<tool_call>
<name>write_file</name>
<path>文件路径（相对路径）</path>
<content>
文件内容
</content>
</tool_call>

<tool_call>
<name>read_file</name>
<path>文件路径（相对路径）</path>
</tool_call>

<tool_call>
<name>shell</name>
<cmd>bash命令（在工作目录下执行）</cmd>
</tool_call>

规则：
- 每次回复只调用一个工具
- 工具结果会作为 <tool_result> 返回给你
- 任务完成后，输出 <done>最终结论或结果摘要</done> 来结束
- 不需要工具时直接回答，再输出 <done>...</done>
- 遇到错误要自己分析并修复，不要放弃`

const LANG_CONFIG: Record<string, { image: string; fileExt: string; runCmd: (f: string) => string[] }> = {
  python:     { image: 'python:3.11-alpine', fileExt: 'py', runCmd: f => ['python', f] },
  python3:    { image: 'python:3.11-alpine', fileExt: 'py', runCmd: f => ['python', f] },
  javascript: { image: 'node:20-alpine',     fileExt: 'js', runCmd: f => ['node', f] },
  js:         { image: 'node:20-alpine',     fileExt: 'js', runCmd: f => ['node', f] },
  typescript: { image: 'node:20-alpine',     fileExt: 'ts', runCmd: f => ['sh', '-c', `npx --yes tsx ${f}`] },
  ts:         { image: 'node:20-alpine',     fileExt: 'ts', runCmd: f => ['sh', '-c', `npx --yes tsx ${f}`] },
  bash:       { image: 'alpine:latest',      fileExt: 'sh', runCmd: f => ['sh', f] },
  sh:         { image: 'alpine:latest',      fileExt: 'sh', runCmd: f => ['sh', f] },
  ruby:       { image: 'ruby:3.2-alpine',    fileExt: 'rb', runCmd: f => ['ruby', f] },
  go:         { image: 'golang:1.21-alpine', fileExt: 'go', runCmd: f => ['go', 'run', f] },
}

// ─── Tool executors ───────────────────────────────────────────────────────────

async function executeCode(language: string, code: string): Promise<string> {
  const lang = language.toLowerCase().trim()
  const config = LANG_CONFIG[lang]
  if (!config) return `不支持的语言: ${language}`

  const tmpFile = join(tmpdir(), `agent-${uuidv4()}.${config.fileExt}`)
  await writeFile(tmpFile, code, 'utf8')

  const containerPath = `/code/main.${config.fileExt}`
  const dockerArgs = [
    'run', '--rm', '--network', 'none', '--memory', '256m', '--cpus', '1',
    '--pids-limit', '64', '--read-only', '--tmpfs', '/tmp:size=50m',
    '-v', `${tmpFile}:${containerPath}:ro`,
    '--security-opt', 'no-new-privileges',
    config.image, ...config.runCmd(containerPath),
  ]

  try {
    const result = await execFileAsync('docker', dockerArgs, {
      timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    })
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '(执行成功，无输出)'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    if (e.killed) return `⏱ 执行超时（30秒）\n${combined}`
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  } finally {
    try { await unlink(tmpFile) } catch {}
  }
}

async function writeFileToWorkspace(workDir: string, path: string, content: string): Promise<string> {
  const fullPath = join(workDir, path.replace(/^\//, ''))
  await mkdir(fullPath.replace(/\/[^/]+$/, ''), { recursive: true })
  await writeFile(fullPath, content, 'utf8')
  return `✅ 已写入: ${path} (${content.length} 字符)`
}

async function readFileFromWorkspace(workDir: string, path: string): Promise<string> {
  try {
    const fullPath = join(workDir, path.replace(/^\//, ''))
    const content = await readFile(fullPath, 'utf8')
    return content.slice(0, 8000) + (content.length > 8000 ? '\n...(已截断)' : '')
  } catch {
    return `❌ 文件不存在: ${path}`
  }
}

async function shellExec(workDir: string, cmd: string): Promise<string> {
  try {
    const result = await execFileAsync('bash', ['-c', cmd], {
      cwd: workDir, timeout: 15000, maxBuffer: 512 * 1024,
      env: { ...process.env, PATH: `/usr/local/bin:/usr/bin:/bin:${process.env.PATH}` },
    })
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return combined || '(命令执行成功，无输出)'
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    return `❌ 退出码 ${e.code}\n${combined || '(无输出)'}`
  }
}

// ─── Tool call parser ─────────────────────────────────────────────────────────

interface ToolCall {
  name: string
  args: Record<string, string>
}

function parseToolCall(text: string): ToolCall | null {
  const tcMatch = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/)
  if (!tcMatch) return null
  const inner = tcMatch[1]

  const name = (inner.match(/<name>(.*?)<\/name>/) || [])[1]?.trim()
  if (!name) return null

  const args: Record<string, string> = {}
  const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
  let m
  while ((m = tagRegex.exec(inner)) !== null) {
    if (m[1] !== 'name') args[m[1]] = m[2].trim()
  }
  return { name, args }
}

function parseDone(text: string): string | null {
  const m = text.match(/<done>([\s\S]*?)<\/done>/)
  return m ? m[1].trim() : null
}

// ─── LLM callers ─────────────────────────────────────────────────────────────

async function callLLM(
  provider: string, model: string, apiKey: string,
  messages: { role: string; content: string }[], systemPrompt: string
): Promise<string> {
  if (provider === 'gemini') {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { maxOutputTokens: 4096 } }) }
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.candidates[0].content.parts[0].text

  } else if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.content[0].text

  } else if (provider === 'xai') {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'system', content: systemPrompt }, ...messages] })
    })
    const data = await res.json()
    if (data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message)
    return data.choices[0].message.content
  }
  throw new Error(`Unknown provider: ${provider}`)
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(type: string, payload: object): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`
}

// ─── Main agent loop ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { provider, model, apiKey, agentName, task, history, systemBase, groupId } = await req.json()

  // Create a per-agent workspace dir
  const workDir = join(tmpdir(), `agent-workspace-${uuidv4()}`)
  await mkdir(workDir, { recursive: true })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(encoder.encode(s))

      const systemPrompt = [
        systemBase || `你是 ${agentName}，一个自主AI工程师。`,
        TOOLS_DOC,
        `\n当前工作目录: ${workDir}`,
      ].join('\n\n')

      // Build conversation history for this agent
      const messages: { role: string; content: string }[] = [
        ...(history || []),
        { role: 'user', content: `任务：${task}` }
      ]

      push(sseEvent('start', { agent: agentName, task }))

      const MAX_ITERATIONS = 12
      let iteration = 0

      while (iteration < MAX_ITERATIONS) {
        iteration++
        push(sseEvent('thinking', { agent: agentName, iteration }))

        let reply: string
        try {
          reply = await callLLM(provider, model, apiKey, messages, systemPrompt)
        } catch (e) {
          push(sseEvent('error', { agent: agentName, message: String(e) }))
          break
        }

        // Emit the AI's reply text (strip tool_call XML for display)
        const displayReply = reply
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
          .replace(/<done>[\s\S]*?<\/done>/g, '')
          .trim()

        if (displayReply) {
          push(sseEvent('message', { agent: agentName, content: reply, display: displayReply }))
        }

        // Check if done
        const doneText = parseDone(reply)
        if (doneText) {
          push(sseEvent('done', { agent: agentName, summary: doneText }))
          break
        }

        // Parse tool call
        const toolCall = parseToolCall(reply)
        if (!toolCall) {
          // No tool call and no <done> — treat as final answer
          if (displayReply) {
            push(sseEvent('done', { agent: agentName, summary: displayReply }))
          }
          break
        }

        // Execute tool
        push(sseEvent('tool_call', { agent: agentName, tool: toolCall.name, args: toolCall.args }))

        let toolResult = ''
        try {
          switch (toolCall.name) {
            case 'execute_code':
              toolResult = await executeCode(toolCall.args.language || 'python', toolCall.args.code || '')
              break
            case 'write_file':
              toolResult = await writeFileToWorkspace(workDir, toolCall.args.path || 'output.txt', toolCall.args.content || '')
              break
            case 'read_file':
              toolResult = await readFileFromWorkspace(workDir, toolCall.args.path || '')
              break
            case 'shell':
              toolResult = await shellExec(workDir, toolCall.args.cmd || '')
              break
            default:
              toolResult = `未知工具: ${toolCall.name}`
          }
        } catch (e) {
          toolResult = `工具执行异常: ${String(e)}`
        }

        push(sseEvent('tool_result', { agent: agentName, tool: toolCall.name, result: toolResult }))

        // Add to conversation
        messages.push({ role: 'assistant', content: reply })
        messages.push({ role: 'user', content: `<tool_result>\n${toolResult}\n</tool_result>` })
      }

      if (iteration >= MAX_ITERATIONS) {
        push(sseEvent('done', { agent: agentName, summary: `已达到最大迭代次数 (${MAX_ITERATIONS})` }))
      }

      // Cleanup workspace
      try {
        await execFileAsync('rm', ['-rf', workDir])
      } catch {}

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
