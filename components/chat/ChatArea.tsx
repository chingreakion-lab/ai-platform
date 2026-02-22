"use client"
import { useState, useRef, useEffect, useCallback } from 'react'
import { Message, AIFriend } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, Paperclip, Loader2, Play, Copy, Check, Terminal } from 'lucide-react'
import { format } from 'date-fns'

interface CodeBlock {
  language: string
  code: string
}

interface ExecutionResult {
  output: string
  exitCode: number
  error: string | null
  language?: string
}

// Parse message content into text segments and code blocks
function parseContent(content: string): Array<{ type: 'text' | 'code'; value: string; language: string }> {
  const parts: Array<{ type: 'text' | 'code'; value: string; language: string }> = []
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index), language: '' })
    }
    parts.push({ type: 'code', value: match[2].trim(), language: match[1] || 'text' })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex), language: '' })
  }

  return parts
}

// Inline code block with run button
function CodeBlock({ language, code }: CodeBlock) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const RUNNABLE = ['python', 'python3', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'shell', 'ruby', 'go']
  const canRun = RUNNABLE.includes(language.toLowerCase())

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ output: '', exitCode: -1, error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-gray-700 bg-[#1e1e1e] text-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{language || 'code'}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-600"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {copied ? '已复制' : '复制'}
          </button>
          {canRun && (
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-2 py-0.5 rounded transition-colors"
            >
              {running
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Play className="h-3 w-3" />}
              {running ? '运行中...' : '▶ 运行'}
            </button>
          )}
        </div>
      </div>

      {/* Code */}
      <pre className="p-3 overflow-x-auto text-gray-200 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>

      {/* Execution result */}
      {result && (
        <div className={`border-t ${result.exitCode === 0 ? 'border-green-800 bg-[#0d1f0d]' : 'border-red-800 bg-[#1f0d0d]'}`}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-700">
            <Terminal className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-400">
              输出
              {result.exitCode !== 0 && (
                <span className="ml-2 text-red-400">退出码 {result.exitCode}</span>
              )}
            </span>
          </div>
          <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
            {result.output
              ? <span className="text-green-300">{result.output}</span>
              : null}
            {result.error && result.exitCode !== 0
              ? <span className="text-red-400">{result.error}</span>
              : null}
            {!result.output && !result.error
              ? <span className="text-gray-500">(无输出)</span>
              : null}
          </pre>
        </div>
      )}
    </div>
  )
}

// Render message content with code blocks
function MessageContent({ content }: { content: string }) {
  const parts = parseContent(content)
  return (
    <div>
      {parts.map((part, i) => {
        if (part.type === 'code') {
          return <CodeBlock key={i} language={part.language} code={part.value} />
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.value}
          </p>
        )
      })}
    </div>
  )
}

interface ChatAreaProps {
  messages: Message[]
  onSendMessage: (content: string, files?: File[]) => Promise<void>
  members?: AIFriend[]
  placeholder?: string
  isLoading?: boolean
}

export function ChatArea({ messages, onSendMessage, members, placeholder, isLoading }: ChatAreaProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async () => {
    if (!input.trim() && files.length === 0) return
    const content = input.trim()
    setInput('')
    const currentFiles = [...files]
    setFiles([])
    setLoading(true)
    try {
      await onSendMessage(content, currentFiles.length > 0 ? currentFiles : undefined)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">
              <div className="text-4xl mb-3">💬</div>
              <div>暂无消息，开始对话吧</div>
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            const isSandbox = msg.senderId === 'system'
            const member = members?.find(m => m.id === msg.senderId)

            // Sandbox execution result: center-aligned system message
            if (isSandbox) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="max-w-[85%] rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-600 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                      <Terminal className="h-3 w-3 text-gray-500" />
                      <span className="font-medium text-gray-500">{msg.senderName}</span>
                      <span className="text-gray-400">{format(msg.timestamp, 'HH:mm')}</span>
                    </div>
                    <div className="px-3 py-2">
                      <MessageContent content={msg.content} />
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <Avatar className="h-8 w-8 shrink-0 mt-1">
                  <AvatarFallback
                    style={{ backgroundColor: isUser ? '#3b82f6' : (member?.avatar || '#6366f1') }}
                    className="text-white text-xs font-bold"
                  >
                    {isUser ? '我' : (msg.senderName?.[0]?.toUpperCase() || 'A')}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-2 text-xs text-gray-400 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="font-medium">{msg.senderName}</span>
                    <span>{format(msg.timestamp, 'HH:mm')}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? 'bg-blue-500 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                    {msg.attachments?.map(att => (
                      <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                        className="block mt-1 text-xs underline opacity-80">
                        📎 {att.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
          {(loading || isLoading) && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-gray-200">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{animationDelay:'0.2s'}}>●</span>
                <span className="animate-pulse" style={{animationDelay:'0.4s'}}>●</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {files.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap border-t bg-gray-50">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 bg-white border rounded px-2 py-1 text-xs shadow-sm">
              <span>📎 {f.name}</span>
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t p-3 bg-white">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
          <Button variant="ghost" size="icon" className="shrink-0 text-gray-400 hover:text-gray-600"
            onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={e => { composingRef.current = false; setInput((e.target as HTMLTextAreaElement).value) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || '输入消息... (Enter 发送，Shift+Enter 换行)'}
            className="min-h-[44px] max-h-[200px] resize-none border-gray-200 focus:border-blue-300"
            rows={1}
          />
          <Button size="icon" className="shrink-0 bg-blue-500 hover:bg-blue-600"
            onClick={handleSubmit}
            disabled={loading || isLoading || (!input.trim() && files.length === 0)}>
            {loading || isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
