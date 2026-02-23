import { NextRequest } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { 
  executeTool, 
  getClaudeTools, 
  getOpenAITools, 
  getGeminiTools 
} from '@/lib/agent-tools'

const execFileAsync = promisify(execFile)

const WORKSPACE_CONTAINER = 'ai-platform-workspace'

// 启动工作区容器（如果还未运行）
async function ensureWorkspaceRunning(): Promise<void> {
  try {
    // 检查容器是否运行
    const checkCmd = await execFileAsync('docker', ['inspect', WORKSPACE_CONTAINER])
    const data = JSON.parse(checkCmd.stdout)
    if (data[0]?.State?.Running) return
  } catch {
    // 容器不存在或命令失败
  }

  // 尝试启动容器
  try {
    await execFileAsync('docker', ['start', WORKSPACE_CONTAINER], { timeout: 5000 })
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch {
    // 容器不存在，创建新的
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
      console.error('工作区启动失败:', e)
      throw e
    }
  }
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(type: string, payload: object): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`
}

// ─── Main agent loop with native function calling ────────────────────────────

export async function POST(req: NextRequest) {
  const { provider, model, apiKey, agentName, task, history, systemBase } = await req.json()

  // 确保工作区容器在运行
  try {
    await ensureWorkspaceRunning()
  } catch (e) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: `工作区启动失败: ${String(e)}` })}\n\n`,
      { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(encoder.encode(s))

      const systemPrompt = [
        systemBase || `你是 ${agentName}，一个自主AI工程师。`,
        '\n你可以使用工具来完成任务：execute_code、write_file、read_file、shell。',
        '\n当前工作目录: /workspace',
        '\n重要：你写的文件和执行的命令都在容器内持久化工作区，其他 AI agent 可以共享你的文件和之前安装的依赖。',
        '\n完成任务后，给出清晰的结论或摘要。',
      ].join('\n')

      push(sseEvent('start', { agent: agentName, task }))

      const MAX_ITERATIONS = 12
      let iteration = 0

      try {
        // ─── CLAUDE (Anthropic) ───────────────────────────────────────────────
        if (provider === 'claude') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default
          const anthropic = new Anthropic({ apiKey })

          const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
            ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
            { role: 'user', content: `任务：${task}` }
          ]

          while (iteration < MAX_ITERATIONS) {
            iteration++
            push(sseEvent('thinking', { agent: agentName, iteration }))

            const response = await anthropic.messages.create({
              model,
              max_tokens: 4096,
              system: systemPrompt,
              tools: getClaudeTools(),
              messages,
            })

            let hasToolUse = false
            const assistantContent: any[] = []

            for (const block of response.content) {
              if (block.type === 'text') {
                if (block.text.trim()) {
                  push(sseEvent('message', { agent: agentName, content: block.text }))
                }
                assistantContent.push(block)
              }
              
              if (block.type === 'tool_use') {
                hasToolUse = true
                push(sseEvent('tool_call', { agent: agentName, tool: block.name, args: block.input }))
                
                const result = await executeTool(block.name, block.input as Record<string, string>)
                push(sseEvent('tool_result', { agent: agentName, tool: block.name, result: result.output }))
                
                assistantContent.push(block)
                messages.push({ role: 'assistant', content: assistantContent })
                messages.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result' as const,
                    tool_use_id: block.id,
                    content: result.output,
                  }]
                })
              }
            }

            if (!hasToolUse) {
              // No tools used, task complete
              const finalText = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
              push(sseEvent('done', { agent: agentName, summary: finalText || '任务完成' }))
              break
            }
          }

        // ─── GROK / XAI (OpenAI-compatible) ────────────────────────────────────
        } else if (provider === 'xai') {
          const OpenAI = (await import('openai')).default
          const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' })

          const messages: Array<{ role: any; content?: string; tool_calls?: any; tool_call_id?: string }> = [
            { role: 'system', content: systemPrompt },
            ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
            { role: 'user', content: `任务：${task}` }
          ]

          while (iteration < MAX_ITERATIONS) {
            iteration++
            push(sseEvent('thinking', { agent: agentName, iteration }))

            const response = await openai.chat.completions.create({
              model,
              messages: messages as any,
              tools: getOpenAITools(),
              tool_choice: 'auto',
            })

            const msg = response.choices[0].message

            if (msg.content) {
              push(sseEvent('message', { agent: agentName, content: msg.content }))
            }

            if (msg.tool_calls && msg.tool_calls.length > 0) {
              messages.push(msg as any)

              for (const tc of msg.tool_calls) {
                if (tc.type !== 'function') continue
                const args = JSON.parse(tc.function.arguments)
                push(sseEvent('tool_call', { agent: agentName, tool: tc.function.name, args }))
                
                const result = await executeTool(tc.function.name, args)
                push(sseEvent('tool_result', { agent: agentName, tool: tc.function.name, result: result.output }))
                
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: result.output,
                } as any)
              }
            } else {
              // No tool calls, task complete
              push(sseEvent('done', { agent: agentName, summary: msg.content || '任务完成' }))
              break
            }
          }

        // ─── GEMINI (Google) ───────────────────────────────────────────────────
        } else if (provider === 'gemini') {
          const { GoogleGenerativeAI } = await import('@google/generative-ai')
          const genAI = new GoogleGenerativeAI(apiKey)
          const gemini = genAI.getGenerativeModel({
            model,
            tools: getGeminiTools(),
            systemInstruction: systemPrompt,
          })

          const chat = gemini.startChat({
            history: (history || []).map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }))
          })

          while (iteration < MAX_ITERATIONS) {
            iteration++
            push(sseEvent('thinking', { agent: agentName, iteration }))

            const result = await chat.sendMessage(`任务：${task}`)
            const response = result.response

            const textParts = response.candidates?.[0]?.content?.parts?.filter((p: any) => p.text) || []
            for (const part of textParts) {
              if (part.text?.trim()) {
                push(sseEvent('message', { agent: agentName, content: part.text }))
              }
            }

            const functionCalls = response.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall) || []

            if (functionCalls.length > 0) {
              const functionResponses = []

              for (const fc of functionCalls) {
                if (!fc.functionCall) continue
                const { name, args } = fc.functionCall
                push(sseEvent('tool_call', { agent: agentName, tool: name, args }))
                
                const result = await executeTool(name, args as Record<string, string>)
                push(sseEvent('tool_result', { agent: agentName, tool: name, result: result.output }))
                
                functionResponses.push({
                  functionResponse: {
                    name,
                    response: { output: result.output }
                  }
                })
              }

              // Send tool results back to model
              await chat.sendMessage(functionResponses as any)
            } else {
              // No function calls, task complete
              const finalText = textParts.map((p: any) => p.text).join('\n')
              push(sseEvent('done', { agent: agentName, summary: finalText || '任务完成' }))
              break
            }
          }

        // ─── FALLBACK: XML parsing (for unknown providers) ────────────────────
        } else {
          // Keep old XML-based implementation as fallback
          push(sseEvent('error', { agent: agentName, message: `不支持的 provider: ${provider}。请使用 claude, xai, 或 gemini` }))
        }

        if (iteration >= MAX_ITERATIONS) {
          push(sseEvent('done', { agent: agentName, summary: `已达到最大迭代次数 (${MAX_ITERATIONS})` }))
        }

      } catch (error) {
        push(sseEvent('error', { agent: agentName, message: String(error) }))
      }

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
