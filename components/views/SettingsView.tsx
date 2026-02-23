"use client"
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Edit2, Bot, Database, Shield, Eye, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { AIFriend, AIProvider } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

const providerConfig: Record<AIProvider, { label: string; color: string; models: string[] }> = {
  xai: { label: 'xAI (Grok)', color: '#6366f1', models: ['grok-3', 'grok-3-mini', 'grok-2-vision-1212'] },
  gemini: { label: 'Google Gemini', color: '#10b981', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'] },
  claude: { label: 'Anthropic Claude', color: '#f59e0b', models: ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] },
}

const defaultForm = { name: '', provider: 'xai' as AIProvider, model: 'grok-3', apiKey: '', description: '', role: 'feature' as 'chief'|'feature', avatar: '#6366f1' }

export function SettingsView() {
  const { friends, addFriend, updateFriend, removeFriend, getMemoriesByFriend, deleteMemory } = useAppStore()
  const [workspaceStatus, setWorkspaceStatus] = useState<{running: boolean; containerName: string; error?: string} | null>(null)
  const [wsLoading, setWsLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

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
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...defaultForm })

  const avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

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

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* AI Friends */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-800">AI 好友</h2>
              <Badge variant="secondary" className="text-xs">{friends.length}</Badge>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setForm({...defaultForm}); setEditId(null); setShowAdd(true) }}>
              <Plus className="h-3.5 w-3.5" /> 添加好友
            </Button>
          </div>
          <div className="divide-y">
            {friends.map(f => (
              <div key={f.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: f.avatar }}>
                  {f.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{f.name}</span>
                    <Badge variant={f.role === 'chief' ? 'default' : 'secondary'} className="text-[10px]">
                      {f.role === 'chief' ? '主工程师' : '功能工程师'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{providerConfig[f.provider]?.label} · {f.model}</p>
                  {f.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{f.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-500"
                    onClick={() => handleEdit(f)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500"
                    onClick={() => removeFriend(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* R2 Storage Status */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Database className="h-5 w-5 text-green-500" />
            <h2 className="text-sm font-semibold text-gray-800">存储配置 (Cloudflare R2)</h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            <p className="text-xs text-gray-500">文件上传至 Cloudflare R2，需通过服务器环境变量配置：<code className="bg-gray-100 px-1 rounded text-[11px]">R2_ENDPOINT</code>、<code className="bg-gray-100 px-1 rounded text-[11px]">R2_ACCESS_KEY_ID</code>、<code className="bg-gray-100 px-1 rounded text-[11px]">R2_SECRET_ACCESS_KEY</code>、<code className="bg-gray-100 px-1 rounded text-[11px]">R2_BUCKET</code>、<code className="bg-gray-100 px-1 rounded text-[11px]">R2_PUBLIC_URL</code>。</p>
            <p className="text-xs text-gray-400">配置完成后附件上传功能自动可用，未配置则上传会报错。</p>
          </div>
        </div>

        {/* Workspace Status */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-800">代码执行工作区 (Docker)</h2>
            </div>
            <button onClick={fetchWorkspaceStatus} disabled={wsLoading} className="text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${wsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="px-6 py-4">
            {workspaceStatus === null ? (
              <div className="flex items-center gap-2 text-xs text-gray-400"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> 检测中...</div>
            ) : workspaceStatus.running ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-700 font-medium">容器运行中</span>
                <span className="text-xs text-gray-400">· {workspaceStatus.containerName}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-400" />
                  <span className="text-xs text-orange-600 font-medium">容器未运行 — Agent 执行时自动启动，首次启动约 10–30 秒</span>
                </div>
                {workspaceStatus.error && <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded p-2">{workspaceStatus.error}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Permission Model */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-500" />
            <h2 className="text-sm font-semibold text-gray-800">权限模型</h2>
          </div>
          <div className="px-6 py-4 space-y-3 text-xs text-gray-600">
            <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0">主</div>
              <div>
                <p className="font-semibold text-gray-800">主工程师</p>
                <p className="text-gray-500 mt-0.5">可修改平台整体配置、管理群与功能板块绑定关系。不可修改功能板块内部实现。</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-xs shrink-0">功</div>
              <div>
                <p className="font-semibold text-gray-800">功能群工程师</p>
                <p className="text-gray-500 mt-0.5">只能修改自己负责的功能板块，不可修改其他板块或整体平台配置。</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supervisor */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Eye className="h-5 w-5 text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-800">监工机制</h2>
          </div>
          <div className="px-6 py-4 space-y-3 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-400" />
              <span>Playwright 截图 + Gemini Vision 视觉验收</span>
            </div>
            <p className="text-gray-400">监工会自动截取页面截图，使用 Gemini Vision 分析是否符合验收标准。不合格结果将被打回重新执行。</p>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500">API 端点: <span className="font-mono">POST /api/supervisor</span></p>
              <p className="text-gray-500 mt-1">参数: <span className="font-mono">url, criteria</span></p>
            </div>
          </div>
        </div>

        {/* Memory Management */}
        {friends.some(f => getMemoriesByFriend(f.id).length > 0) && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-500" />
              <h2 className="text-sm font-semibold text-gray-800">记忆管理</h2>
            </div>
            <div className="divide-y">
              {friends.map(f => {
                const mems = getMemoriesByFriend(f.id)
                if (mems.length === 0) return null
                return (
                  <div key={f.id} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: f.avatar }}>{f.name.charAt(0)}</div>
                        <span className="text-sm font-medium text-gray-700">{f.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{mems.length} 条记忆</Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-500 border-red-200 hover:bg-red-50 h-7"
                        onClick={() => {
                          if (confirm(`确定清空 ${f.name} 的所有记忆？此操作不可撤销。`)) {
                            mems.forEach(m => deleteMemory(m.id))
                          }
                        }}
                      >
                        清空全部
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {mems.map(m => (
                        <div key={m.id} className="flex items-start justify-between gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 truncate">{m.summary}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                              {m.tags.length > 0 && ` · ${m.tags.slice(0, 3).join(', ')}`}
                            </p>
                          </div>
                          <button
                            onClick={() => deleteMemory(m.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all shrink-0 text-xs mt-0.5"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Friend Modal */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); if (!v) { setEditId(null); setForm({...defaultForm}) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? '编辑 AI 好友' : '添加 AI 好友'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">名称 *</label>
                <Input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="好友名称" className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">角色</label>
                <Select value={form.role} onValueChange={v => setForm(p => ({...p, role: v as 'chief'|'feature'}))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chief" className="text-xs">主工程师</SelectItem>
                    <SelectItem value="feature" className="text-xs">功能工程师</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">提供商 *</label>
              <Select value={form.provider} onValueChange={v => handleProviderChange(v as AIProvider)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(providerConfig).map(([val, cfg]) => (
                    <SelectItem key={val} value={val} className="text-xs">{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">模型</label>
              <Select value={form.model} onValueChange={v => setForm(p => ({...p, model: v}))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providerConfig[form.provider]?.models.map(m => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">API Key *</label>
              <Input value={form.apiKey} onChange={e => setForm(p => ({...p, apiKey: e.target.value}))}
                placeholder="输入 API Key" type="password" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">描述</label>
              <Input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
                placeholder="角色描述" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">头像颜色</label>
              <div className="flex gap-2">
                {avatarColors.map(c => (
                  <button key={c} onClick={() => setForm(p => ({...p, avatar: c}))}
                    className={`w-7 h-7 rounded-full transition-transform ${form.avatar === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditId(null); setForm({...defaultForm}) }}>取消</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.apiKey.trim()}>
              {editId ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
