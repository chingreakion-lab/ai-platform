"use client"
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Edit2, Bot, Database, Shield, Eye, RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { AIFriend, AIProvider } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

const providerConfig: Record<AIProvider, { label: string; color: string; models: string[] }> = {
  xai: { label: 'xAI (Grok)', color: '#6366f1', models: ['grok-3', 'grok-3-mini', 'grok-2-vision-1212'] },
  gemini: { label: 'Google Gemini', color: '#10b981', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'] },
  claude: { label: 'Anthropic Claude', color: '#f59e0b', models: ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] },
}

const defaultForm = { name: '', provider: 'xai' as AIProvider, model: 'grok-3', apiKey: '', description: '', role: 'feature' as 'chief'|'feature', avatar: '#6366f1' }

const avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

// Small helper: dark input style
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid #262736',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  color: '#e8e9f0',
  outline: 'none',
  boxSizing: 'border-box',
}

export function SettingsView() {
  const { friends, addFriend, updateFriend, removeFriend, getMemoriesByFriend, deleteMemory } = useAppStore()
  const [workspaceStatus, setWorkspaceStatus] = useState<{running: boolean; containerName: string; error?: string} | null>(null)
  const [wsLoading, setWsLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...defaultForm })

  const fetchWorkspaceStatus = async () => {
    setWsLoading(true)
    try {
      const res = await fetch('/api/workspace?action=status')
      const data = await res.json()
      setWorkspaceStatus(data)
    } catch (e) {
      setWorkspaceStatus({ running: false, containerName: 'ai-platform-workspace', error: String(e) })
    } finally {
      setWsLoading(false)
    }
  }

  useEffect(() => { fetchWorkspaceStatus() }, [])

  const handleSave = () => {
    if (!form.name.trim() || !form.apiKey.trim()) return
    if (editId) {
      updateFriend(editId, form)
    } else {
      addFriend(form)
    }
    setShowAdd(false)
    setEditId(null)
    setForm({ ...defaultForm })
  }

  const handleEdit = (f: AIFriend) => {
    setForm({ name: f.name, provider: f.provider, model: f.model, apiKey: f.apiKey, description: f.description, role: f.role, avatar: f.avatar })
    setEditId(f.id)
    setShowAdd(true)
  }

  const handleProviderChange = (p: AIProvider) => {
    setForm(prev => ({ ...prev, provider: p, model: providerConfig[p].models[0], avatar: providerConfig[p].color }))
  }

  const closeDialog = () => { setShowAdd(false); setEditId(null); setForm({ ...defaultForm }) }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0e0f1a', color: '#e8e9f0' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Page title */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e8e9f0', marginBottom: 4 }}>设置</h1>
          <p style={{ fontSize: 13, color: '#8e9299' }}>管理 AI 好友、API Keys 和记忆</p>
        </div>

        {/* ── AI Friends section ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot style={{ width: 18, height: 18, color: '#4285f4' }} />
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>AI 好友 &amp; API Keys</h2>
              <span style={{ fontSize: 11, color: '#4285f4', background: 'rgba(66,133,244,0.12)', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                {friends.length}
              </span>
            </div>
            <button
              onClick={() => { setForm({ ...defaultForm }); setEditId(null); setShowAdd(true) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 10,
                background: '#4285f4',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              添加好友
            </button>
          </div>

          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, overflow: 'hidden' }}>
            {friends.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#8e9299' }}>
                <Bot style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>还没有 AI 好友，点击"添加好友"开始</p>
              </div>
            ) : (
              friends.map((f, idx) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 20px',
                    borderBottom: idx < friends.length - 1 ? '1px solid #262736' : 'none',
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: f.avatar,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {f.name[0]}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e9f0' }}>{f.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: 20,
                          background: f.role === 'chief' ? 'rgba(66,133,244,0.12)' : 'rgba(255,255,255,0.06)',
                          color: f.role === 'chief' ? '#4285f4' : '#8e9299',
                        }}
                      >
                        {f.role === 'chief' ? '主工程师' : '功能工程师'}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#8e9299', marginTop: 2 }}>
                      {providerConfig[f.provider]?.label} · {f.model}
                    </p>
                    {f.description && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => handleEdit(f)}
                      style={{ width: 30, height: 30, borderRadius: 8, background: 'none', border: '1px solid #262736', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#4285f4'; e.currentTarget.style.color = '#4285f4' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#262736'; e.currentTarget.style.color = '#8e9299' }}
                    >
                      <Edit2 style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      onClick={() => removeFriend(f.id)}
                      style={{ width: 30, height: 30, borderRadius: 8, background: 'none', border: '1px solid #262736', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#262736'; e.currentTarget.style.color = '#8e9299' }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Memory Management ── */}
        {friends.some(f => getMemoriesByFriend(f.id).length > 0) && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Database style={{ width: 18, height: 18, color: '#a855f7' }} />
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>记忆管理</h2>
            </div>

            <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, overflow: 'hidden' }}>
              {friends.map((f, friendIdx) => {
                const mems = getMemoriesByFriend(f.id)
                if (mems.length === 0) return null
                return (
                  <div
                    key={f.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: friendIdx < friends.length - 1 ? '1px solid #262736' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{ width: 24, height: 24, borderRadius: '50%', background: f.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}
                        >
                          {f.name.charAt(0)}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e9f0' }}>{f.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                          {mems.length} 条
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`确定清空 ${f.name} 的所有记忆？此操作不可撤销。`)) {
                            mems.forEach(m => deleteMemory(m.id))
                          }
                        }}
                        style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        清空全部
                      </button>
                    </div>

                    {/* Memory table */}
                    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #262736' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#8e9299', borderBottom: '1px solid #262736', width: '55%' }}>内容</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#8e9299', borderBottom: '1px solid #262736', width: '25%' }}>标签</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#8e9299', borderBottom: '1px solid #262736', width: '15%' }}>日期</th>
                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #262736', width: '5%' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {mems.map((m, i) => (
                            <tr
                              key={m.id}
                              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                            >
                              <td style={{ padding: '8px 12px', color: 'rgba(232,233,240,0.8)', borderBottom: i < mems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                {m.summary}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#8e9299', borderBottom: i < mems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                {m.tags.slice(0, 3).join(', ')}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#8e9299', borderBottom: i < mems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: i < mems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <button
                                  onClick={() => deleteMemory(m.id)}
                                  style={{ width: 20, height: 20, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                  onMouseLeave={e => (e.currentTarget.style.color = '#8e9299')}
                                >
                                  <X style={{ width: 11, height: 11 }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Workspace Status ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Database style={{ width: 18, height: 18, color: '#4285f4' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>代码执行工作区 (Docker)</h2>
            <button
              onClick={fetchWorkspaceStatus}
              disabled={wsLoading}
              style={{ background: 'none', border: 'none', cursor: wsLoading ? 'not-allowed' : 'pointer', color: '#8e9299', display: 'flex', alignItems: 'center', marginLeft: 4 }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} className={wsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, padding: '16px 20px' }}>
            {workspaceStatus === null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8e9299' }}>
                <RefreshCw style={{ width: 14, height: 14 }} className="animate-spin" />
                检测中...
              </div>
            ) : workspaceStatus.running ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 style={{ width: 16, height: 16, color: '#22c55e' }} />
                <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>容器运行中</span>
                <span style={{ fontSize: 12, color: '#8e9299' }}>· {workspaceStatus.containerName}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle style={{ width: 16, height: 16, color: '#f97316' }} />
                  <span style={{ fontSize: 13, color: '#f97316', fontWeight: 500 }}>容器未运行 — Agent 执行时自动启动，首次约 10–30 秒</span>
                </div>
                {workspaceStatus.error && (
                  <pre style={{ fontSize: 11, color: '#8e9299', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {workspaceStatus.error}
                  </pre>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── R2 Storage ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Database style={{ width: 18, height: 18, color: '#10b981' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>存储配置 (Cloudflare R2)</h2>
          </div>
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: '#8e9299', lineHeight: 1.7 }}>
              文件上传至 Cloudflare R2，需通过服务器环境变量配置：
              {['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'].map(key => (
                <code key={key} style={{ display: 'inline-block', margin: '0 3px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace', color: '#93bbfc' }}>
                  {key}
                </code>
              ))}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>配置完成后附件上传功能自动可用，未配置则上传会报错。</p>
          </div>
        </section>

        {/* ── Permission Model ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield style={{ width: 18, height: 18, color: '#a855f7' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>权限模型</h2>
          </div>
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: '主工程师', desc: '可修改平台整体配置、管理群与功能板块绑定关系。不可修改功能板块内部实现。', color: '#4285f4', bg: 'rgba(66,133,244,0.08)', abbr: '主' },
              { label: '功能群工程师', desc: '只能修改自己负责的功能板块，不可修改其他板块或整体平台配置。', color: '#10b981', bg: 'rgba(16,185,129,0.08)', abbr: '功' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12, background: item.bg }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {item.abbr}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#e8e9f0', marginBottom: 3 }}>{item.label}</p>
                  <p style={{ fontSize: 12, color: '#8e9299', lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Supervisor ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Eye style={{ width: 18, height: 18, color: '#f97316' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>监工机制</h2>
          </div>
          <div style={{ background: '#161724', border: '1px solid #262736', borderRadius: 16, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#8e9299' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                <span>Playwright 截图 + Gemini Vision 视觉验收</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', paddingLeft: 14 }}>
                监工会自动截取页面截图，使用 Gemini Vision 分析是否符合验收标准。不合格结果将被打回重新执行。
              </p>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginTop: 4 }}>
                <p style={{ color: '#8e9299', marginBottom: 4 }}>API 端点: <code style={{ fontFamily: 'monospace', color: '#93bbfc' }}>POST /api/supervisor</code></p>
                <p style={{ color: '#8e9299' }}>参数: <code style={{ fontFamily: 'monospace', color: '#93bbfc' }}>url, criteria</code></p>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* ── Add/Edit Friend Dialog ── */}
      {showAdd && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50 }}
          className="flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeDialog() }}
        >
          <div
            style={{ background: '#161724', border: '1px solid #262736', borderRadius: 20, width: '100%', maxWidth: 460 }}
            className="shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #262736', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e8e9f0' }}>{editId ? '编辑 AI 好友' : '添加 AI 好友'}</h3>
                <p style={{ fontSize: 12, color: '#8e9299', marginTop: 2 }}>配置 AI 好友信息和 API Key</p>
              </div>
              <button
                onClick={closeDialog}
                style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e9299' }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name + Role row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>名称 *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="好友名称"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#4285f4')}
                    onBlur={e => (e.target.style.borderColor = '#262736')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>角色</label>
                  <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as 'chief'|'feature' }))}>
                    <SelectTrigger style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, color: '#e8e9f0', fontSize: 13, height: 37 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chief" className="text-xs">主工程师</SelectItem>
                      <SelectItem value="feature" className="text-xs">功能工程师</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Provider */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>提供商 *</label>
                <Select value={form.provider} onValueChange={v => handleProviderChange(v as AIProvider)}>
                  <SelectTrigger style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, color: '#e8e9f0', fontSize: 13, height: 37 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(providerConfig).map(([val, cfg]) => (
                      <SelectItem key={val} value={val} className="text-xs">{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>模型</label>
                <Select value={form.model} onValueChange={v => setForm(p => ({ ...p, model: v }))}>
                  <SelectTrigger style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #262736', borderRadius: 10, color: '#e8e9f0', fontSize: 13, height: 37 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerConfig[form.provider]?.models.map(m => (
                      <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* API Key */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>API Key *</label>
                <input
                  value={form.apiKey}
                  onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="输入 API Key"
                  type="password"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#4285f4')}
                  onBlur={e => (e.target.style.borderColor = '#262736')}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 6 }}>描述</label>
                <input
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="角色描述"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#4285f4')}
                  onBlur={e => (e.target.style.borderColor = '#262736')}
                />
              </div>

              {/* Avatar color */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8e9299', display: 'block', marginBottom: 8 }}>头像颜色</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {avatarColors.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, avatar: c }))}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: form.avatar === c ? '3px solid #fff' : '3px solid transparent',
                        cursor: 'pointer',
                        transform: form.avatar === c ? 'scale(1.2)' : 'scale(1)',
                        transition: 'transform 0.15s',
                        outline: form.avatar === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #262736', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={closeDialog}
                style={{ padding: '8px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#8e9299', fontSize: 13, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.apiKey.trim()}
                style={{
                  padding: '8px 20px',
                  borderRadius: 12,
                  background: (!form.name.trim() || !form.apiKey.trim()) ? 'rgba(66,133,244,0.3)' : '#4285f4',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (!form.name.trim() || !form.apiKey.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {editId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
