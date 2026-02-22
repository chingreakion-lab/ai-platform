interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function callAI(
  provider: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  if (provider === 'gemini') {
    return callGemini(model, apiKey, messages, systemPrompt)
  } else if (provider === 'claude') {
    return callClaude(model, apiKey, messages, systemPrompt)
  } else if (provider === 'xai') {
    return callXAI(model, apiKey, messages, systemPrompt)
  }
  throw new Error(`Unknown provider: ${provider}`)
}

async function callGemini(model: string, apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  
  const body: Record<string, unknown> = { contents }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text
}

async function callClaude(model: string, apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    messages,
  }
  if (systemPrompt) body.system = systemPrompt
  
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content[0].text
}

async function callXAI(model: string, apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const allMessages = systemPrompt 
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages
    
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages: allMessages, max_tokens: 2048 }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.choices[0].message.content
}

// Gemini Vision for supervisor
export async function analyzeScreenshot(imageBase64: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/png', data: imageBase64 } }
        ]
      }]
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text
}
