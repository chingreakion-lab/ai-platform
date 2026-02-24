"use client"
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { ChatArea } from '@/components/chat/ChatArea'
import { Plus, LayoutGrid, Link2, History, ChevronLeft, MessageSquare, Trash2, X, Check, Users, Zap, Clock, FileText, Upload } from 'lucide-react'
import { BoardStatus, FeatureBoard } from '@/lib/types'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const statusConfig: Record<BoardStatus, { label: string; dot: string; badge: string }> = {
  planning:    { label: '规划中', dot: '#8e9299', badge: 'rgba(142,146,153,0.15)' },
  'in-progress': { label: '进行中', dot: '#4285f4', badge: 'rgba(66,133,244,0.15)' },
  done:        { label: '已完成', dot: '#22c55e', badge: 'rgba(34,197,94,0.15)' },
  paused:      { label: '已暂停', dot: '#f59e0b', badge: 'rgba(245,158,11,0.15)' },
}

// ── Small reusable primitives ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: BoardStatus }) {
  const cfg = statusConfig[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 8px', borderRadius: 20,
      background: cfg.badge, color: cfg.dot,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2, transition: 'width 0.4s ease',
        background: value >= 100 ? '#22c55e' : value >= 50 ? '#4285f4' : '#8e9299',
        width: `${value}%`,
      }} />
    </div>
  )
}

// ── Modal overlay ─────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e8e9f0' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e9299', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8 }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>{children}</label>
}

function DarkInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#e8e9f0', outline: 'none', boxSizing: 'border-box' }}
      onFocus={e => (e.currentTarget.style.borderColor = '#4285f4')}
      onBlur={e => (e.currentTarget.style.borderColor = '#262736')}
    />
  )
}

function DarkTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#e8e9f0', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
      onFocus={e => (e.currentTarget.style.borderColor = '#4285f4')}
      onBlur={e => (e.currentTarget.style.borderColor = '#262736')}
    />
  )
}

function DarkSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#161724', border: '1px solid #262736', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#e8e9f0', outline: 'none', cursor: 'pointer' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function PrimaryBtn({ onClick, disabled, children }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: disabled ? 'rgba(66,133,244,0.3)' : '#4285f4', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  )
}

function GhostBtn({ onClick, children, danger }: {
  onClick?: () => void; children: React.ReactNode; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : '#262736'}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, color: danger ? '#f87171' : '#8e9299', cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function FeatureView() {
  const {
    friends, groups, featureBoards, activeBoardId,
    createBoard, updateBoard, deleteBoard, addBoardHistory,
    bindGroupToBoard, unbindGroupFromBoard, setActiveBoard,
    addMessage, addLog, addTask, updateTask,
  } = useAppStore()

  const [showCreate, setShowCreate]     = useState(false)
  const [showBindGroup, setShowBindGroup] = useState(false)
  const [showGroupChat, setShowGroupChat] = useState(false)
  const [chatGroupId, setChatGroupId]   = useState<string | null>(null)
  const [isLoading, setIsLoading]       = useState(false)
  const [historyNote, setHistoryNote]   = useState('')

  // Create form state
  const [newName, setNewName]     = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [newOwner, setNewOwner]   = useState('')

  const activeBoard  = featureBoards.find(b => b.id === activeBoardId) || featureBoards[0] || null
  const boundGroups  = activeBoard ? groups.filter(g => activeBoard.boundGroupIds.includes(g.id)) : []
  const chatGroup    = groups.find(g => g.id === chatGroupId)
  const chatMembers  = chatGroup ? friends.filter(f => chatGroup.members.some(m => m.friendId === f.id)) : []

  useEffect(() => {
    if (!activeBoardId && featureBoards.length > 0) setActiveBoard(featureBoards[0].id)
  }, [featureBoards.length])

  // Close group chat when active board changes
  useEffect(() => {
    setShowGroupChat(false)
    setChatGroupId(null)
  }, [activeBoardId])

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

  const handleOpenGroupChat = (groupId: string) => {
    setChatGroupId(groupId)
    setShowGroupChat(true)
  }

  const handleSendGroupMessage = async (content: string, files?: File[]) => {
    if (!chatGroup) return
    setIsLoading(true)
    addMessage(chatGroup.id, { role: 'user', content, senderId: 'user', senderName: '我' })
    const history = chatGroup.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    history.push({ role: 'user', content })
    for (const member of chatMembers) {
      const taskId = addTask({ title: `${member.name} 正在回复`, description: chatGroup.name, status: 'running' })
      try {
        const res = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: member.provider, model: member.model, apiKey: member.apiKey, messages: history,
            systemPrompt: `你是 ${member.name}。当前功能板块: ${activeBoard?.name}。请简洁专业地参与协作。`,
          }),
        })
        const data = await res.json()
        if (data.response) {
          addMessage(chatGroup.id, { role: 'assistant', content: data.response, senderId: member.id, senderName: member.name })
          history.push({ role: 'assistant', content: data.response })
          updateTask(taskId, { status: 'done', result: '回复成功' })
        } else {
          updateTask(taskId, { status: 'failed', result: data.error })
        }
      } catch (e) {
        updateTask(taskId, { status: 'failed', result: String(e) })
      }
    }
    setIsLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0b0c14', overflow: 'hidden' }}>

      {/* ── Board list sidebar ───────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0e0f1a', borderRight: '1px solid #1e1f2e' }}>
        {/* Header */}
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid #1e1f2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
            <LayoutGrid style={{ width: 15, height: 15, color: '#4285f4' }} />
            功能板块
          </div>
          <button
            onClick={() => setShowCreate(true)}
            title="新建功能板块"
            style={{ width: 26, height: 26, borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(66,133,244,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#4285f4' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#8e9299' }}
          >
            <Plus style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Board list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {featureBoards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 12px', color: 'rgba(255,255,255,0.2)' }}>
              <LayoutGrid style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 12 }}>点击 + 新建</p>
            </div>
          ) : (
            featureBoards.map(board => {
              const isActive = activeBoardId === board.id
              return (
                <button
                  key={board.id}
                  onClick={() => setActiveBoard(board.id)}
                  style={{
                    width: '100%', textAlign: 'left', borderRadius: 10, padding: '9px 10px',
                    marginBottom: 3, border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                    background: isActive ? 'rgba(66,133,244,0.12)' : 'transparent',
                    outline: isActive ? '1px solid rgba(66,133,244,0.25)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <p style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#e8e9f0' : 'rgba(255,255,255,0.6)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {board.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <StatusBadge status={board.status} />
                    <span style={{ fontSize: 10, color: '#8e9299' }}>v{board.version}</span>
                  </div>
                  <ProgressBar value={board.progress} />
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Group chat panel (slides in) ──────────────────────────────────── */}
      {showGroupChat && chatGroup && (
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0e0f1a', borderRight: '1px solid #1e1f2e' }}>
          {/* Panel header */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e1f2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#13131e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(66,133,244,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare style={{ width: 13, height: 13, color: '#4285f4' }} />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#e8e9f0' }}>{chatGroup.name}</p>
                <p style={{ fontSize: 10, color: '#8e9299' }}>{chatMembers.length} 成员</p>
              </div>
            </div>
            <button
              onClick={() => setShowGroupChat(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e9299', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
            </button>
          </div>
          {/* File upload hint bar */}
          <div style={{ padding: '6px 12px', background: 'rgba(66,133,244,0.06)', borderBottom: '1px solid rgba(66,133,244,0.12)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload style={{ width: 11, height: 11, color: '#4285f4' }} />
            <span style={{ fontSize: 10, color: 'rgba(66,133,244,0.8)' }}>点击 📎 附件图标可上传群文件</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatArea
              messages={chatGroup.messages}
              onSendMessage={handleSendGroupMessage}
              members={chatMembers}
              isLoading={isLoading}
              placeholder="群聊中发消息..."
            />
          </div>
        </div>
      )}

      {/* ── Board detail ─────────────────────────────────────────────────── */}
      {activeBoard ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Board header */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid #1e1f2e', background: '#0e0f1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e8e9f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeBoard.name}
                </h2>
                <StatusBadge status={activeBoard.status} />
              </div>
              <p style={{ fontSize: 12, color: '#8e9299', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeBoard.description || '暂无描述'}
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* Bound group chat buttons */}
              {boundGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleOpenGroupChat(g.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: chatGroupId === g.id && showGroupChat ? 'rgba(66,133,244,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${chatGroupId === g.id && showGroupChat ? 'rgba(66,133,244,0.4)' : '#262736'}`,
                    borderRadius: 8, padding: '5px 10px', fontSize: 12,
                    color: chatGroupId === g.id && showGroupChat ? '#4285f4' : '#8e9299',
                    cursor: 'pointer',
                  }}
                  title={`打开 ${g.name} 群聊`}
                >
                  <MessageSquare style={{ width: 12, height: 12 }} />
                  {g.name}
                </button>
              ))}

              {/* Bind group button */}
              <button
                onClick={() => setShowBindGroup(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#8e9299', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(66,133,244,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#4285f4'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(66,133,244,0.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#8e9299'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#262736' }}
                title="绑定群组到功能板块"
              >
                <Link2 style={{ width: 12, height: 12 }} />
                绑定群组
                {boundGroups.length > 0 && (
                  <span style={{ background: '#4285f4', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px' }}>
                    {boundGroups.length}
                  </span>
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => { deleteBoard(activeBoard.id); setActiveBoard(null) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'none', border: '1px solid #262736', borderRadius: 8, cursor: 'pointer', color: '#8e9299' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#8e9299'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#262736' }}
                title="删除功能板块"
              >
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {/* Board content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { icon: <Zap style={{ width: 16, height: 16, color: '#4285f4' }} />, label: '进度', value: `${activeBoard.progress}%`, sub: '' },
                  { icon: <FileText style={{ width: 16, height: 16, color: '#a855f7' }} />, label: '版本', value: `v${activeBoard.version}`, sub: '' },
                  { icon: <Users style={{ width: 16, height: 16, color: '#22c55e' }} />, label: '绑定群组', value: `${boundGroups.length}`, sub: '个' },
                ].map((s, i) => (
                  <div key={i} style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {s.icon}
                      <span style={{ fontSize: 11, color: '#8e9299', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#e8e9f0' }}>{s.value}<span style={{ fontSize: 13, fontWeight: 400, color: '#8e9299', marginLeft: 3 }}>{s.sub}</span></p>
                  </div>
                ))}
              </div>

              {/* Progress control */}
              <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>进度调整</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: activeBoard.progress >= 100 ? '#22c55e' : '#4285f4' }}>{activeBoard.progress}%</span>
                </div>
                <ProgressBar value={activeBoard.progress} />
                <input
                  type="range" min={0} max={100} value={activeBoard.progress}
                  onChange={e => updateBoard(activeBoard.id, { progress: parseInt(e.target.value) })}
                  style={{ width: '100%', marginTop: 10, accentColor: '#4285f4' }}
                />
              </div>

              {/* Status & Version row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 16 }}>
                  <FieldLabel>状态</FieldLabel>
                  <DarkSelect
                    value={activeBoard.status}
                    onChange={v => updateBoard(activeBoard.id, { status: v as BoardStatus })}
                    options={Object.entries(statusConfig).map(([val, cfg]) => ({ value: val, label: cfg.label }))}
                  />
                </div>
                <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 16 }}>
                  <FieldLabel>版本号</FieldLabel>
                  <DarkInput
                    value={activeBoard.version}
                    onChange={v => updateBoard(activeBoard.id, { version: v })}
                    placeholder="e.g. 1.0.0"
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 16 }}>
                <FieldLabel>描述</FieldLabel>
                <DarkTextarea
                  value={activeBoard.description}
                  onChange={v => updateBoard(activeBoard.id, { description: v })}
                  placeholder="功能板块描述..."
                />
              </div>

              {/* Bound groups section */}
              {boundGroups.length > 0 && (
                <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <FieldLabel>已绑定群组</FieldLabel>
                    <button
                      onClick={() => setShowBindGroup(true)}
                      style={{ fontSize: 11, color: '#4285f4', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      管理
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {boundGroups.map(g => {
                      const memberCount = friends.filter(f => g.members.some(m => m.friendId === f.id)).length
                      return (
                        <div
                          key={g.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 10, padding: '6px 10px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Users style={{ width: 12, height: 12, color: '#4285f4' }} />
                            <span style={{ fontSize: 12, color: '#e8e9f0', fontWeight: 600 }}>{g.name}</span>
                            <span style={{ fontSize: 10, color: '#8e9299' }}>{memberCount} 人</span>
                          </div>
                          <button
                            onClick={() => handleOpenGroupChat(g.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(66,133,244,0.15)', border: 'none', borderRadius: 6, padding: '2px 7px', fontSize: 11, color: '#4285f4', cursor: 'pointer' }}
                            title="打开群聊"
                          >
                            <MessageSquare style={{ width: 10, height: 10 }} />
                            聊天
                          </button>
                          <button
                            onClick={() => unbindGroupFromBoard(g.id, activeBoard.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e9299', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4 }}
                            title="解除绑定"
                          >
                            <X style={{ width: 11, height: 11 }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* No groups bound — CTA */}
              {boundGroups.length === 0 && (
                <button
                  onClick={() => setShowBindGroup(true)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(66,133,244,0.05)', border: '1px dashed rgba(66,133,244,0.3)', borderRadius: 12, padding: '28px 0', cursor: 'pointer', width: '100%' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(66,133,244,0.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(66,133,244,0.05)' }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(66,133,244,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Link2 style={{ width: 20, height: 20, color: '#4285f4' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#4285f4', marginBottom: 4 }}>绑定群组</p>
                    <p style={{ fontSize: 12, color: '#8e9299' }}>将群聊绑定到此功能板块，可进行协作讨论 & 上传群文件</p>
                  </div>
                </button>
              )}

              {/* History */}
              <div style={{ background: '#161724', border: '1px solid #1e1f2e', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Clock style={{ width: 14, height: 14, color: '#8e9299' }} />
                  <FieldLabel>历史记录</FieldLabel>
                </div>

                {/* Add history input */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <input
                    value={historyNote}
                    onChange={e => setHistoryNote(e.target.value)}
                    placeholder="记录一条更新说明..."
                    onKeyDown={e => { if (e.key === 'Enter') handleAddHistory() }}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, padding: '7px 12px', fontSize: 13, color: '#e8e9f0', outline: 'none' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#4285f4')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#262736')}
                  />
                  <button
                    onClick={handleAddHistory}
                    disabled={!historyNote.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: historyNote.trim() ? '#4285f4' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: historyNote.trim() ? '#fff' : '#8e9299', cursor: historyNote.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    <Check style={{ width: 13, height: 13 }} />
                    添加
                  </button>
                </div>

                {/* History list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {activeBoard.history.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#8e9299', textAlign: 'center', padding: '20px 0' }}>暂无历史记录</p>
                  ) : (
                    [...activeBoard.history].reverse().map((h, idx) => (
                      <div
                        key={h.id}
                        style={{ display: 'flex', gap: 12, paddingLeft: 12, paddingBottom: idx < activeBoard.history.length - 1 ? 14 : 0, borderLeft: idx < activeBoard.history.length - 1 ? '1px solid #262736' : '1px solid transparent', position: 'relative', marginLeft: 6 }}
                      >
                        <div style={{ position: 'absolute', left: -5, top: 4, width: 9, height: 9, borderRadius: '50%', background: '#262736', border: '2px solid #4285f4', flexShrink: 0 }} />
                        <div style={{ paddingLeft: 12 }}>
                          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{h.description}</p>
                          <p style={{ fontSize: 10, color: '#8e9299', fontFamily: 'monospace' }}>
                            {format(h.timestamp, 'yyyy-MM-dd HH:mm')} · v{h.version}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0c14' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <LayoutGrid style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.15)' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>选择或创建功能板块</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginBottom: 20 }}>管理功能开发进度 · 绑定群组协作 · 上传项目文件</p>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#4285f4', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              新建功能板块
            </button>
          </div>
        </div>
      )}

      {/* ── Create board modal ───────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建功能板块">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>名称 *</FieldLabel>
            <DarkInput value={newName} onChange={setNewName} placeholder="功能板块名称" />
          </div>
          <div>
            <FieldLabel>描述</FieldLabel>
            <DarkTextarea value={newDesc} onChange={setNewDesc} placeholder="简要描述功能目标..." rows={3} />
          </div>
          <div>
            <FieldLabel>负责工程师</FieldLabel>
            <DarkSelect
              value={newOwner}
              onChange={setNewOwner}
              options={[
                { value: '', label: '选择负责人（可选）' },
                ...friends.filter(f => f.role === 'feature').map(f => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={() => setShowCreate(false)}
            style={{ flex: 1, background: 'none', border: '1px solid #262736', borderRadius: 10, padding: '8px 0', fontSize: 13, color: '#8e9299', cursor: 'pointer' }}
          >取消</button>
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            style={{ flex: 1, background: newName.trim() ? '#4285f4' : 'rgba(66,133,244,0.3)', border: 'none', borderRadius: 10, padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#fff', cursor: newName.trim() ? 'pointer' : 'not-allowed' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Plus style={{ width: 14, height: 14 }} /> 创建
            </span>
          </button>
        </div>
      </Modal>

      {/* ── Bind group modal ─────────────────────────────────────────────── */}
      <Modal open={showBindGroup} onClose={() => setShowBindGroup(false)} title="绑定群组">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#8e9299' }}>
              <Users style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 13 }}>暂无群组，请先在对话区创建群组</p>
            </div>
          ) : (
            groups.map(g => {
              const bound = activeBoard?.boundGroupIds.includes(g.id)
              const memberCount = friends.filter(f => g.members.some(m => m.friendId === f.id)).length
              return (
                <div
                  key={g.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: bound ? 'rgba(66,133,244,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${bound ? 'rgba(66,133,244,0.2)' : '#262736'}`, borderRadius: 10, padding: '10px 12px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: bound ? 'rgba(66,133,244,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users style={{ width: 15, height: 15, color: bound ? '#4285f4' : '#8e9299' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#e8e9f0', marginBottom: 2 }}>{g.name}</p>
                      <p style={{ fontSize: 11, color: '#8e9299' }}>{memberCount} 名成员</p>
                    </div>
                  </div>
                  <button
                    onClick={() => activeBoard && (bound
                      ? unbindGroupFromBoard(g.id, activeBoard.id)
                      : bindGroupToBoard(g.id, activeBoard.id))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: bound ? 'rgba(239,68,68,0.1)' : 'rgba(66,133,244,0.1)',
                      border: `1px solid ${bound ? 'rgba(239,68,68,0.3)' : 'rgba(66,133,244,0.3)'}`,
                      borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                      color: bound ? '#f87171' : '#4285f4', cursor: 'pointer',
                    }}
                  >
                    {bound ? (
                      <><X style={{ width: 11, height: 11 }} />解绑</>
                    ) : (
                      <><Link2 style={{ width: 11, height: 11 }} />绑定</>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <button
          onClick={() => setShowBindGroup(false)}
          style={{ width: '100%', background: '#4285f4', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', marginTop: 4 }}
        >
          完成
        </button>
      </Modal>
    </div>
  )
}
