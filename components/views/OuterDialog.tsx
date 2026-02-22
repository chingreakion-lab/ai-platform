"use client"
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Bot } from 'lucide-react'
import { useState } from 'react'

export function OuterDialog() {
  const { friends, outerMessages, addOuterMessage, addLog, addTask, updateTask } = useAppStore()
  const [isLoading, setIsLoading] = useState(false)

  const chief = friends.find(f => f.role === 'chief') || friends[0]

  const handleSend = async (content: string) => {
    if (!chief) return
    setIsLoading(true)
    addOuterMessage({ role: 'user', content, senderId: 'user', senderName: '我' })
    addLog({ level: 'info', message: `向主工程师 ${chief.name} 发送消息` })
    const taskId = addTask({ title: `${chief.name} 思考中`, description: content.slice(0, 50), status: 'running' })

    const history = outerMessages.map(m => ({ role: m.role as 'user'|'assistant', content: m.content }))
    history.push({ role: 'user', content })

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: chief.provider, model: chief.model, apiKey: chief.apiKey,
          messages: history,
          systemPrompt: `你是主工程师 ${chief.name}，负责整体架构决策和协调工作。你可以管理群组与功能板块的绑定关系，以及修改平台整体配置。你不可以修改功能板块的内部实现。请专业、简洁地回复。`
        })
      })
      const data = await res.json()
      if (data.response) {
        addOuterMessage({ role: 'assistant', content: data.response, senderId: chief.id, senderName: chief.name })
        updateTask(taskId, { status: 'done', result: '回复成功' })
        addLog({ level: 'success', message: `主工程师 ${chief.name} 回复完成` })
      } else {
        updateTask(taskId, { status: 'failed', result: data.error })
        addLog({ level: 'error', message: `${chief.name} 回复失败: ${data.error}` })
      }
    } catch (e) {
      updateTask(taskId, { status: 'failed', result: String(e) })
      addLog({ level: 'error', message: `请求异常: ${String(e)}` })
    }
    setIsLoading(false)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-6 py-3 bg-white flex items-center gap-3 shrink-0">
        {chief && (
          <>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: chief.avatar }}>
              {chief.name[0]}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{chief.name}</h2>
              <p className="text-xs text-gray-400">主工程师 · {chief.model}</p>
            </div>
          </>
        )}
        {!chief && (
          <div className="flex items-center gap-2 text-gray-400">
            <Bot className="h-5 w-5" />
            <span className="text-sm">未配置主工程师</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ChatArea
          messages={outerMessages}
          onSendMessage={handleSend}
          members={chief ? [chief] : []}
          isLoading={isLoading}
          placeholder={chief ? `向 ${chief.name} 发送指令...` : '请先在设置中配置 AI 好友'}
        />
      </div>
    </div>
  )
}
