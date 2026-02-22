"use client"
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, LayoutGrid, Link2, History, ChevronLeft, ChevronRight, MessageSquare, Trash2 } from 'lucide-react'
import { BoardStatus, FeatureBoard } from '@/lib/types'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const statusConfig: Record<BoardStatus, { label: string; color: string }> = {
  planning: { label: '规划中', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  'in-progress': { label: '进行中', color: 'bg-blue-100 text-blue-600 border-blue-200' },
  done: { label: '已完成', color: 'bg-green-100 text-green-600 border-green-200' },
  paused: { label: '已暂停', color: 'bg-yellow-100 text-yellow-600 border-yellow-200' },
}

export function FeatureView() {
  const { friends, groups, featureBoards, activeBoardId, createBoard, updateBoard, deleteBoard, addBoardHistory, bindGroupToBoard, unbindGroupFromBoard, setActiveBoard, addMessage, addLog, addTask, updateTask } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [showGroupChat, setShowGroupChat] = useState(false)
  const [chatGroupId, setChatGroupId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [historyNote, setHistoryNote] = useState('')
  const [showBindGroup, setShowBindGroup] = useState(false)

  const activeBoard = featureBoards.find(b => b.id === activeBoardId) || featureBoards[0] || null
  useEffect(() => {
    if (!activeBoardId && featureBoards.length > 0) setActiveBoard(featureBoards[0].id)
  }, [featureBoards.length])

  const boundGroups = activeBoard ? groups.filter(g => activeBoard.boundGroupIds.includes(g.id)) : []
  const chatGroup = groups.find(g => g.id === chatGroupId)
  const chatMembers = chatGroup ? friends.filter(f => chatGroup.members.includes(f.id)) : []

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = createBoard(newName.trim(), newDesc.trim(), newOwner || 'user')
    addLog({ level: 'success', message: `功能板块 "${newName}" 已创建` })
    setActiveBoard(id)
    setShowCreate(false)
    setNewName(''); setNewDesc(''); setNewOwner('')
  }

  const handleAddHistory = () => {
    if (!activeBoard || !historyNote.trim()) return
    addBoardHistory(activeBoard.id, { version: activeBoard.version, description: historyNote.trim(), authorId: 'user' })
    setHistoryNote('')
    addLog({ level: 'info', message: `功能板块 "${activeBoard.name}" 添加历史记录` })
  }

  const handleSendGroupMessage = async (content: string) => {
    if (!chatGroup) return
    setIsLoading(true)
    addMessage(chatGroup.id, { role: 'user', content, senderId: 'user', senderName: '我' })
    const history = chatGroup.messages.map(m => ({ role: m.role as 'user'|'assistant', content: m.content }))
    history.push({ role: 'user', content })
    for (const member of chatMembers) {
      const taskId = addTask({ title: `${member.name} 正在回复`, description: chatGroup.name, status: 'running' })
      try {
        const res = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: member.provider, model: member.model, apiKey: member.apiKey, messages: history,
            systemPrompt: `你是 ${member.name}，${member.description}。当前功能板块: ${activeBoard?.name}。请简洁专业地参与协作。` })
        })
        const data = await res.json()
        if (data.response) {
          addMessage(chatGroup.id, { role: 'assistant', content: data.response, senderId: member.id, senderName: member.name })
          history.push({ role: 'assistant', content: data.response })
          updateTask(taskId, { status: 'done', result: '回复成功' })
        } else {
          updateTask(taskId, { status: 'failed', result: data.error })
        }
      } catch(e) { updateTask(taskId, { status: 'failed', result: String(e) }) }
    }
    setIsLoading(false)
  }

  return (
    <div className="flex h-full">
      {/* Group chat sidebar (left pullout) */}
      {showGroupChat && chatGroup && (
        <div className="w-80 border-r bg-white flex flex-col shrink-0">
          <div className="px-3 py-2 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">{chatGroup.name}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowGroupChat(false)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <ChatArea messages={chatGroup.messages} onSendMessage={handleSendGroupMessage}
              members={chatMembers} isLoading={isLoading} placeholder="在群组中发消息..." />
          </div>
        </div>
      )}

      {/* Left: board list */}
      <div className="w-56 border-r bg-gray-50 flex flex-col shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <LayoutGrid className="h-4 w-4" /> 功能板块
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:text-blue-500"
            onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {featureBoards.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400">
                <LayoutGrid className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                点击 + 新建功能板块
              </div>
            )}
            {featureBoards.map(board => (
              <button key={board.id}
                onClick={() => setActiveBoard(board.id)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                  activeBoardId === board.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-white border border-transparent'
                }`}>
                <p className="text-xs font-semibold text-gray-800 truncate">{board.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusConfig[board.status].color}`}>
                    {statusConfig[board.status].label}
                  </span>
                  <span className="text-[10px] text-gray-400">v{board.version}</span>
                </div>
                <Progress value={board.progress} className="h-1 mt-1.5" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right: board detail */}
      {activeBoard ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Board header */}
          <div className="border-b px-6 py-3 bg-white flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-800">{activeBoard.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{activeBoard.description || '暂无描述'}</p>
            </div>
            <div className="flex items-center gap-2">
              {boundGroups.length > 0 && !showGroupChat && (
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                  onClick={() => { setChatGroupId(boundGroups[0].id); setShowGroupChat(true) }}>
                  <MessageSquare className="h-3 w-3" /> 群聊
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                onClick={() => setShowBindGroup(true)}>
                <Link2 className="h-3 w-3" /> 绑定群组
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => { deleteBoard(activeBoard.id); setActiveBoard(null) }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6 max-w-2xl">
              {/* Status & Progress */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 block mb-2">状态</label>
                  <Select value={activeBoard.status}
                    onValueChange={v => updateBoard(activeBoard.id, { status: v as BoardStatus })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([val, cfg]) => (
                        <SelectItem key={val} value={val} className="text-xs">{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-white border rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 block mb-2">版本</label>
                  <Input value={activeBoard.version} className="h-8 text-xs"
                    onChange={e => updateBoard(activeBoard.id, { version: e.target.value })} />
                </div>
              </div>

              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500">进度</label>
                  <span className="text-sm font-bold text-blue-500">{activeBoard.progress}%</span>
                </div>
                <Progress value={activeBoard.progress} className="h-2 mb-2" />
                <input type="range" min={0} max={100} value={activeBoard.progress}
                  onChange={e => updateBoard(activeBoard.id, { progress: parseInt(e.target.value) })}
                  className="w-full" />
              </div>

              <div className="bg-white border rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 block mb-2">描述</label>
                <Textarea value={activeBoard.description} rows={3}
                  className="text-sm resize-none"
                  onChange={e => updateBoard(activeBoard.id, { description: e.target.value })}
                  placeholder="功能板块描述..." />
              </div>

              {/* Bound groups */}
              {boundGroups.length > 0 && (
                <div className="bg-white border rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 block mb-2">绑定的群组</label>
                  <div className="flex flex-wrap gap-2">
                    {boundGroups.map(g => (
                      <div key={g.id} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1.5 text-xs border border-blue-100">
                        <span>{g.name}</span>
                        <button onClick={() => unbindGroupFromBoard(g.id, activeBoard.id)}
                          className="text-blue-400 hover:text-blue-700">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* History */}
              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="h-4 w-4 text-gray-400" />
                  <label className="text-xs font-semibold text-gray-500">历史记录</label>
                </div>
                <div className="flex gap-2 mb-3">
                  <Input value={historyNote} onChange={e => setHistoryNote(e.target.value)}
                    placeholder="添加历史记录..." className="text-xs h-8 flex-1" />
                  <Button size="sm" className="h-8 text-xs" onClick={handleAddHistory}>添加</Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activeBoard.history.length === 0 && <p className="text-xs text-gray-400 text-center py-4">暂无历史记录</p>}
                  {[...activeBoard.history].reverse().map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs border-l-2 border-gray-200 pl-3 py-1">
                      <div className="flex-1">
                        <p className="text-gray-700">{h.description}</p>
                        <p className="text-gray-400 mt-0.5">{format(h.timestamp, 'yyyy-MM-dd HH:mm')} · v{h.version}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <LayoutGrid className="h-16 w-16 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">选择或创建一个功能板块</p>
            <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> 新建功能板块
            </Button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>新建功能板块</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">名称 *</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="功能板块名称" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">描述</label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="功能描述" rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">负责工程师</label>
              <Select value={newOwner} onValueChange={setNewOwner}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>
                  {friends.filter(f => f.role === 'feature').map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bind Group Modal */}
      <Dialog open={showBindGroup} onOpenChange={setShowBindGroup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>绑定群组</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {groups.length === 0 && <p className="text-sm text-gray-400 text-center py-4">暂无群组，请先创建群组</p>}
            {groups.map(g => {
              const bound = activeBoard?.boundGroupIds.includes(g.id)
              return (
                <div key={g.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">{g.name}</span>
                  <Button size="sm" variant={bound ? 'destructive' : 'outline'} className="text-xs h-7"
                    onClick={() => activeBoard && (bound ? unbindGroupFromBoard(g.id, activeBoard.id) : bindGroupToBoard(g.id, activeBoard.id))}>
                    {bound ? '解除绑定' : '绑定'}
                  </Button>
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBindGroup(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
