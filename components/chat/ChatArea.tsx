"use client"
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Message, AIFriend } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, Paperclip, Loader2, Play, Copy, Check, Terminal } from 'lucide-react'
import { format } from 'date-fns'

interface ExecutionResult {
  output: string
  exitCode: number
  error: string | null
  language?: string
}

const RUNNABLE = new Set(['python', 'python3', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'shell', 'ruby', 'go'])

function RunnableCodeBlock({ language, code }: { language: string; code: string }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [copied, setCopied] = useState(false)
  const canRun = RUNNABLE.has(language.toLowerCase())

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })
      setResult(await res.json())
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
    <div className="my-2.5 rounded-xl overflow-hidden border border-[#2d2d2d] text-sm not-prose">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b]">
        <span className="text-xs text-[#7a8499] font-mono select-none">{language || 'text'}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-[#7a8499] hover:text-[#abb2bf] transition-colors px-1.5 py-0.5 rounded hover:bg-[#2c313a]">
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          {canRun && (
            <button onClick={handleRun} disabled={running}
              className="flex items-center gap-1 text-xs bg-[#528bff] hover:bg-[#4d84f5] disabled:opacity-40 text-white px-2.5 py-0.5 rounded transition-colors font-medium">
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>{running ? '运行中...' : '运行'}</span>
            </button>
          )}
        </div>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.775rem', lineHeight: '1.6', background: '#282c34', padding: '12px 16px' }}
        showLineNumbers={code.split('\n').length > 4}
        lineNumberStyle={{ color: '#4b5263', fontSize: '0.7rem', minWidth: '2.2em', userSelect: 'none' }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
      {result && (
        <div className={`border-t ${result.exitCode === 0 ? 'border-[#1a3a1a] bg-[#0d1a0d]' : 'border-[#3a1a1a] bg-[#1a0d0d]'}`}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#2d2d2d]">
            <Terminal className="h-3 w-3 text-[#7a8499]" />
            <span className="text-xs text-[#7a8499] font-mono">
              输出{result.exitCode !== 0 && <span className="ml-2 text-red-400">退出码 {result.exitCode}</span>}
            </span>
          </div>
          <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-48">
            {result.output ? <span className="text-green-300">{result.output}</span> : null}
            {result.error && result.exitCode !== 0 ? <span className="text-red-400">{result.error}</span> : null}
            {!result.output && !result.error ? <span className="text-[#4b5263]">(无输出)</span> : null}
          </pre>
        </div>
      )}
    </div>
  )
}

function MarkdownContent({ content, isUser }: { content: string; isUser?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) { return <>{children}</> },
        code({ className, children }: { className?: string; children?: React.ReactNode }) {
          const match = /language-(\w+)/.exec(className || '')
          const code = String(children).replace(/\n$/, '')
          if (match) return <RunnableCodeBlock language={match[1]} code={code} />
          return (
            <code className={`px-1.5 py-0.5 rounded text-[0.85em] font-mono ${isUser ? 'bg-blue-400/30 text-blue-50' : 'bg-gray-100 text-rose-600'}`}>
              {children}
            </code>
          )
        },
        p({ children }) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p> },
        h1({ children }) { return <h1 className="text-base font-bold mb-2 mt-3 first:mt-0 pb-1 border-b border-gray-200">{children}</h1> },
        h2({ children }) { return <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0">{children}</h2> },
        h3({ children }) { return <h3 className="text-sm font-semibold mb-1.5 mt-2 first:mt-0">{children}</h3> },
        ul({ children }) { return <ul className="list-disc pl-5 space-y-0.5 mb-2">{children}</ul> },
        ol({ children }) { return <ol className="list-decimal pl-5 space-y-0.5 mb-2">{children}</ol> },
        li({ children }) { return <li className="leading-relaxed">{children}</li> },
        blockquote({ children }) {
          return <blockquote className={`border-l-4 pl-3 my-2 italic ${isUser ? 'border-blue-300/50 text-blue-100/80' : 'border-gray-300 text-gray-500'}`}>{children}</blockquote>
        },
        table({ children }) {
          return <div className="overflow-x-auto my-2 rounded-lg border border-gray-200"><table className="min-w-full text-xs border-collapse">{children}</table></div>
        },
        thead({ children }) { return <thead className="bg-gray-50">{children}</thead> },
        th({ children }) { return <th className="border-b border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">{children}</th> },
        td({ children }) { return <td className="border-b border-gray-100 px-3 py-1.5">{children}</td> },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noreferrer" className={`underline underline-offset-2 ${isUser ? 'text-blue-100' : 'text-blue-500 hover:text-blue-700'}`}>{children}</a>
        },
        strong({ children }) { return <strong className="font-semibold">{children}</strong> },
        em({ children }) { return <em className="italic">{children}</em> },
        hr() { return <hr className={`my-3 ${isUser ? 'border-blue-400/30' : 'border-gray-200'}`} /> },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function StreamingCursor() {
  return <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle opacity-60" />
}

interface ChatAreaProps {
  messages: Message[]
  onSendMessage: (content: string, files?: File[]) => Promise<void>
  members?: AIFriend[]
  placeholder?: string
  isLoading?: boolean
  streamingMessageId?: string | null
}

export function ChatArea({ messages, onSendMessage, members, placeholder, isLoading, streamingMessageId }: ChatAreaProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-4 px-4 space-y-1 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-20 select-none">
              <div className="text-5xl mb-3 opacity-40">💬</div>
              <p className="text-sm font-medium text-gray-400">暂无消息</p>
              <p className="text-xs text-gray-300 mt-1">发送消息开始对话</p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            const isSystem = msg.senderId === 'system'
            const member = members?.find(m => m.id === msg.senderId)
            const isStreaming = streamingMessageId === msg.id

            if (isSystem) {
              return (
                <div key={msg.id} className="flex items-center gap-2 py-0.5 px-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 shrink-0 max-w-[75%]">
                    <span className="font-medium text-gray-500 shrink-0">{msg.senderName}</span>
                    <span className="text-gray-200">·</span>
                    <span className="truncate font-mono">{msg.content}</span>
                    <span className="text-gray-300 shrink-0 tabular-nums">{format(msg.timestamp, 'HH:mm')}</span>
                  </div>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )
            }

            const avatarColor = isUser ? '#3b82f6' : (member?.avatar || '#6366f1')
            const avatarLabel = isUser ? '我' : (msg.senderName?.[0]?.toUpperCase() || 'A')

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                <Avatar className="h-7 w-7 shrink-0 mt-1.5 ring-2 ring-white shadow-sm">
                  <AvatarFallback style={{ backgroundColor: avatarColor }} className="text-white text-[11px] font-bold">
                    {avatarLabel}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[78%] flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] text-gray-400 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="font-medium">{msg.senderName}</span>
                    <span className="tabular-nums">{format(msg.timestamp, 'HH:mm')}</span>
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-blue-500 text-white rounded-tr-sm'
                      : 'bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100'
                  }`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : (
                      <MarkdownContent content={msg.content} isUser={false} />
                    )}
                    {isStreaming && <StreamingCursor />}
                    {msg.attachments?.map(att => (
                      <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-1.5 mt-1.5 text-xs underline underline-offset-1 ${isUser ? 'text-blue-100' : 'text-blue-500'}`}>
                        <Paperclip className="h-3 w-3 shrink-0" />{att.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {(loading || isLoading) && !streamingMessageId && (
            <div className="flex gap-2.5">
              <Avatar className="h-7 w-7 shrink-0 mt-1.5 ring-2 ring-white shadow-sm">
                <AvatarFallback className="bg-gray-100">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {files.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap border-t bg-gray-50">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white border rounded-full px-2.5 py-1 text-xs shadow-sm text-gray-600">
              <Paperclip className="h-3 w-3 text-gray-400" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition-colors ml-0.5 text-base leading-none">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t bg-white p-3">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-gray-400 hover:text-gray-600 rounded-xl" onClick={() => fileRef.current?.click()} title="上传文件">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={e => { composingRef.current = false; setInput((e.target as HTMLTextAreaElement).value) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? '发送消息... (Enter 发送，Shift+Enter 换行)'}
            className="min-h-[40px] max-h-[160px] resize-none rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 transition-colors text-sm"
            rows={1}
          />
          <Button size="icon" className="shrink-0 h-9 w-9 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 transition-all" onClick={handleSubmit}
            disabled={loading || isLoading || (!input.trim() && files.length === 0)}>
            {loading || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
