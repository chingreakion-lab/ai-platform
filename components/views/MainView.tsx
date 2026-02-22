"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Plus, Users, Megaphone, Link2, X, Paperclip, ChevronRight } from 'lucide-react'
import { Group, Message, AIFriend, Attachment } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

export function MainView() {
  const { friends, groups, featureBoards, createGroup, updateGroup, addMessage, addLog, addTask, updateTask, setActiveBoard, setActiveView } = useAppStore()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [announcementText, setAnnouncementText] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const groupMembers = selectedGroup ? friends.filter(f => selectedGroup.members.includes(f.id)) : []
  const boundBoards = selectedGroup ? featureBoards.filter(b => selectedGroup.boundBoardIds.includes(b.id)) : []

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return
    const id = createGroup(newGroupName.trim(), selectedMembers)
    addLog({ level: 'success', message: `群组 "${newGroupName}" 创建成功` })
    setSelectedGroupId(id)
    setShowCreateGroup(false)
    setNewGroupName('')
    setSelectedMembers([])
  }

  // Run a single member as a ReAct agent via SSE stream
  const runAgentMember = async (
    member: AIFriend,
    groupId: string,
    task: string,
    history: Array<{ role: string; content: string }>
  ) => {
    const taskId = addTask({ title: `${member.name} 🤖 Agent 运行中`, description: task.slice(0, 40), status: 'running' })

    const systemBase = selectedGroup?.announcement
      ? `你是 ${member.name}，${member.description}。\n\n群组工作目标：${selectedGroup.announcement}\n\n你是一个能自主完成任务的AI工程师，可以写代码、执行、查看结果、反复迭代直到完成任务。`
      : `你是 ${member.name}，${member.description}。你是一个能自主完成任务的AI工程师，可以写代码、执行、查看结果、反复迭代直到完成任务。`

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: member.provider, model: member.model, apiKey: member.apiKey,
          agentName: member.name, task, history, systemBase, groupId,
        })
      })

      if (!res.body) throw new Error('No stream body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleAgentEvent(event, groupId, member, history)
          } catch {}
        }
      }

      updateTask(taskId, { status: 'done', result: 'Agent 完成' })
      addLog({ level: 'success', message: `${member.name} Agent 任务完成` })
    } catch (e) {
      updateTask(taskId, { status: 'failed', result: String(e) })
      addLog({ level: 'error', message: `${member.name} Agent 异常: ${String(e)}` })
    }
  }

  // Handle individual SSE events from agent stream
  const handleAgentEvent = (
    event: Record<string, unknown>,
    groupId: string,
    member: AIFriend,
    history: Array<{ role: string; content: string }>
  ) => {
    const { type } = event

    if (type === 'message') {
      // AI said something (strip XML tags for display)
      const display = (event.display as string) || (event.content as string) || ''
      if (display.trim()) {
        addMessage(groupId, {
          role: 'assistant', content: display,
          senderId: member.id, senderName: member.name
        })
        history.push({ role: 'assistant', content: display })
        addLog({ level: 'info', message: `${member.name}: ${display.slice(0, 60)}...` })
      }
    } else if (type === 'tool_call') {
      const tool = event.tool as string
      const args = event.args as Record<string, string>
      let label = `🔧 调用工具: ${tool}`
      if (tool === 'execute_code') label = `⚙️ 执行 ${args.language} 代码`
      else if (tool === 'write_file') label = `📝 写入文件: ${args.path}`
      else if (tool === 'read_file') label = `📖 读取文件: ${args.path}`
      else if (tool === 'shell') label = `💻 Shell: ${args.cmd?.slice(0, 50)}`
      addLog({ level: 'info', message: `${member.name} → ${label}` })
    } else if (type === 'tool_result') {
      const tool = event.tool as string
      const result = (event.result as string) || ''
      // Post tool results as sandbox messages so other AIs can see
      const content = `\`\`\`\n${result.slice(0, 2000)}${result.length > 2000 ? '\n...(已截断)' : ''}\n\`\`\``
      addMessage(groupId, {
        role: 'assistant', content,
        senderId: 'system', senderName: `🖥️ ${tool}`
      })
      history.push({ role: 'assistant', content: result })
      addLog({ level: result.startsWith('❌') ? 'error' : 'success', message: `工具结果: ${result.slice(0, 80)}` })
    } else if (type === 'done') {
      const summary = event.summary as string
      if (summary && summary.trim()) {
        addMessage(groupId, {
          role: 'assistant', content: `✅ **任务完成**\n\n${summary}`,
          senderId: member.id, senderName: member.name
        })
        history.push({ role: 'assistant', content: summary })
      }
    } else if (type === 'error') {
      addLog({ level: 'error', message: `${member.name} 错误: ${event.message}` })
    } else if (type === 'thinking') {
      addLog({ level: 'info', message: `${member.name} 思考中 (第 ${event.iteration} 轮)...` })
    }
  }

  const handleSendMessage = async (content: string, files?: File[]) => {
    if (!selectedGroup) return
    setIsLoading(true)

    // Upload files if any
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
        } catch (e) {
          addLog({ level: 'error', message: `文件上传失败: ${file.name}` })
        }
      }
    }

    // Add user message
    addMessage(selectedGroup.id, {
      role: 'user', content, senderId: 'user', senderName: '我',
      attachments: attachments.length > 0 ? attachments : undefined
    })
    addLog({ level: 'info', message: `用户任务: ${content.slice(0, 60)}` })

    // Build shared conversation history
    const history = selectedGroup.messages.map(m => ({ role: m.role as 'user'|'assistant', content: m.content }))
    history.push({ role: 'user', content })

    // Run each member as an autonomous agent (sequentially so they can see each other's output)
    for (const member of groupMembers) {
      await runAgentMember(member, selectedGroup.id, content, history)
    }

    setIsLoading(false)
  }

  const handleSaveAnnouncement = () => {
    if (!selectedGroup) return
    updateGroup(selectedGroup.id, { announcement: announcementText })
    addLog({ level: 'success', message: `群组 "${selectedGroup.name}" 公告已更新` })
    setShowAnnouncement(false)
  }

  const statusColor: Record<string, string> = {
    planning: 'bg-gray-100 text-gray-600',
    'in-progress': 'bg-blue-100 text-blue-600',
    done: 'bg-green-100 text-green-600',
    paused: 'bg-yellow-100 text-yellow-600',
  }
  const statusLabel: Record<string, string> = {
    planning: '规划中', 'in-progress': '进行中', done: '已完成', paused: '已暂停'
  }

  return (
    <div className="flex h-full">
      {/* Left: group list */}
      <div className="w-64 border-r bg-gray-50 flex flex-col shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Users className="h-4 w-4" /> 群组
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:text-blue-500"
            onClick={() => setShowCreateGroup(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {groups.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                点击 + 创建第一个群组
              </div>
            )}
            {groups.map(group => {
              const members = friends.filter(f => group.members.includes(f.id))
              const lastMsg = group.messages[group.messages.length - 1]
              return (
                <button key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                    selectedGroupId === group.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-white border border-transparent'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex -space-x-1">
                      {members.slice(0, 3).map(m => (
                        <div key={m.id} className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white font-bold"
                          style={{ backgroundColor: m.avatar }}>
                          {m.name[0]}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-gray-800 truncate">{group.name}</span>
                  </div>
                  {lastMsg && (
                    <p className="text-[11px] text-gray-400 truncate">{lastMsg.senderName}: {lastMsg.content}</p>
                  )}
                  {group.boundBoardIds.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Link2 className="h-2.5 w-2.5 text-gray-300" />
                      <span className="text-[10px] text-gray-400">{group.boundBoardIds.length} 个功能板块</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right: chat area */}
      {selectedGroup ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Group header */}
          <div className="border-b px-4 py-2.5 bg-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">{selectedGroup.name}</h2>
                <div className="flex items-center gap-1 mt-0.5">
                  {groupMembers.map(m => (
                    <span key={m.id} className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: m.avatar }} />
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                onClick={() => { setAnnouncementText(selectedGroup.announcement); setShowAnnouncement(true) }}>
                <Megaphone className="h-3 w-3" /> 公告
              </Button>
            </div>
          </div>

          {/* Announcement banner */}
          {selectedGroup.announcement && (
            <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-start gap-2">
              <Megaphone className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 line-clamp-2">{selectedGroup.announcement}</p>
            </div>
          )}

          {/* Bound boards preview */}
          {boundBoards.length > 0 && (
            <div className="border-b bg-gray-50 px-4 py-2 flex gap-2 overflow-x-auto shrink-0">
              {boundBoards.map(board => (
                <button key={board.id}
                  onClick={() => { setActiveBoard(board.id); setActiveView('feature') }}
                  className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5 text-xs hover:border-blue-300 hover:shadow-sm transition-all shrink-0">
                  <span className="font-medium text-gray-700">{board.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor[board.status]}`}>
                    {statusLabel[board.status]}
                  </span>
                  <div className="w-16">
                    <Progress value={board.progress} className="h-1" />
                  </div>
                  <span className="text-gray-400">{board.progress}%</span>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0">
            <ChatArea
              messages={selectedGroup.messages}
              onSendMessage={handleSendMessage}
              members={groupMembers}
              isLoading={isLoading}
              placeholder={`在 ${selectedGroup.name} 中发送消息...`}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <Users className="h-16 w-16 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">选择一个群组开始协作</p>
            <Button className="mt-4" size="sm" onClick={() => setShowCreateGroup(true)}>
              <Plus className="h-4 w-4 mr-1" /> 创建群组
            </Button>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建群组</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">群组名称</label>
              <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                placeholder="输入群组名称" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">选择成员</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {friends.map(friend => (
                  <label key={friend.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border">
                    <input type="checkbox"
                      checked={selectedMembers.includes(friend.id)}
                      onChange={e => setSelectedMembers(
                        e.target.checked ? [...selectedMembers, friend.id] : selectedMembers.filter(id => id !== friend.id)
                      )}
                      className="rounded"
                    />
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: friend.avatar }}>
                      {friend.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{friend.name}</p>
                      <p className="text-xs text-gray-400">{friend.model}</p>
                    </div>
                    <Badge variant={friend.role === 'chief' ? 'default' : 'secondary'} className="text-[10px]">
                      {friend.role === 'chief' ? '主工程师' : '功能工程师'}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)}>取消</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedMembers.length === 0}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Announcement Modal */}
      <Dialog open={showAnnouncement} onOpenChange={setShowAnnouncement}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>群公告 / 工作目标</DialogTitle>
          </DialogHeader>
          <Textarea
            value={announcementText}
            onChange={e => setAnnouncementText(e.target.value)}
            placeholder="输入公告或工作目标，AI 成员会根据此目标进行协作..."
            className="min-h-[120px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnouncement(false)}>取消</Button>
            <Button onClick={handleSaveAnnouncement}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
