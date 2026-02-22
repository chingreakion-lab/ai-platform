import { NextRequest, NextResponse } from 'next/server'

async function callGemini(model: string, apiKey: string, messages: {role:string,content:string}[], systemPrompt?: string) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const body: Record<string, unknown> = { contents }
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text
}

async function callClaude(model: string, apiKey: string, messages: {role:string,content:string}[], systemPrompt?: string) {
  const body: Record<string, unknown> = { model, max_tokens: 2048, messages }
  if (systemPrompt) body.system = systemPrompt
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content[0].text
}

async function callXAI(model: string, apiKey: string, messages: {role:string,content:string}[], systemPrompt?: string) {
  const allMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: allMessages, max_tokens: 2048 })
  })
  const data = await res.json()
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'xAI error')
  return data.choices[0].message.content
}

export async function POST(req: NextRequest) {
  try {
    const { provider, model, apiKey, messages, systemPrompt } = await req.json()
    let response: string
    if (provider === 'gemini') response = await callGemini(model, apiKey, messages, systemPrompt)
    else if (provider === 'claude') response = await callClaude(model, apiKey, messages, systemPrompt)
    else if (provider === 'xai') response = await callXAI(model, apiKey, messages, systemPrompt)
    else throw new Error(`Unknown provider: ${provider}`)
    return NextResponse.json({ response })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
