import { NextRequest } from 'next/server'
import { executeTool, getClaudeTools, getOpenAITools, getGeminiTools } from '@/lib/agent-tools'

// ── SSE helper ────────────────────────────────────────────────────────────────
function sse(type: string, payload: object): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`
}

// ── Call one AI with native function calling, return full text + tool calls ──
async function runAgent(opts: {
  provider: string
  model: string
  apiKey: string
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  maxIterations?: number
}): Promise<{ text: string; toolsUsed: string[] }> {
  const { provider, model, apiKey, systemPrompt, messages, maxIterations = 8 } = opts
  let history = [...messages]
  let finalText = ''
  const toolsUsed: string[] = []

  for (let i = 0; i < maxIterations; i++) {
    if (provider === 'claude') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: getClaudeTools() as Parameters<typeof client.messages.create>[0]['tools'],
        messages: history as Parameters<typeof client.messages.create>[0]['messages'],
      })

      const textBlocks = res.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n')
      if (textBlocks) finalText = textBlocks

      const toolBlocks = res.content.filter(b => b.type === 'tool_use')
      if (toolBlocks.length === 0 || res.stop_reason === 'end_turn') break

      // Execute tools
      const toolResults = []
      for (const tb of toolBlocks) {
        const block = tb as { type: 'tool_use'; id: string; name: string; input: Record<string, string> }
        toolsUsed.push(block.name)
        const result = await executeTool(block.name, block.input)
        toolResults.push({ type: 'tool_result' as const, tool_use_id: block.id, content: result.output })
      }
      history.push({ role: 'assistant', content: res.content as unknown as string })
      history.push({ role: 'user', content: toolResults as unknown as string })

    } else if (provider === 'xai' || provider === 'openai') {
      const OpenAI = (await import('openai')).default
      const client = new OpenAI({ apiKey, baseURL: provider === 'xai' ? 'https://api.x.ai/v1' : undefined })
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history] as Parameters<typeof client.chat.completions.create>[0]['messages'],
        tools: getOpenAITools(),
        tool_choice: 'auto',
      })
      const msg = res.choices[0].message
      if (msg.content) finalText = msg.content
      if (!msg.tool_calls?.length) break

      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue
        toolsUsed.push(tc.function.name)
        const args = JSON.parse(tc.function.arguments)
        const result = await executeTool(tc.function.name, args)
        history.push({ role: 'assistant', content: msg.content || '' })
        history.push({ role: 'tool' as unknown as 'user', content: result.output })
      }

    } else if (provider === 'gemini') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const client = new GoogleGenerativeAI(apiKey)
      const geminiModel = client.getGenerativeModel({ model, systemInstruction: systemPrompt })
      const geminiHistory = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content as string }],
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chat = geminiModel.startChat({ history: geminiHistory, tools: getGeminiTools() as any })
      const res = await chat.sendMessage('')
      const candidate = res.response.candidates?.[0]
      const part = candidate?.content?.parts?.[0]
      if (part?.text) { finalText = part.text; break }
      if (part?.functionCall) {
        toolsUsed.push(part.functionCall.name)
        const result = await executeTool(part.functionCall.name, part.functionCall.args as Record<string, string>)
        history.push({ role: 'assistant', content: '' })
        history.push({ role: 'user', content: result.output })
      } else break
    } else {
      break
    }
  }

  return { text: finalText, toolsUsed }
}

// ── Parse task assignments from supervisor output ─────────────────────────────
function parseSupervisorOutput(text: string): { frontend?: string; backend?: string; rejectFrontend?: string; rejectBackend?: string } {
  const result: { frontend?: string; backend?: string; rejectFrontend?: string; rejectBackend?: string } = {}
  const frontendMatch = text.match(/【前端任务】([\s\S]*?)(?=【|$)/)
  const backendMatch = text.match(/【后端任务】([\s\S]*?)(?=【|$)/)
  const rejectFrontend = text.match(/【打回前端】([\s\S]*?)(?=【|$)/)
  const rejectBackend = text.match(/【打回后端】([\s\S]*?)(?=【|$)/)
  if (frontendMatch) result.frontend = frontendMatch[1].trim()
  if (backendMatch) result.backend = backendMatch[1].trim()
  if (rejectFrontend) result.rejectFrontend = rejectFrontend[1].trim()
  if (rejectBackend) result.rejectBackend = rejectBackend[1].trim()
  return result
}

// ── Main orchestration endpoint ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const {
    userInstruction,
    supervisor,   // { provider, model, apiKey, systemPrompt }
    frontend,     // { provider, model, apiKey, systemPrompt }
    backend,      // { provider, model, apiKey, systemPrompt }
    groupAnnouncement,
    maxRounds = 3,
  } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const push = (chunk: string) => controller.enqueue(encoder.encode(chunk))

      const sharedHistory: Array<{ role: string; content: string }> = []
      sharedHistory.push({ role: 'user', content: userInstruction })

      let frontendSummary = ''
      let backendSummary = ''

      for (let round = 1; round <= maxRounds; round++) {
        push(sse('round_start', { round, maxRounds }))

        // ── Supervisor: analyze & dispatch ──────────────────────────────────
        push(sse('agent_start', { agent: '监工', action: round === 1 ? '分析任务，分配工作' : '审查结果，决定下一步' }))

        const supervisorContext = round === 1
          ? userInstruction
          : `用户原始指令：${userInstruction}\n\n前端完成情况：${frontendSummary || '（尚未开始）'}\n\n后端完成情况：${backendSummary || '（尚未开始）'}\n\n请审查以上完成情况，如果全部通过则总结收工，如果有问题则打回重做。`

        const supervisorMessages = [{ role: 'user', content: supervisorContext }]
        if (groupAnnouncement) {
          supervisorMessages.unshift({ role: 'user', content: `项目背景：${groupAnnouncement}` })
        }

        const supervisorResult = await runAgent({
          provider: supervisor.provider,
          model: supervisor.model,
          apiKey: supervisor.apiKey,
          systemPrompt: supervisor.systemPrompt,
          messages: supervisorMessages,
        })

        push(sse('agent_message', { agent: '监工', content: supervisorResult.text }))
        sharedHistory.push({ role: 'assistant', content: `【监工】${supervisorResult.text}` })

        // Check if supervisor says done
        const isDone = supervisorResult.text.includes('✅') || supervisorResult.text.includes('完成') && !supervisorResult.text.includes('【前端任务】') && !supervisorResult.text.includes('【后端任务】') && round > 1
        if (isDone && round > 1) {
          push(sse('done', { summary: supervisorResult.text }))
          controller.close()
          return
        }

        // Parse task assignments
        const assignments = parseSupervisorOutput(supervisorResult.text)

        // ── Frontend + Backend agents (parallel) ───────────────────────────
        const frontendTask = assignments.frontend || assignments.rejectFrontend
        const backendTask = assignments.backend || assignments.rejectBackend

        const agentTasks: Promise<{ key: 'frontend' | 'backend'; text: string; toolsUsed: string[] }>[] = []

        if (frontendTask && frontend) {
          push(sse('agent_start', { agent: '前端', action: assignments.rejectFrontend ? '修改返工' : '执行前端任务' }))
          agentTasks.push(
            runAgent({
              provider: frontend.provider,
              model: frontend.model,
              apiKey: frontend.apiKey,
              systemPrompt: frontend.systemPrompt,
              messages: [
                ...sharedHistory.filter(m => m.role === 'user').slice(-3),
                { role: 'user', content: frontendTask },
              ],
            }).then(r => ({ key: 'frontend' as const, text: r.text, toolsUsed: r.toolsUsed }))
          )
        }

        if (backendTask && backend) {
          push(sse('agent_start', { agent: '后端', action: assignments.rejectBackend ? '修改返工' : '执行后端任务' }))
          agentTasks.push(
            runAgent({
              provider: backend.provider,
              model: backend.model,
              apiKey: backend.apiKey,
              systemPrompt: backend.systemPrompt,
              messages: [
                ...sharedHistory.filter(m => m.role === 'user').slice(-3),
                { role: 'user', content: backendTask },
              ],
            }).then(r => ({ key: 'backend' as const, text: r.text, toolsUsed: r.toolsUsed }))
          )
        }

        if (agentTasks.length > 1) {
          push(sse('parallel_start', { count: agentTasks.length }))
        }

        const parallelResults = await Promise.all(agentTasks)
        for (const { key, text, toolsUsed } of parallelResults) {
          if (key === 'frontend') {
            frontendSummary = text
            push(sse('agent_message', { agent: '前端', content: text, toolsUsed }))
            sharedHistory.push({ role: 'assistant', content: `【前端】${text}` })
          } else {
            backendSummary = text
            push(sse('agent_message', { agent: '后端', content: text, toolsUsed }))
            sharedHistory.push({ role: 'assistant', content: `【后端】${text}` })
          }
        }

        // If no tasks assigned and it's first round, something went wrong
        if (!frontendTask && !backendTask && round === 1) {
          push(sse('error', { message: '监工未分配任务，请检查监工的 system prompt 是否正确' }))
          break
        }
      }

      push(sse('done', { summary: `已完成 ${maxRounds} 轮协作` }))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
