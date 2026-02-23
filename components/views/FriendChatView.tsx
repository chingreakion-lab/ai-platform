"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Edit, Send, ChevronLeft } from 'lucide-react'
import { Conversation, AIFriend } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

interface FriendChatViewProps {
  conversation: Conversation
  friend: AIFriend
  onBack?: () => void
}

export function FriendChatView({ conversation, friend, onBack }: FriendChatViewProps) {
  const {
    addConversationMessage,
    renameConversation,
    setActiveView,
    addTask,
    addLog,
  } = useAppStore()

  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(conversation.name)
  const [isLoadingAgent, setIsLoadingAgent] = useState(false)

  // Run as ReAct agent via SSE stream
  const runAgent = async (task: string) => {
    const taskId = addTask({
      title: `${friend.name} 🤖 Agent 运行中`,
      description: task.slice(0, 40),
      status: 'running',
    })

    const systemBase = `你是 ${friend.name}，${friend.description}。你是一个能自主完成任务的AI工程师，可以写代码、执行、查看结果、反复迭代直到完成任务。`

    try {
      setIsLoadingAgent(true)
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: friend.provider,
          model: friend.model,
          apiKey: friend.apiKey,
          agentName: friend.name,
          task,
          history: conversation.messages.map(m => ({ role: m.role, content: m.content })),
          systemBase,
          conversationId: conversation.id,
        }),
      })

      if (!res.ok) {
        addLog({ level: 'error', message: `${friend.name} Agent 执行失败：${res.statusText}` })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      let fullContent = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        fullContent += chunk

        // Parse SSE events
        const lines = fullContent.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim()
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5))

              if (data.type === 'thinking' || data.type === 'message') {
                addConversationMessage(conversation.id, {
                  role: 'assistant',
                  content: data.content,
                  senderId: friend.id,
                  senderName: friend.name,
                  attachments: [],
                })
              }

              if (data.type === 'completed') {
                addLog({ level: 'success', message: `${friend.name} Agent 任务完成` })
              }

              if (data.type === 'error') {
                addLog({ level: 'error', message: `${friend.name} Agent 错误：${data.error}` })
              }
            } catch {}
          }
        }

        fullContent = lines[lines.length - 1]
      }
    } catch (err) {
      addLog({ level: 'error', message: `${friend.name} Agent 执行异常：${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      setIsLoadingAgent(false)
    }
  }

  const handleRename = () => {
    if (newName.trim() && newName !== conversation.name) {
      renameConversation(conversation.id, newName)
    }
    setIsRenaming(false)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Avatar className="h-8 w-8">
            <AvatarFallback style={{ backgroundColor: friend.avatar }} className="text-white text-xs font-bold">
              {friend.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex gap-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                  className="h-7 text-sm"
                  autoFocus
                />
                <Button size="sm" onClick={handleRename}>
                  保存
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h2 className="font-semibold text-sm text-gray-800">{conversation.name}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsRenaming(true)}
                >
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-500">{friend.description}</p>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden">
        <ChatArea
          messages={conversation.messages}
          members={[friend]}
          placeholder="输入消息或以 /agent 开头触发 Agent..."
          isLoading={isLoadingAgent}
          onSendMessage={async (content) => {
            const isCommand = content.startsWith('/agent ')
            const actualContent = isCommand ? content.slice(6).trim() : content

            addConversationMessage(conversation.id, {
              role: 'user',
              content: actualContent,
              senderId: 'user',
              senderName: '你',
              attachments: [],
            })

            if (isCommand) {
              await runAgent(actualContent)
            }
          }}
        />
      </div>
    </div>
  )
}
