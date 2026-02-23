"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Edit, ChevronLeft } from 'lucide-react'
import { Conversation, AIFriend, Attachment } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

interface FriendChatViewProps {
  conversation: Conversation
  friend: AIFriend
  onBack?: () => void
}

// Memory trigger keywords
const REMEMBER_TRIGGERS = ['记住', '记一下', '记住这个', '记录一下']
const RECALL_TRIGGERS = ['还记得', '你记得', '想起', '之前说过', '我说过']
const shouldRemember = (text: string) => REMEMBER_TRIGGERS.some(t => text.includes(t))
const shouldRecall = (text: string) => RECALL_TRIGGERS.some(t => text.includes(t))

export function FriendChatView({ conversation, friend, onBack }: FriendChatViewProps) {
  const {
    addConversationMessage,
    updateConversationMessage,
    renameConversation,
    addLog,
    addTask,
    updateTask,
    addMemory,
    searchMemories,
  } = useAppStore()

  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(conversation.name)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)

  // Agent 流式运行：所有 message 事件累积到同一个气泡，thinking 事件不插消息
  const runAgent = async (task: string) => {
    const taskId = addTask({
      title: `${friend.name} 🤖 Agent`,
      description: task.slice(0, 40),
      status: 'running',
    })

    const systemBase = `你是 ${friend.name}，${friend.description}。你是一个能自主完成任务的AI工程师，可以写代码、执行、查看结果、反复迭代直到完成任务。`

    // 创建流式占位消息
    const placeholderId = addConversationMessage(conversation.id, {
      role: 'assistant',
      content: '',
      senderId: friend.id,
      senderName: friend.name,
      attachments: [],
    })
    setStreamingMsgId(placeholderId)
    let accContent = ''

    try {
      setIsLoading(true)
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
        }),
      })

      if (!res.ok) {
        const errText = `❌ Agent 请求失败：${res.statusText}`
        updateConversationMessage(conversation.id, placeholderId, errText)
        addLog({ level: 'error', message: `${friend.name} Agent 失败：${res.statusText}` })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE 事件以 \n\n 分隔
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const data = JSON.parse(dataLine.slice(5).trim())

            if (data.type === 'message' && data.content?.trim()) {
              // 累积到同一气泡，段落间加空行
              accContent = accContent
                ? accContent + '\n\n' + data.content
                : data.content
              updateConversationMessage(conversation.id, placeholderId, accContent)
            } else if (data.type === 'thinking') {
              // thinking 只写日志，不插消息
              addLog({ level: 'info', message: `${friend.name} 思考中 (第 ${data.iteration ?? '?'} 轮)...` })
            } else if (data.type === 'tool_call') {
              const tool = data.tool as string
              const args = (data.args as Record<string, string>) || {}
              const label =
                tool === 'execute_code' ? `⚙️ 执行 ${args.language || ''} 代码` :
                tool === 'write_file'   ? `📝 写入 \`${args.path}\`` :
                tool === 'read_file'    ? `📖 读取 \`${args.path}\`` :
                tool === 'shell'        ? `💻 \`${(args.command || args.cmd || '').slice(0, 60)}\`` :
                `🔧 ${tool}`
              addConversationMessage(conversation.id, {
                role: 'assistant', content: label,
                senderId: 'system', senderName: friend.name, attachments: [],
              })
              addLog({ level: 'info', message: `${friend.name} → ${label}` })
            } else if (data.type === 'tool_result') {
              const result = (data.result as string) || ''
              addLog({
                level: result.startsWith('❌') ? 'error' : 'success',
                message: `[${data.tool}] ${result.slice(0, 120)}${result.length > 120 ? '...' : ''}`
              })
            } else if (data.type === 'done') {
              const summary = (data.summary as string) || ''
              if (summary.trim() && summary !== accContent) {
                // 任务完成摘要与流式内容不同时才追加
                const finalContent = accContent
                  ? accContent + '\n\n✅ **任务完成**\n' + summary
                  : '✅ **任务完成**\n' + summary
                updateConversationMessage(conversation.id, placeholderId, finalContent)
              }
              updateTask(taskId, { status: 'done', result: '完成' })
              addLog({ level: 'success', message: `${friend.name} Agent 任务完成` })
            } else if (data.type === 'error') {
              const errMsg = (data.message || data.error || '未知错误') as string
              const errContent = (accContent ? accContent + '\n\n' : '') + `❌ ${errMsg}`
              updateConversationMessage(conversation.id, placeholderId, errContent)
              updateTask(taskId, { status: 'failed', result: errMsg })
              addLog({ level: 'error', message: `${friend.name} Agent 错误：${errMsg}` })
            }
          } catch { /* skip malformed lines */ }
        }
      }

      // 如果全程没有任何内容，填一个提示
      if (!accContent) {
        updateConversationMessage(conversation.id, placeholderId, '（Agent 执行完毕，无文字输出）')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      const errContent = (accContent ? accContent + '\n\n' : '') + `❌ 执行异常：${msg}`
      updateConversationMessage(conversation.id, placeholderId, errContent)
      updateTask(taskId, { status: 'failed', result: msg })
      addLog({ level: 'error', message: `${friend.name} Agent 异常：${msg}` })
    } finally {
      setIsLoading(false)
      setStreamingMsgId(null)
    }
  }

  const runChat = async (content: string, systemExtra?: string) => {
    setIsLoading(true)
    try {
      const history = conversation.messages.map(m => ({ role: m.role, content: m.content }))
      const systemPrompt = `你是 ${friend.name}。${friend.description}${systemExtra ?? ''}`
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: friend.provider,
          model: friend.model,
          apiKey: friend.apiKey,
          messages: [...history, { role: 'user', content }],
          systemPrompt,
        }),
      })
      const data = await res.json()
      const reply = data.response ?? data.content ?? data.message ?? '...'
      addConversationMessage(conversation.id, {
        role: 'assistant',
        content: reply,
        senderId: friend.id,
        senderName: friend.name,
        attachments: [],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      addConversationMessage(conversation.id, {
        role: 'assistant', content: `❌ 回复失败：${msg}`,
        senderId: friend.id, senderName: friend.name, attachments: [],
      })
      addLog({ level: 'error', message: `${friend.name} 回复失败` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRename = () => {
    if (newName.trim() && newName !== conversation.name) {
      renameConversation(conversation.id, newName)
    }
    setIsRenaming(false)
  }

  const handleSendMessage = async (content: string, files?: File[]) => {
    const isAgentMode = content.startsWith('/agent ')
    const actualContent = isAgentMode ? content.slice(7).trim() : content

    // 上传附件到 R2
    let attachments: Attachment[] = []
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          const data = await res.json()
          if (data.url) {
            attachments.push({ id: uuidv4(), name: file.name, url: data.url, type: file.type, size: file.size })
          }
        } catch {
          addLog({ level: 'error', message: `文件上传失败: ${file.name}` })
        }
      }
    }

    // Handle memory: store
    if (!isAgentMode && shouldRemember(actualContent)) {
      const memContent = actualContent
        .replace(/记住这个[：:]?\s*|记住[：:]?\s*|记一下[：:]?\s*|记录一下[：:]?\s*/g, '')
        .trim()

      addConversationMessage(conversation.id, {
        role: 'user', content: actualContent,
        senderId: 'user', senderName: '你', attachments: [],
      })

      if (memContent) {
        addMemory({
          friendId: friend.id,
          content: memContent,
          summary: memContent.slice(0, 60),
          tags: memContent.split(/[\s，,、]+/).filter(t => t.length > 1 && t.length < 10).slice(0, 5),
          sourceConvId: conversation.id,
        })
        addConversationMessage(conversation.id, {
          role: 'assistant',
          content: `✅ 已记住：${memContent.slice(0, 60)}${memContent.length > 60 ? '...' : ''}`,
          senderId: friend.id, senderName: friend.name, attachments: [],
        })
      }
      return
    }

    // Store user message
    addConversationMessage(conversation.id, {
      role: 'user', content: actualContent,
      senderId: 'user', senderName: '你',
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    if (isAgentMode) {
      await runAgent(actualContent)
    } else {
      // Handle memory: recall — inject relevant memories into system prompt
      let memoryContext = ''
      if (shouldRecall(actualContent)) {
        const relevantMemories = searchMemories(friend.id, actualContent)
        if (relevantMemories.length > 0) {
          memoryContext = '\n\n【用户记忆】以下是你关于该用户的记忆，请基于这些信息回答：\n' +
            relevantMemories.map(m => `- ${m.content}`).join('\n')
        }
      }
      await runChat(actualContent, memoryContext)
    }
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
                <Button size="sm" onClick={handleRename}>保存</Button>
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
          placeholder="输入消息，或以 /agent 开头触发 Agent 模式..."
          isLoading={isLoading}
          streamingMessageId={streamingMsgId}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  )
}
