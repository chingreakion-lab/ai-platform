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
    addLog({ level: 'info', message: `用户在群组 "${selectedGroup.name}" 发送消息` })

    // Each member responds
    const history = selectedGroup.messages.map(m => ({ role: m.role as 'user'|'assistant', content: m.content }))
    history.push({ role: 'user', content })

    for (const member of groupMembers) {
      const taskId = addTask({ title: `${member.name} 正在回复`, description: selectedGroup.name, status: 'running' })
      try {
        const systemPrompt = selectedGroup.announcement
          ? `你是 ${member.name}，${member.description}。\n\n群组工作目标：${selectedGroup.announcement}\n\n请根据工作目标积极参与协作，简洁专业地回复。`
          : `你是 ${member.name}，${member.description}。请简洁专业地参与群组协作。`

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: member.provider, model: member.model, apiKey: member.apiKey,
            messages: history, systemPrompt
          })
        })
        const data = await res.json()
        if (data.response) {
          addMessage(selectedGroup.id, {
            role: 'assistant', content: data.response,
            senderId: member.id, senderName: member.name
          })
          history.push({ role: 'assistant', content: data.response })
          updateTask(taskId, { status: 'done', result: '回复成功' })
          addLog({ level: 'success', message: `${member.name} 在群组 "${selectedGroup.name}" 回复完成` })
        } else {
          updateTask(taskId, { status: 'failed', result: data.error || '未知错误' })
          addLog({ level: 'error', message: `${member.name} 回复失败: ${data.error}` })
        }
      } catch (e) {
        updateTask(taskId, { status: 'failed', result: String(e) })
        addLog({ level: 'error', message: `${member.name} 回复异常: ${String(e)}` })
      }
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
