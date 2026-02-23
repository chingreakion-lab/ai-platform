"use client"
import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Plus, Users, Megaphone, X } from 'lucide-react'
import { Group, Message, AIFriend, Attachment } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

export function MainView() {
  const { friends, groups, featureBoards, createGroup, updateGroup, addMessage, updateGroupMessage, addLog, addTask, updateTask, setActiveBoard, setActiveView, roleCards, updateGroupMemberRole, activeGroupId, setActiveGroup } = useAppStore()
  const selectedGroupId = activeGroupId
  const setSelectedGroupId = setActiveGroup
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [showMemberSettings, setShowMemberSettings] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [announcementText, setAnnouncementText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({})
  const [createRoleMap, setCreateRoleMap] = useState<Record<string, string>>({})
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleDialogFriendId, setRoleDialogFriendId] = useState<string | null>(null)

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const groupMembers = selectedGroup ? friends.filter(f => selectedGroup.members.some(m => m.friendId === f.id)) : []
  const boundBoards = selectedGroup ? featureBoards.filter(b => selectedGroup.boundBoardIds.includes(b.id)) : []

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return
    const id = createGroup(newGroupName.trim(), selectedMembers, createRoleMap)
    addLog({ level: 'success', message: `群组 "${newGroupName}" 创建成功` })
    setSelectedGroupId(id)
    setShowCreateGroup(false)
    setNewGroupName('')
    setSelectedMembers([])
    setCreateRoleMap({})
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

    addMessage(selectedGroup.id, {
      role: 'user', content, senderId: 'user', senderName: '我',
      attachments: attachments.length > 0 ? attachments : undefined
    })
    addLog({ level: 'info', message: `用户指令: ${content.slice(0, 60)}` })

    const getRoleMember = (roleName: string) => {
      const gm = selectedGroup.members.find(m => {
        const card = roleCards.find(c => c.id === m.roleCardId)
        return card?.name === roleName
      })
      if (!gm) return null
      const friend = friends.find(f => f.id === gm.friendId)
      const card = roleCards.find(c => c.id === gm.roleCardId)
      return friend && card ? { ...friend, systemPrompt: card.systemPrompt } : null
    }

    const supervisorMember = getRoleMember('监工')
    const frontendMember = getRoleMember('前端')
    const backendMember = getRoleMember('后端')

    if (!supervisorMember) {
      addMessage(selectedGroup.id, {
        role: 'assistant', content: '⚠️ 当前群组没有分配【监工】角色。请在成员头像上点击分配角色后再试。\n\n点击群聊顶部的成员名字，选择角色卡牌。',
        senderId: 'system', senderName: '系统'
      })
      setIsLoading(false)
      return
    }

    const taskId = addTask({ title: '监工协调中', description: content.slice(0, 40), status: 'running' })

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInstruction: content,
          groupAnnouncement: selectedGroup.announcement || '',
          supervisor: {
            provider: supervisorMember.provider,
            model: supervisorMember.model,
            apiKey: supervisorMember.apiKey,
            systemPrompt: supervisorMember.systemPrompt,
          },
          frontend: frontendMember ? {
            provider: frontendMember.provider,
            model: frontendMember.model,
            apiKey: frontendMember.apiKey,
            systemPrompt: frontendMember.systemPrompt,
          } : null,
          backend: backendMember ? {
            provider: backendMember.provider,
            model: backendMember.model,
            apiKey: backendMember.apiKey,
            systemPrompt: backendMember.systemPrompt,
          } : null,
          maxRounds: 3,
        }),
      })

      if (!res.body) throw new Error('No response stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const data = JSON.parse(dataLine.slice(5).trim())

            if (data.type === 'round_start') {
              addMessage(selectedGroup.id, {
                role: 'assistant',
                content: `─── 第 ${data.round} 轮协作 ───`,
                senderId: 'system', senderName: '系统'
              })
            } else if (data.type === 'agent_start') {
              addLog({ level: 'info', message: `${data.agent}：${data.action}` })
            } else if (data.type === 'agent_message') {
              const agentName = data.agent as string
              const member = agentName === '监工' ? supervisorMember
                : agentName === '前端' ? frontendMember
                : backendMember
              if (member && data.content?.trim()) {
                addMessage(selectedGroup.id, {
                  role: 'assistant',
                  content: data.content,
                  senderId: member.id,
                  senderName: `${agentName} · ${member.name}`,
                })
              }
            } else if (data.type === 'done') {
              updateTask(taskId, { status: 'done', result: '完成' })
              addLog({ level: 'success', message: '所有工作完成' })
            } else if (data.type === 'error') {
              updateTask(taskId, { status: 'failed', result: data.message })
              addMessage(selectedGroup.id, {
                role: 'assistant', content: `❌ ${data.message}`,
                senderId: 'system', senderName: '系统'
              })
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      updateTask(taskId, { status: 'failed', result: msg })
      addMessage(selectedGroup.id, {
        role: 'assistant', content: `❌ 协作失败：${msg}`,
        senderId: 'system', senderName: '系统'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveAnnouncement = () => {
    if (!selectedGroup) return
    updateGroup(selectedGroup.id, { announcement: announcementText })
    addLog({ level: 'success', message: `群组 "${selectedGroup.name}" 公告已更新` })
    setShowAnnouncement(false)
  }

  const roleDialogMember = groupMembers.find(m => m.id === roleDialogFriendId)

  return (
    <div className="flex-1 flex flex-col h-full" style={{ background: '#0e0f1a' }}>
      {selectedGroup ? (
        <>
          {/* Header */}
          <div
            style={{
              height: 64,
              borderBottom: '1px solid #262736',
              background: 'rgba(14,15,26,0.5)',
              backdropFilter: 'blur(8px)',
            }}
            className="flex items-center justify-between px-6 shrink-0 z-10"
          >
            {/* Left: group icon + name + member count + member avatars */}
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(66,133,244,0.15)',
                  border: '1px solid rgba(66,133,244,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users style={{ width: 16, height: 16, color: '#4285f4' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e8e9f0' }}>{selectedGroup.name}</h2>
                  <span style={{ fontSize: 11, color: '#8e9299', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 6px' }}>
                    {groupMembers.length} 人
                  </span>
                </div>
                {/* Member bar */}
                <div className="flex items-center gap-1.5 mt-1">
                  {groupMembers.map(m => {
                    const memberInGroup = selectedGroup.members.find(gm => gm.friendId === m.id)
                    const roleCard = memberInGroup?.roleCardId ? roleCards.find(r => r.id === memberInGroup.roleCardId) : null
                    return (
                      <button
                        key={m.id}
                        title="点击分配角色"
                        onClick={() => { setRoleDialogFriendId(m.id); setRoleDialogOpen(true) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px 2px 4px',
                          borderRadius: 20,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.03)',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(66,133,244,0.5)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: m.avatar,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#fff',
                          }}
                        >
                          {m.name[0]}
                        </span>
                        <span style={{ fontSize: 11, color: '#8e9299' }}>{m.name}</span>
                        {roleCard && <span style={{ fontSize: 11 }}>{roleCard.emoji}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAnnouncementText(selectedGroup.announcement); setShowAnnouncement(true) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: '1px solid #262736',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#8e9299',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#4285f4'; e.currentTarget.style.color = '#4285f4' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#262736'; e.currentTarget.style.color = '#8e9299' }}
              >
                <Megaphone style={{ width: 13, height: 13 }} />
                公告
              </button>
              <button
                onClick={() => { setRoleDialogFriendId(groupMembers[0]?.id || null); setRoleDialogOpen(true) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: '1px solid #262736',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#8e9299',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#4285f4'; e.currentTarget.style.color = '#4285f4' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#262736'; e.currentTarget.style.color = '#8e9299' }}
              >
                🎭 分配角色
              </button>
            </div>
          </div>

          {/* Announcement banner */}
          {selectedGroup.announcement && (
            <div style={{
              background: 'rgba(66,133,244,0.08)',
              borderBottom: '1px solid rgba(66,133,244,0.2)',
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
              <Megaphone style={{ width: 13, height: 13, color: '#4285f4', marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: 'rgba(66,133,244,0.9)', lineHeight: 1.5 }}>{selectedGroup.announcement}</p>
            </div>
          )}

          {/* Chat */}
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
        </>
      ) : (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center">
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'rgba(66,133,244,0.1)',
              border: '1px solid rgba(66,133,244,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Users style={{ width: 28, height: 28, color: '#4285f4', opacity: 0.6 }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>选择左侧群组开始协作</p>
            <p style={{ fontSize: 12, color: '#8e9299', marginBottom: 20 }}>或者创建一个新群组</p>
            <button
              onClick={() => setShowCreateGroup(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                borderRadius: 12,
                background: '#4285f4',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              新建群组
            </button>
          </div>
        </div>
      )}

      {/* ── Create Group Dialog ── */}
      {showCreateGroup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50 }}
          className="flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowCreateGroup(false); setSelectedMembers([]); setNewGroupName(''); setCreateRoleMap({}) } }}
        >
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 20, width: '100%', maxWidth: 480 }} className="overflow-hidden shadow-2xl">
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #262736' }} className="flex items-center justify-between">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e8e9f0' }}>创建群组</h3>
                <p style={{ color: '#8e9299', fontSize: 12, marginTop: 2 }}>添加成员并配置角色</p>
              </div>
              <button
                onClick={() => { setShowCreateGroup(false); setSelectedMembers([]); setNewGroupName(''); setCreateRoleMap({}) }}
                style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }} className="space-y-4">
              {/* Group name */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>群组名称</label>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="输入群组名称"
                  autoFocus
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid #262736',
                    borderRadius: 10,
                    padding: '9px 14px',
                    fontSize: 13,
                    color: '#e8e9f0',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#4285f4')}
                  onBlur={e => (e.target.style.borderColor = '#262736')}
                />
              </div>

              {/* Members */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 8 }}>
                  选择成员
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>— 选中后可为每人分配角色</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {friends.map(friend => {
                    const checked = selectedMembers.includes(friend.id)
                    const assignedId = createRoleMap[friend.id] || ''
                    const assignedCard = roleCards.find(c => c.id === assignedId)
                    return (
                      <div
                        key={friend.id}
                        style={{
                          borderRadius: 12,
                          border: checked ? '1px solid rgba(66,133,244,0.4)' : '1px solid #262736',
                          background: checked ? 'rgba(66,133,244,0.06)' : 'rgba(255,255,255,0.02)',
                          overflow: 'hidden',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedMembers(prev => [...prev, friend.id])
                              } else {
                                setSelectedMembers(prev => prev.filter(id => id !== friend.id))
                                setCreateRoleMap(prev => { const n = { ...prev }; delete n[friend.id]; return n })
                              }
                            }}
                            style={{ width: 15, height: 15, accentColor: '#4285f4', flexShrink: 0 }}
                          />
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: friend.avatar,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 13,
                              fontWeight: 700,
                              color: '#fff',
                              flexShrink: 0,
                            }}
                          >
                            {friend.name[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#e8e9f0' }}>{friend.name}</p>
                            <p style={{ fontSize: 11, color: '#8e9299', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friend.model}</p>
                          </div>
                        </label>

                        {checked && (
                          <div style={{ padding: '0 14px 12px' }}>
                            <p style={{ fontSize: 11, color: '#8e9299', marginBottom: 8, fontWeight: 500 }}>分配角色（可选）</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => setCreateRoleMap(prev => { const n = { ...prev }; delete n[friend.id]; return n })}
                                style={{
                                  padding: '8px 4px',
                                  borderRadius: 10,
                                  border: !assignedId ? '2px solid #4285f4' : '1px solid #262736',
                                  background: !assignedId ? 'rgba(66,133,244,0.08)' : 'rgba(255,255,255,0.02)',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                }}
                              >
                                <div style={{ fontSize: 18, marginBottom: 2 }}>👤</div>
                                <div style={{ fontSize: 10, color: '#8e9299' }}>默认</div>
                              </button>
                              {roleCards.map(card => (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => setCreateRoleMap(prev => ({ ...prev, [friend.id]: card.id }))}
                                  style={{
                                    padding: '8px 4px',
                                    borderRadius: 10,
                                    border: assignedId === card.id ? '2px solid #4285f4' : '1px solid #262736',
                                    background: assignedId === card.id ? 'rgba(66,133,244,0.08)' : 'rgba(255,255,255,0.02)',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                  }}
                                  title={card.expertArea}
                                >
                                  <div style={{ fontSize: 18, marginBottom: 2 }}>{card.emoji}</div>
                                  <div style={{ fontSize: 10, color: '#8e9299', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</div>
                                </button>
                              ))}
                            </div>
                            {assignedCard && (
                              <p style={{ fontSize: 11, color: '#4285f4', marginTop: 6, background: 'rgba(66,133,244,0.08)', borderRadius: 6, padding: '4px 8px' }}>
                                {assignedCard.emoji} <strong>{assignedCard.name}</strong> · {assignedCard.expertArea}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #262736', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setShowCreateGroup(false); setSelectedMembers([]); setNewGroupName(''); setCreateRoleMap({}) }}
                style={{ padding: '8px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#8e9299', fontSize: 13, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedMembers.length === 0}
                style={{
                  padding: '8px 20px',
                  borderRadius: 12,
                  background: (!newGroupName.trim() || selectedMembers.length === 0) ? 'rgba(66,133,244,0.3)' : '#4285f4',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (!newGroupName.trim() || selectedMembers.length === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                创建群组
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Announcement Dialog ── */}
      {showAnnouncement && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50 }}
          className="flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAnnouncement(false) }}
        >
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 20, width: '100%', maxWidth: 480 }} className="shadow-2xl overflow-hidden">
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #262736' }} className="flex items-center justify-between">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e8e9f0' }}>群公告 / 工作目标</h3>
                <p style={{ color: '#8e9299', fontSize: 12, marginTop: 2 }}>AI 成员会根据此目标协作</p>
              </div>
              <button
                onClick={() => setShowAnnouncement(false)}
                style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <textarea
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                placeholder="输入公告或工作目标，AI 成员会根据此目标进行协作..."
                rows={5}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #262736',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#e8e9f0',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  lineHeight: 1.6,
                }}
                onFocus={e => (e.target.style.borderColor = '#4285f4')}
                onBlur={e => (e.target.style.borderColor = '#262736')}
              />
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #262736', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowAnnouncement(false)}
                style={{ padding: '8px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#8e9299', fontSize: 13, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveAnnouncement}
                style={{ padding: '8px 20px', borderRadius: 12, background: '#4285f4', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Role Assignment Dialog ── */}
      {roleDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50 }}
          className="flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setRoleDialogOpen(false) }}
        >
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 24, width: '100%', maxWidth: 560 }} className="overflow-hidden shadow-2xl">
            <div style={{ padding: '24px', borderBottom: '1px solid #262736' }} className="flex items-center justify-between">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e8e9f0' }}>分配角色</h3>
                <p style={{ color: '#8e9299', fontSize: 13, marginTop: 3 }}>
                  为 {roleDialogMember?.name || '成员'} 选择角色
                </p>
              </div>
              <button
                onClick={() => setRoleDialogOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299', fontSize: 16 }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Member tabs */}
            {groupMembers.length > 1 && (
              <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #262736', paddingBottom: 12 }}>
                {groupMembers.map(m => {
                  const memberInGroup = selectedGroup?.members.find(gm => gm.friendId === m.id)
                  const roleCard = memberInGroup?.roleCardId ? roleCards.find(r => r.id === memberInGroup.roleCardId) : null
                  const isActive = roleDialogFriendId === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setRoleDialogFriendId(m.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 20,
                        border: isActive ? '1px solid #4285f4' : '1px solid #262736',
                        background: isActive ? 'rgba(66,133,244,0.1)' : 'rgba(255,255,255,0.02)',
                        color: isActive ? '#4285f4' : '#8e9299',
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: m.avatar,
                          flexShrink: 0,
                        }}
                      />
                      {m.name}
                      {roleCard && <span style={{ fontSize: 13 }}>{roleCard.emoji}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Role grid */}
            <div style={{ padding: 24 }} className="grid grid-cols-3 gap-4">
              {/* No role card */}
              <div
                onClick={() => {
                  if (selectedGroup && roleDialogFriendId) {
                    updateGroupMemberRole(selectedGroup.id, roleDialogFriendId, '')
                  }
                }}
                style={{
                  padding: 24,
                  borderRadius: 16,
                  border: !selectedGroup?.members.find(m => m.friendId === roleDialogFriendId)?.roleCardId
                    ? '2px solid #4285f4'
                    : '2px solid #262736',
                  background: !selectedGroup?.members.find(m => m.friendId === roleDialogFriendId)?.roleCardId
                    ? 'rgba(66,133,244,0.05)'
                    : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 16 }}>👤</div>
                <h4 style={{ fontWeight: 700, marginBottom: 4, fontSize: 13, color: '#e8e9f0' }}>无角色</h4>
                <p style={{ fontSize: 12, color: '#8e9299', lineHeight: 1.5 }}>使用默认行为</p>
              </div>

              {roleCards.map(card => {
                const currentRoleId = selectedGroup?.members.find(m => m.friendId === roleDialogFriendId)?.roleCardId
                const isSelected = currentRoleId === card.id
                return (
                  <div
                    key={card.id}
                    onClick={() => {
                      if (selectedGroup && roleDialogFriendId) {
                        updateGroupMemberRole(selectedGroup.id, roleDialogFriendId, card.id)
                      }
                    }}
                    style={{
                      padding: 24,
                      borderRadius: 16,
                      border: isSelected ? '2px solid #4285f4' : '2px solid #262736',
                      background: isSelected ? 'rgba(66,133,244,0.05)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, background 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(66,133,244,0.4)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#262736'
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 16 }}>{card.emoji}</div>
                    <h4 style={{ fontWeight: 700, marginBottom: 4, fontSize: 13, color: '#e8e9f0' }}>{card.name}</h4>
                    <p style={{ fontSize: 12, color: '#8e9299', lineHeight: 1.5 }}>{card.expertArea}</p>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid #262736' }} className="flex justify-end">
              <button
                onClick={() => setRoleDialogOpen(false)}
                style={{ padding: '8px 24px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e8e9f0', fontSize: 14, cursor: 'pointer' }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
