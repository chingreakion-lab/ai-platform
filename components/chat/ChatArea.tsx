"use client"
import { useState, useRef, useEffect } from 'react'
import { Message, AIFriend } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, Paperclip, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

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
    <div className="flex flex-col h-full bg-white">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">
              <div className="text-4xl mb-3">💬</div>
              <div>暂无消息，开始对话吧</div>
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            const member = members?.find(m => m.id === msg.senderId)
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
                <div className={`max-w-[70%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-2 text-xs text-gray-400 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="font-medium">{msg.senderName}</span>
                    <span>{format(msg.timestamp, 'HH:mm')}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-blue-500 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
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
