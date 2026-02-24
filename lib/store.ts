'use client'
import { create } from 'zustand'
import { AIFriend, Group, FeatureBoard, Message, Task, LogEntry, ViewType, BoardStatus, BoardHistory, Conversation, RoleCard, DEFAULT_ROLE_CARDS, Memory } from './types'
import { v4 as uuidv4 } from 'uuid'

const XAI_KEY = process.env.NEXT_PUBLIC_XAI_API_KEY || ''
const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
const CLAUDE_KEY = process.env.NEXT_PUBLIC_CLAUDE_API_KEY || ''

const defaultFriends: AIFriend[] = [
  { id: 'grok-default', name: 'Grok', provider: 'xai', model: 'grok-3', apiKey: XAI_KEY, avatar: '#6366f1', description: '主工程师 - 负责整体架构与协调', role: 'chief', workspaceType: 'local' },
  { id: 'gemini-default', name: 'Gemini', provider: 'gemini', model: 'gemini-2.5-flash', apiKey: GEMINI_KEY, avatar: '#10b981', description: '功能群工程师 - 擅长分析与设计', role: 'feature' },
  { id: 'claude-default', name: 'Claude', provider: 'claude', model: 'claude-opus-4-6', apiKey: CLAUDE_KEY, avatar: '#f59e0b', description: '功能群工程师 - 擅长代码与实现', role: 'feature' },
]

// ── DB persistence helpers (fire-and-forget) ──────────────────────────────────

function persist(entity: string, data: object) {
  fetch('/api/db/entity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _entity: entity, ...data }),
  }).catch(() => {})
}

function persistDelete(entity: string, id: string) {
  fetch(`/api/db/entity?entity=${entity}&id=${id}`, { method: 'DELETE' }).catch(() => {})
}

async function loadFromDB(): Promise<Partial<AppState> | null> {
  try {
    const res = await fetch('/api/db/load')
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ── AppState interface ─────────────────────────────────────────────────────────

interface AppState {
  friends: AIFriend[]
  groups: Group[]
  conversations: Conversation[]
  roleCards: RoleCard[]
  memories: Memory[]
  featureBoards: FeatureBoard[]
  tasks: Task[]
  logs: LogEntry[]
  activeView: ViewType
  sidebarOpen: boolean
  activeGroupId: string | null
  activeBoardId: string | null
  activeConversationId: string | null
  outerMessages: Message[]
  _hydrated: boolean

  hydrate: () => Promise<void>
  addFriend: (friend: Omit<AIFriend, 'id'>) => void
  updateFriend: (id: string, updates: Partial<AIFriend>) => void
  removeFriend: (id: string) => void

  addConversation: (friendId: string, name: string) => string
  deleteConversation: (id: string) => void
  renameConversation: (id: string, name: string) => void
  addConversationMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
  updateConversationMessage: (conversationId: string, messageId: string, content: string) => void
  setActiveConversation: (id: string | null) => void
  getConversationsByFriend: (friendId: string) => Conversation[]

  addRoleCard: (card: Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateRoleCard: (id: string, updates: Partial<Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>>) => void
  deleteRoleCard: (id: string) => void
  getRoleCard: (id: string) => RoleCard | undefined
  updateGroupMemberRole: (groupId: string, friendId: string, roleCardId: string) => void
  addGroupMember: (groupId: string, friendId: string, roleCardId?: string) => void
  removeGroupMember: (groupId: string, friendId: string) => void

  addMemory: (memory: Omit<Memory, 'id' | 'createdAt'>) => string
  deleteMemory: (id: string) => void
  getMemoriesByFriend: (friendId: string) => Memory[]
  searchMemories: (friendId: string, query: string) => Memory[]

  createGroup: (name: string, memberIds: string[], roleMap?: Record<string, string>) => string
  updateGroup: (id: string, updates: Partial<Group>) => void
  deleteGroup: (id: string) => void
  addMessage: (groupId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
  updateGroupMessage: (groupId: string, messageId: string, content: string) => void
  createBoard: (name: string, description: string, ownerId: string) => string
  updateBoard: (id: string, updates: Partial<FeatureBoard>) => void
  deleteBoard: (id: string) => void
  addBoardHistory: (boardId: string, entry: Omit<BoardHistory, 'id' | 'timestamp'>) => void
  bindGroupToBoard: (groupId: string, boardId: string) => void
  unbindGroupFromBoard: (groupId: string, boardId: string) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTask: (id: string, updates: Partial<Task>) => void
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  setActiveView: (view: ViewType) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setActiveGroup: (id: string | null) => void
  setActiveBoard: (id: string | null) => void
  addOuterMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
}

export const useAppStore = create<AppState>()((set, get) => ({
  friends: defaultFriends,
  groups: [],
  conversations: [],
  roleCards: DEFAULT_ROLE_CARDS.map(card => ({ ...card, id: card.name, createdAt: 0, updatedAt: 0 })),
  memories: [],
  featureBoards: [],
  tasks: [],
  logs: [],
  activeView: 'main',
  sidebarOpen: false,
  activeGroupId: null,
  activeBoardId: null,
  activeConversationId: null,
  outerMessages: [],
  _hydrated: false,

  hydrate: async () => {
    if (get()._hydrated) return
    const saved = await loadFromDB()
    const isEmpty = !saved || Object.keys(saved).length === 0 ||
      (!(saved as Partial<AppState>).friends?.length &&
       !(saved as Partial<AppState>).groups?.length &&
       !(saved as Partial<AppState>).conversations?.length)

    // One-time migration from localStorage
    if (isEmpty && typeof window !== 'undefined') {
      const local = localStorage.getItem('ai-platform-v1')
      if (local) {
        try {
          await fetch('/api/db/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: local }),
          })
          localStorage.removeItem('ai-platform-v1')
          const migrated = await loadFromDB()
          if (migrated && Object.keys(migrated).length > 0) {
            const m = migrated as Partial<AppState>
            set({
              friends: m.friends?.length ? m.friends : defaultFriends,
              groups: m.groups || [],
              conversations: m.conversations || [],
              roleCards: DEFAULT_ROLE_CARDS.map(c => ({ ...c, id: c.name, createdAt: 0, updatedAt: 0 })),
              memories: m.memories || [],
              featureBoards: m.featureBoards || [],
              tasks: m.tasks || [],
              logs: m.logs || [],
              outerMessages: m.outerMessages || [],
              _hydrated: true,
            })
            return
          }
        } catch { /* migration failed, continue with empty */ }
      }
    }

    if (!isEmpty) {
      const s = saved as Partial<AppState>
      set({
        friends: s.friends?.length ? s.friends : defaultFriends,
        groups: s.groups || [],
        conversations: s.conversations || [],
        roleCards: DEFAULT_ROLE_CARDS.map(c => ({ ...c, id: c.name, createdAt: 0, updatedAt: 0 })),
        memories: s.memories || [],
        featureBoards: s.featureBoards || [],
        tasks: s.tasks || [],
        logs: s.logs || [],
        outerMessages: s.outerMessages || [],
        _hydrated: true,
      })
    } else {
      set({ _hydrated: true })
    }
  },

  addFriend: (friend) => set((state) => {
    const newFriend = { ...friend, id: uuidv4() }
    persist('friend', newFriend)
    return { friends: [...state.friends, newFriend] }
  }),
  updateFriend: (id, updates) => set((state) => {
    const friends = state.friends.map(f => f.id === id ? { ...f, ...updates } : f)
    const updated = friends.find(f => f.id === id)
    if (updated) persist('friend', updated)
    return { friends }
  }),
  removeFriend: (id) => set((state) => {
    persistDelete('friend', id)
    return { friends: state.friends.filter(f => f.id !== id) }
  }),

  addConversation: (friendId, name) => {
    const id = uuidv4()
    const conv = { id, friendId, name, messages: [], createdAt: Date.now(), lastActiveAt: Date.now() }
    set((state) => {
      persist('conversation', conv)
      return { conversations: [...state.conversations, conv], activeConversationId: id }
    })
    return id
  },
  deleteConversation: (id) => set((state) => {
    persistDelete('conversation', id)
    return { conversations: state.conversations.filter(c => c.id !== id) }
  }),
  renameConversation: (id, name) => set((state) => {
    const conversations = state.conversations.map(c => c.id === id ? { ...c, name } : c)
    const updated = conversations.find(c => c.id === id)
    if (updated) persist('conversation', updated)
    return { conversations }
  }),
  addConversationMessage: (conversationId, message) => {
    const id = uuidv4()
    const msg = { ...message, id, timestamp: Date.now() }
    set((state) => {
      persist('message', { ...msg, _parentType: 'conversation', _parentId: conversationId })
      return {
        conversations: state.conversations.map(c => c.id === conversationId ? {
          ...c,
          messages: [...c.messages, msg],
          lastActiveAt: Date.now()
        } : c)
      }
    })
    return id
  },
  updateConversationMessage: (conversationId, messageId, content) => set((state) => {
    persist('message_update', { id: messageId, content })
    return {
      conversations: state.conversations.map(c => c.id === conversationId ? {
        ...c,
        messages: c.messages.map(m => m.id === messageId ? { ...m, content } : m)
      } : c)
    }
  }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  getConversationsByFriend: (friendId) => get().conversations.filter(c => c.friendId === friendId),

  createGroup: (name, memberIds, roleMap = {}) => {
    const id = uuidv4()
    const group: Group = {
      id, name,
      members: memberIds.map(friendId => ({ friendId, roleCardId: roleMap[friendId] || '' })),
      announcement: '', announcementFiles: [], messages: [], boundBoardIds: [],
      createdAt: Date.now()
    }
    set((state) => {
      persist('group', group)
      return { groups: [...state.groups, group], activeGroupId: id }
    })
    return id
  },
  updateGroup: (id, updates) => set((state) => {
    const groups = state.groups.map(g => g.id === id ? { ...g, ...updates } : g)
    const updated = groups.find(g => g.id === id)
    if (updated) persist('group', updated)
    return { groups }
  }),
  deleteGroup: (id) => set((state) => {
    persistDelete('group', id)
    return { groups: state.groups.filter(g => g.id !== id) }
  }),
  addMessage: (groupId, message) => {
    const id = uuidv4()
    const msg = { ...message, id, timestamp: Date.now() }
    set((state) => {
      persist('message', { ...msg, _parentType: 'group', _parentId: groupId })
      return {
        groups: state.groups.map(g => g.id === groupId ? { ...g, messages: [...g.messages, msg] } : g)
      }
    })
    return id
  },
  updateGroupMessage: (groupId, messageId, content) => set((state) => {
    persist('message_update', { id: messageId, content })
    return {
      groups: state.groups.map(g => g.id === groupId ? {
        ...g,
        messages: g.messages.map(m => m.id === messageId ? { ...m, content } : m)
      } : g)
    }
  }),

  createBoard: (name, description, ownerId) => {
    const id = uuidv4()
    const board: FeatureBoard = {
      id, name, description, ownerId,
      version: '0.1.0', progress: 0,
      status: 'planning' as BoardStatus,
      history: [], boundGroupIds: [],
      createdAt: Date.now(), updatedAt: Date.now()
    }
    set((state) => {
      persist('board', board)
      return { featureBoards: [...state.featureBoards, board], activeBoardId: id }
    })
    return id
  },
  updateBoard: (id, updates) => set((state) => {
    const featureBoards = state.featureBoards.map(b => b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b)
    const updated = featureBoards.find(b => b.id === id)
    if (updated) persist('board', updated)
    return { featureBoards }
  }),
  deleteBoard: (id) => set((state) => {
    persistDelete('board', id)
    return { featureBoards: state.featureBoards.filter(b => b.id !== id) }
  }),
  addBoardHistory: (boardId, entry) => set((state) => {
    const featureBoards = state.featureBoards.map(b => b.id === boardId ? {
      ...b,
      history: [...b.history, { ...entry, id: uuidv4(), timestamp: Date.now() }],
      updatedAt: Date.now()
    } : b)
    const updated = featureBoards.find(b => b.id === boardId)
    if (updated) persist('board', updated)
    return { featureBoards }
  }),
  bindGroupToBoard: (groupId, boardId) => set((state) => {
    const groups = state.groups.map(g => g.id === groupId ? {
      ...g, boundBoardIds: g.boundBoardIds.includes(boardId) ? g.boundBoardIds : [...g.boundBoardIds, boardId]
    } : g)
    const featureBoards = state.featureBoards.map(b => b.id === boardId ? {
      ...b, boundGroupIds: b.boundGroupIds.includes(groupId) ? b.boundGroupIds : [...b.boundGroupIds, groupId]
    } : b)
    const updatedGroup = groups.find(g => g.id === groupId)
    const updatedBoard = featureBoards.find(b => b.id === boardId)
    if (updatedGroup) persist('group', updatedGroup)
    if (updatedBoard) persist('board', updatedBoard)
    return { groups, featureBoards }
  }),
  unbindGroupFromBoard: (groupId, boardId) => set((state) => {
    const groups = state.groups.map(g => g.id === groupId ? {
      ...g, boundBoardIds: g.boundBoardIds.filter(id => id !== boardId)
    } : g)
    const featureBoards = state.featureBoards.map(b => b.id === boardId ? {
      ...b, boundGroupIds: b.boundGroupIds.filter(id => id !== groupId)
    } : b)
    const updatedGroup = groups.find(g => g.id === groupId)
    const updatedBoard = featureBoards.find(b => b.id === boardId)
    if (updatedGroup) persist('group', updatedGroup)
    if (updatedBoard) persist('board', updatedBoard)
    return { groups, featureBoards }
  }),

  addTask: (task) => {
    const id = uuidv4()
    const t = { ...task, id, createdAt: Date.now(), updatedAt: Date.now() }
    set((state) => {
      persist('task', t)
      return { tasks: [...state.tasks, t] }
    })
    return id
  },
  updateTask: (id, updates) => set((state) => {
    const tasks = state.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)
    const updated = tasks.find(t => t.id === id)
    if (updated) persist('task', updated)
    return { tasks }
  }),
  addLog: (log) => set((state) => {
    const entry = { ...log, id: uuidv4(), timestamp: Date.now() }
    persist('log', entry)
    return { logs: [entry, ...state.logs].slice(0, 500) }
  }),
  clearLogs: () => set(() => {
    persistDelete('logs', 'all')
    return { logs: [] }
  }),

  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveGroup: (id) => set({ activeGroupId: id }),
  setActiveBoard: (id) => set({ activeBoardId: id }),
  addOuterMessage: (message) => set((state) => {
    const msg = { ...message, id: uuidv4(), timestamp: Date.now() }
    persist('message', { ...msg, _parentType: 'outer', _parentId: 'outer' })
    return { outerMessages: [...state.outerMessages, msg] }
  }),

  addRoleCard: (card) => {
    const id = uuidv4()
    const newCard = { ...card, id, createdAt: Date.now(), updatedAt: Date.now() }
    set((state) => {
      persist('rolecard', newCard)
      return { roleCards: [...state.roleCards, newCard] }
    })
    return id
  },
  updateRoleCard: (id, updates) => set((state) => {
    const roleCards = state.roleCards.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c)
    const updated = roleCards.find(c => c.id === id)
    if (updated) persist('rolecard', updated)
    return { roleCards }
  }),
  deleteRoleCard: (id) => set((state) => {
    persistDelete('rolecard', id)
    return { roleCards: state.roleCards.filter(c => c.id !== id) }
  }),
  getRoleCard: (id) => get().roleCards.find(c => c.id === id),

  updateGroupMemberRole: (groupId, friendId, roleCardId) => set((state) => {
    const groups = state.groups.map(g => g.id === groupId ? {
      ...g,
      members: g.members.map(m => m.friendId === friendId ? { ...m, roleCardId } : m)
    } : g)
    const updated = groups.find(g => g.id === groupId)
    if (updated) persist('group', updated)
    return { groups }
  }),
  addGroupMember: (groupId, friendId, roleCardId = '') => set((state) => {
    const groups = state.groups.map(g => g.id === groupId
      ? { ...g, members: g.members.some(m => m.friendId === friendId) ? g.members : [...g.members, { friendId, roleCardId }] }
      : g)
    const updated = groups.find(g => g.id === groupId)
    if (updated) persist('group', updated)
    return { groups }
  }),
  removeGroupMember: (groupId, friendId) => set((state) => {
    const groups = state.groups.map(g => g.id === groupId
      ? { ...g, members: g.members.filter(m => m.friendId !== friendId) }
      : g)
    const updated = groups.find(g => g.id === groupId)
    if (updated) persist('group', updated)
    return { groups }
  }),

  addMemory: (memory) => {
    const id = uuidv4()
    const mem = { ...memory, id, createdAt: Date.now() }
    set((state) => {
      persist('memory', mem)
      return { memories: [...state.memories, mem] }
    })
    return id
  },
  deleteMemory: (id) => set((state) => {
    persistDelete('memory', id)
    return { memories: state.memories.filter(m => m.id !== id) }
  }),
  getMemoriesByFriend: (friendId) => get().memories.filter(m => m.friendId === friendId),
  searchMemories: (friendId, query) => {
    const keywords = query.toLowerCase().split(/[\s，,、]+/).filter(Boolean)
    return get().memories
      .filter(m => m.friendId === friendId)
      .filter(m => {
        const text = `${m.content} ${m.summary} ${m.tags.join(' ')}`.toLowerCase()
        return keywords.some(kw => text.includes(kw))
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
  },
}))
