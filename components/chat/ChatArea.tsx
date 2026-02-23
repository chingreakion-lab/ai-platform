"use client"
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Message, AIFriend } from '@/lib/types'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <div style={{ margin: '10px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #262736', fontSize: 13 }} className="not-prose">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#1a1b2e' }}>
        <span style={{ fontSize: 11, color: '#8e9299', fontFamily: 'monospace', userSelect: 'none' }}>{language || 'text'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: copied ? '#22c55e' : '#8e9299', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
          >
            {copied ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
            {copied ? '已复制' : '复制'}
          </button>
          {canRun && (
            <button
              onClick={handleRun}
              disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#fff', background: running ? 'rgba(66,133,244,0.4)' : '#4285f4', border: 'none', cursor: running ? 'not-allowed' : 'pointer', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}
            >
              {running ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Play style={{ width: 11, height: 11 }} />}
              {running ? '运行中...' : '运行'}
            </button>
          )}
        </div>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.775rem', lineHeight: '1.6', background: '#161724', padding: '12px 16px' }}
        showLineNumbers={code.split('\n').length > 4}
        lineNumberStyle={{ color: '#3a3b4e', fontSize: '0.7rem', minWidth: '2.2em', userSelect: 'none' }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
      {result && (
        <div style={{ borderTop: `1px solid ${result.exitCode === 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, background: result.exitCode === 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid #262736' }}>
            <Terminal style={{ width: 11, height: 11, color: '#8e9299' }} />
            <span style={{ fontSize: 11, color: '#8e9299', fontFamily: 'monospace' }}>
              输出{result.exitCode !== 0 && <span style={{ marginLeft: 8, color: '#f87171' }}>退出码 {result.exitCode}</span>}
            </span>
          </div>
          <pre style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 192, margin: 0 }}>
            {result.output ? <span style={{ color: '#86efac' }}>{result.output}</span> : null}
            {result.error && result.exitCode !== 0 ? <span style={{ color: '#f87171' }}>{result.error}</span> : null}
            {!result.output && !result.error ? <span style={{ color: '#3a3b4e' }}>(无输出)</span> : null}
          </pre>
        </div>
      )}
    </div>
  )
}

// Role color for left border
function getRoleBorderColor(senderName?: string): string | undefined {
  if (!senderName) return undefined
  if (senderName.includes('监工')) return '#a855f7'
  if (senderName.includes('前端')) return '#3b82f6'
  if (senderName.includes('后端')) return '#22c55e'
  return undefined
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
            <code style={{
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: '0.85em',
              fontFamily: 'monospace',
              background: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(66,133,244,0.12)',
              color: isUser ? '#fff' : '#93bbfc',
            }}>
              {children}
            </code>
          )
        },
        p({ children }) { return <p style={{ marginBottom: 6, lineHeight: 1.6 }}>{children}</p> },
        h1({ children }) { return <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 12, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{children}</h1> },
        h2({ children }) { return <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, marginTop: 10 }}>{children}</h2> },
        h3({ children }) { return <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, marginTop: 8 }}>{children}</h3> },
        ul({ children }) { return <ul style={{ paddingLeft: 20, marginBottom: 6 }}>{children}</ul> },
        ol({ children }) { return <ol style={{ paddingLeft: 20, marginBottom: 6 }}>{children}</ol> },
        li({ children }) { return <li style={{ marginBottom: 2, lineHeight: 1.6 }}>{children}</li> },
        blockquote({ children }) {
          return (
            <blockquote style={{
              borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,0.4)' : '#4285f4'}`,
              paddingLeft: 10,
              margin: '6px 0',
              opacity: 0.8,
              fontStyle: 'italic',
            }}>
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto', margin: '8px 0', borderRadius: 8, border: '1px solid #262736' }}>
              <table style={{ minWidth: '100%', fontSize: 12, borderCollapse: 'collapse' }}>{children}</table>
            </div>
          )
        },
        thead({ children }) { return <thead style={{ background: 'rgba(255,255,255,0.04)' }}>{children}</thead> },
        th({ children }) { return <th style={{ borderBottom: '1px solid #262736', padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#e8e9f0' }}>{children}</th> },
        td({ children }) { return <td style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '6px 12px' }}>{children}</td> },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: isUser ? '#bfdbfe' : '#4285f4', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {children}
            </a>
          )
        },
        strong({ children }) { return <strong style={{ fontWeight: 700 }}>{children}</strong> },
        em({ children }) { return <em style={{ fontStyle: 'italic' }}>{children}</em> },
        hr() { return <hr style={{ margin: '10px 0', borderColor: 'rgba(255,255,255,0.08)' }} /> },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function StreamingCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 16,
        background: '#4285f4',
        marginLeft: 4,
        verticalAlign: 'middle',
        borderRadius: 2,
      }}
      className="animate-pulse"
    />
  )
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

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

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

  const hasContent = input.trim().length > 0 || files.length > 0
  const isBusy = loading || isLoading

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0e0f1a' }}>
      {/* Message list */}
      <ScrollArea className="flex-1 min-h-0">
        <div style={{ padding: '16px 0', maxWidth: 896, margin: '0 auto' }} className="px-4 space-y-1">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0', userSelect: 'none' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>💬</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.2)' }}>暂无消息</p>
              <p style={{ fontSize: 12, marginTop: 4, color: 'rgba(255,255,255,0.12)' }}>发送消息开始对话</p>
            </div>
          )}

          {messages.map(msg => {
            const isUser = msg.role === 'user'
            const isSystem = msg.senderId === 'system'
            const member = members?.find(m => m.id === msg.senderId)
            const isStreaming = streamingMessageId === msg.id
            const roleBorderColor = !isUser && !isSystem ? getRoleBorderColor(msg.senderName) : undefined

            if (isSystem) {
              return (
                <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
                  <div style={{ flex: 1, height: 1, background: '#262736' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8e9299', flexShrink: 0, maxWidth: '75%' }}>
                    <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{msg.senderName}</span>
                    <span style={{ color: '#262736' }}>·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{msg.content}</span>
                    <span style={{ color: '#8e9299', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{format(msg.timestamp, 'HH:mm')}</span>
                  </div>
                  <div style={{ flex: 1, height: 1, background: '#262736' }} />
                </div>
              )
            }

            const avatarColor = isUser ? '#4285f4' : (member?.avatar || '#6366f1')
            const avatarLabel = isUser ? '我' : (msg.senderName?.[0]?.toUpperCase() || 'A')

            return (
              <div key={msg.id} style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row', padding: '2px 0' }}>
                {/* Avatar */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    marginTop: 6,
                  }}
                >
                  {avatarLabel}
                </div>

                {/* Bubble */}
                <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  {/* Sender + time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8e9299', padding: '0 4px', flexDirection: isUser ? 'row-reverse' : 'row' }}>
                    <span style={{ fontWeight: 500 }}>{msg.senderName}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format(msg.timestamp, 'HH:mm')}</span>
                  </div>

                  {/* Message content */}
                  <div
                    style={{
                      borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      padding: '10px 14px',
                      fontSize: 13,
                      lineHeight: 1.6,
                      background: isUser ? '#4285f4' : '#161724',
                      color: isUser ? '#fff' : 'rgba(232,233,240,0.9)',
                      border: isUser ? 'none' : `1px solid #262736`,
                      borderLeft: roleBorderColor ? `4px solid ${roleBorderColor}` : (isUser ? 'none' : '1px solid #262736'),
                    }}
                  >
                    {isUser ? (
                      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
                    ) : (
                      <MarkdownContent content={msg.content} isUser={false} />
                    )}
                    {isStreaming && <StreamingCursor />}

                    {/* Attachments */}
                    {msg.attachments?.map(att => (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 6,
                          fontSize: 12,
                          color: isUser ? 'rgba(255,255,255,0.8)' : '#4285f4',
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        <Paperclip style={{ width: 12, height: 12, flexShrink: 0 }} />
                        {att.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Loading dots */}
          {isBusy && !streamingMessageId && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#161724', border: '1px solid #262736', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 6 }}>
                <Loader2 style={{ width: 13, height: 13, color: '#8e9299' }} className="animate-spin" />
              </div>
              <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: '4px 16px 16px 16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8e9299', display: 'inline-block' }} className="animate-bounce" />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8e9299', display: 'inline-block', animationDelay: '150ms' }} className="animate-bounce" />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8e9299', display: 'inline-block', animationDelay: '300ms' }} className="animate-bounce" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* File preview strip */}
      {files.length > 0 && (
        <div style={{ padding: '8px 16px', background: 'rgba(14,15,26,0.8)', borderTop: '1px solid #262736', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#161724',
                border: '1px solid #262736',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 12,
                color: '#8e9299',
              }}
            >
              <Paperclip style={{ width: 11, height: 11, color: '#8e9299' }} />
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                style={{ color: '#8e9299', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, fontSize: 14, padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: 16, background: 'rgba(14,15,26,0.8)', backdropFilter: 'blur(8px)', borderTop: '1px solid #262736' }}>
        <div style={{ maxWidth: 896, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #262736',
              borderRadius: 16,
              padding: 8,
              transition: 'border-color 0.2s',
            }}
            onFocus={() => {}}
          >
            {/* File attach button */}
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="上传文件"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8e9299',
                flexShrink: 0,
              }}
            >
              <Paperclip style={{ width: 16, height: 16 }} />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={e => { composingRef.current = false; setInput((e.target as HTMLTextAreaElement).value) }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? '发送消息... (Enter 发送，Shift+Enter 换行)'}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 14,
                color: '#e8e9f0',
                lineHeight: 1.6,
                minHeight: 32,
                maxHeight: 160,
                padding: '4px 0',
              }}
            />

            {/* Send button */}
            <button
              onClick={handleSubmit}
              disabled={isBusy || (!input.trim() && files.length === 0)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: 'none',
                cursor: (isBusy || !hasContent) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: hasContent && !isBusy ? '#4285f4' : 'transparent',
                color: hasContent && !isBusy ? '#fff' : '#8e9299',
                flexShrink: 0,
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {isBusy ? (
                <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
              ) : (
                <Send style={{ width: 15, height: 15 }} />
              )}
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#8e9299', textAlign: 'center', marginTop: 6 }}>Shift+Enter 换行</p>
        </div>
      </div>
    </div>
  )
}
