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
  const { friends, groups, featureBoards, createGroup, updateGroup, addMessage, updateGroupMessage, addLog, addTask, updateTask, setActiveBoard, setActiveView, roleCards, updateGroupMemberRole } = useAppStore()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [showMemberSettings, setShowMemberSettings] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [announcementText, setAnnouncementText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({}) // friendId -> roleCardId
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleDialogFriendId, setRoleDialogFriendId] = useState<string | null>(null)

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const groupMembers = selectedGroup ? friends.filter(f => selectedGroup.members.some(m => m.friendId === f.id)) : []
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

  const runAgentMember = async (
    member: AIFriend,
    groupId: string,
    task: string,
    history: Array<{ role: string; content: string }>
  ) => {
    const taskId = addTask({ title: `${member.name} 🤖 Agent 运行中`, description: task.slice(0, 40), status: 'running' })

    const memberInGroup = selectedGroup?.members.find(m => m.friendId === member.id)
    const roleCard = memberInGroup?.roleCardId ? roleCards.find(c => c.id === memberInGroup.roleCardId) : null
    let systemBase = roleCard?.systemPrompt || `你是 ${member.name}，${member.description}。你是一个能自主完成任务的AI工程师。`
    if (selectedGroup?.announcement) systemBase += `\n\n群组工作目标：${selectedGroup.announcement}`

    // 创建流式占位消息
    const placeholderId = addMessage(groupId, {
      role: 'assistant', content: '',
      senderId: member.id, senderName: member.name
    })
    setStreamingMsgId(placeholderId)
    let accContent = ''

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
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            const { type } = event

            if (type === 'message') {
              const display = (event.display as string) || (event.content as string) || ''
              if (display.trim()) {
                accContent = accContent ? accContent + '\n\n' + display : display
                updateGroupMessage(groupId, placeholderId, accContent)
                history.push({ role: 'assistant', content: display })
              }
            } else if (type === 'thinking') {
              addLog({ level: 'info', message: `${member.name} 思考中 (第 ${event.iteration} 轮)...` })
            } else if (type === 'tool_call') {
              const tool = event.tool as string
              const args = (event.args as Record<string, string>) || {}
              const label =
                tool === 'execute_code' ? `⚙️ 执行 ${args.language || ''} 代码` :
                tool === 'write_file'   ? `📝 写入 \`${args.path}\`` :
                tool === 'read_file'    ? `📖 读取 \`${args.path}\`` :
                tool === 'shell'        ? `💻 \`${(args.command || args.cmd || '').slice(0, 60)}\`` :
                `🔧 ${tool}`
              addMessage(groupId, { role: 'assistant', content: label, senderId: 'system', senderName: member.name })
              addLog({ level: 'info', message: `${member.name} → ${label}` })
            } else if (type === 'tool_result') {
              const result = (event.result as string) || ''
              history.push({ role: 'assistant', content: result })
              addLog({
                level: result.startsWith('❌') ? 'error' : 'success',
                message: `[${event.tool}] ${result.slice(0, 120)}${result.length > 120 ? '...' : ''}`
              })
            } else if (type === 'done') {
              const summary = (event.summary as string) || ''
              if (summary.trim() && summary !== accContent) {
                const finalContent = accContent
                  ? accContent + '\n\n✅ **任务完成**\n' + summary
                  : '✅ **任务完成**\n' + summary
                updateGroupMessage(groupId, placeholderId, finalContent)
                history.push({ role: 'assistant', content: summary })
              }
            } else if (type === 'error') {
              const errMsg = (event.message || event.error || '未知错误') as string
              const errContent = (accContent ? accContent + '\n\n' : '') + `❌ ${errMsg}`
              updateGroupMessage(groupId, placeholderId, errContent)
              addLog({ level: 'error', message: `${member.name} 错误: ${errMsg}` })
            }
          } catch {}
        }
      }

      if (!accContent) updateGroupMessage(groupId, placeholderId, '（无文字输出）')
      updateTask(taskId, { status: 'done', result: 'Agent 完成' })
      addLog({ level: 'success', message: `${member.name} Agent 任务完成` })
    } catch (e) {
      const msg = String(e)
      const errContent = (accContent ? accContent + '\n\n' : '') + `❌ 执行异常：${msg}`
      updateGroupMessage(groupId, placeholderId, errContent)
      updateTask(taskId, { status: 'failed', result: msg })
      addLog({ level: 'error', message: `${member.name} Agent 异常: ${msg}` })
    } finally {
      setStreamingMsgId(null)
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
              const members = friends.filter(f => group.members.some(m => m.friendId === f.id))
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
                <div className="flex items-center gap-2 mt-0.5">
                  {groupMembers.map(m => {
                    const memberInGroup = selectedGroup?.members.find(gm => gm.friendId === m.id)
                    const roleCard = memberInGroup?.roleCardId ? roleCards.find(r => r.id === memberInGroup.roleCardId) : null
                    return (
                      <button
                        key={m.id}
                        title="点击分配角色"
                        onClick={() => { setRoleDialogFriendId(m.id); setRoleDialogOpen(true) }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: m.avatar }} />
                        <span className="text-[11px] text-gray-600">{m.name}</span>
                        {roleCard && (
                          <span className="text-[10px] text-blue-500">{roleCard.emoji}</span>
                        )}
                      </button>
                    )
                  })}
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
              streamingMessageId={streamingMsgId}
              placeholder={`在 ${selectedGroup.name} 中发送消息...`}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50/50">
          <div className="max-w-lg w-full mx-auto px-6 py-8 text-center">
            {groups.length === 0 ? (
              <>
                {/* First run: no groups yet */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">欢迎使用 AI 协作平台</h2>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  创建一个群组，把你的 AI 好友集合起来，像团队一样协作完成编程任务。
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6 text-left">
                  {[
                    { icon: '🤖', title: 'Agent 模式', desc: 'AI 自主写代码、执行、迭代' },
                    { icon: '👥', title: '多 AI 协作', desc: '多个 AI 依次完成不同分工' },
                    { icon: '📦', title: '代码沙盒', desc: '在 Docker 容器里安全运行代码' },
                  ].map(item => (
                    <div key={item.title} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                      <div className="text-2xl mb-1.5">{item.icon}</div>
                      <p className="text-xs font-semibold text-gray-700">{item.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  ))}
                </div>
                {friends.length > 0 ? (
                  <Button className="gap-2 h-9 px-5 text-sm" onClick={() => setShowCreateGroup(true)}>
                    <Plus className="h-4 w-4" /> 创建第一个群组
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      💡 先去「设置」页添加 AI 好友（配置 API Key），再回来创建群组
                    </p>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActiveView('settings')}>
                      <Plus className="h-3.5 w-3.5" /> 前往设置添加 AI 好友
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Has groups but none selected */}
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600 mb-1">选择左侧群组开始协作</p>
                <p className="text-xs text-gray-400 mb-4">或者创建一个新群组</p>
                <Button size="sm" className="gap-1.5 h-8 px-4 text-xs" onClick={() => setShowCreateGroup(true)}>
                  <Plus className="h-3.5 w-3.5" /> 新建群组
                </Button>
              </>
            )}
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

      {/* Role Assignment Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              为 {friends.find(f => f.id === roleDialogFriendId)?.name} 分配角色
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {/* No role option */}
            <button
              onClick={() => {
                if (selectedGroup && roleDialogFriendId) {
                  updateGroupMemberRole(selectedGroup.id, roleDialogFriendId, '')
                }
                setRoleDialogOpen(false)
              }}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <span className="text-2xl">👤</span>
              <span className="text-xs font-medium text-gray-600">无角色</span>
              <span className="text-[10px] text-gray-400 text-center">使用默认行为</span>
            </button>
            {/* Role cards */}
            {roleCards.map(card => {
              const currentRoleId = selectedGroup?.members.find(m => m.friendId === roleDialogFriendId)?.roleCardId
              const isSelected = currentRoleId === card.id
              return (
                <button
                  key={card.id}
                  onClick={() => {
                    if (selectedGroup && roleDialogFriendId) {
                      updateGroupMemberRole(selectedGroup.id, roleDialogFriendId, card.id)
                    }
                    setRoleDialogOpen(false)
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <span className="text-2xl">{card.emoji}</span>
                  <span className="text-xs font-medium text-gray-700">{card.name}</span>
                  <span className="text-[10px] text-gray-400 text-center line-clamp-2">{card.expertArea}</span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
