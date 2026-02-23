'use client'
import { create } from 'zustand'
import { AIFriend, Group, FeatureBoard, Message, Task, LogEntry, ViewType, Attachment, BoardStatus, BoardHistory, Conversation, GroupMember, RoleCard, DEFAULT_ROLE_CARDS, Memory } from './types'
import { v4 as uuidv4 } from 'uuid'

// API keys loaded from .env.local (NEXT_PUBLIC_ prefix for client-side access)
// Configure NEXT_PUBLIC_XAI_API_KEY, NEXT_PUBLIC_GEMINI_API_KEY, NEXT_PUBLIC_CLAUDE_API_KEY
const XAI_KEY = process.env.NEXT_PUBLIC_XAI_API_KEY || ''
const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
const CLAUDE_KEY = process.env.NEXT_PUBLIC_CLAUDE_API_KEY || ''

const defaultFriends: AIFriend[] = [
  {
    id: 'grok-default',
    name: 'Grok',
    provider: 'xai',
    model: 'grok-3',
    apiKey: XAI_KEY,
    avatar: '#6366f1',
    description: '主工程师 - 负责整体架构与协调',
    role: 'chief',
  },
  {
    id: 'gemini-default',
    name: 'Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: GEMINI_KEY,
    avatar: '#10b981',
    description: '功能群工程师 - 擅长分析与设计',
    role: 'feature',
  },
  {
    id: 'claude-default',
    name: 'Claude',
    provider: 'claude',
    model: 'claude-opus-4-6',
    apiKey: CLAUDE_KEY,
    avatar: '#f59e0b',
    description: '功能群工程师 - 擅长代码与实现',
    role: 'feature',
  },
]

function loadFromStorage() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('ai-platform-v1')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveToStorage(state: Partial<AppState>) {
  if (typeof window === 'undefined') return
  try {
    const toSave = {
      friends: state.friends,
      groups: state.groups,
      conversations: state.conversations,
      roleCards: state.roleCards,
      memories: state.memories,
      featureBoards: state.featureBoards,
      tasks: state.tasks,
      logs: state.logs,
      outerMessages: state.outerMessages,
    }
    localStorage.setItem('ai-platform-v1', JSON.stringify(toSave))
  } catch {}
}

interface AppState {
  friends: AIFriend[]
  groups: Group[]
  conversations: Conversation[] // new: friend conversations
  roleCards: RoleCard[] // new: custom and built-in role cards
  memories: Memory[] // new: per-friend persistent memories
  featureBoards: FeatureBoard[]
  tasks: Task[]
  logs: LogEntry[]
  activeView: ViewType
  sidebarOpen: boolean
  activeGroupId: string | null
  activeBoardId: string | null
  activeConversationId: string | null // new: active conversation id
  outerMessages: Message[]
  _hydrated: boolean

  hydrate: () => void
  addFriend: (friend: Omit<AIFriend, 'id'>) => void
  updateFriend: (id: string, updates: Partial<AIFriend>) => void
  removeFriend: (id: string) => void
  
  // Conversation methods (new)
  addConversation: (friendId: string, name: string) => string
  deleteConversation: (id: string) => void
  renameConversation: (id: string, name: string) => void
  addConversationMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
  updateConversationMessage: (conversationId: string, messageId: string, content: string) => void
  setActiveConversation: (id: string | null) => void
  getConversationsByFriend: (friendId: string) => Conversation[]
  
  // Role card methods (new)
  addRoleCard: (card: Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateRoleCard: (id: string, updates: Partial<Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>>) => void
  deleteRoleCard: (id: string) => void
  getRoleCard: (id: string) => RoleCard | undefined
  updateGroupMemberRole: (groupId: string, friendId: string, roleCardId: string) => void

  // Memory methods (new)
  addMemory: (memory: Omit<Memory, 'id' | 'createdAt'>) => string
  deleteMemory: (id: string) => void
  getMemoriesByFriend: (friendId: string) => Memory[]
  searchMemories: (friendId: string, query: string) => Memory[]

  createGroup: (name: string, memberIds: string[]) => string
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
  roleCards: DEFAULT_ROLE_CARDS.map(card => ({
    ...card,
    id: uuidv4(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
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

  hydrate: () => {
    if (get()._hydrated) return
    const saved = loadFromStorage()
    if (saved) {
      set({
        friends: saved.friends?.length ? saved.friends : defaultFriends,
        groups: saved.groups || [],
        conversations: saved.conversations || [],
        roleCards: saved.roleCards || get().roleCards, // Use existing built-in cards if not saved
        memories: saved.memories || [],
        featureBoards: saved.featureBoards || [],
        tasks: saved.tasks || [],
        logs: saved.logs || [],
        outerMessages: saved.outerMessages || [],
        _hydrated: true,
      })
    } else {
      set({ _hydrated: true })
    }
  },

  addFriend: (friend) => set((state) => {
    const next = { ...state, friends: [...state.friends, { ...friend, id: uuidv4() }] }
    saveToStorage(next)
    return next
  }),
  updateFriend: (id, updates) => set((state) => {
    const next = { ...state, friends: state.friends.map(f => f.id === id ? { ...f, ...updates } : f) }
    saveToStorage(next)
    return next
  }),
  removeFriend: (id) => set((state) => {
    const next = { ...state, friends: state.friends.filter(f => f.id !== id) }
    saveToStorage(next)
    return next
  }),

  // Conversation management (new)
  addConversation: (friendId, name) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        conversations: [...state.conversations, {
          id, friendId, name,
          messages: [],
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }],
        activeConversationId: id,
      }
      saveToStorage(next)
      return next
    })
    return id
  },

  deleteConversation: (id) => set((state) => {
    const next = { ...state, conversations: state.conversations.filter(c => c.id !== id) }
    saveToStorage(next)
    return next
  }),

  renameConversation: (id, name) => set((state) => {
    const next = { ...state, conversations: state.conversations.map(c => c.id === id ? { ...c, name } : c) }
    saveToStorage(next)
    return next
  }),

  addConversationMessage: (conversationId, message) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        conversations: state.conversations.map(c => c.id === conversationId ? {
          ...c,
          messages: [...c.messages, { ...message, id, timestamp: Date.now() }],
          lastActiveAt: Date.now()
        } : c)
      }
      saveToStorage(next)
      return next
    })
    return id
  },

  updateConversationMessage: (conversationId, messageId, content) => set((state) => {
    const next = {
      ...state,
      conversations: state.conversations.map(c => c.id === conversationId ? {
        ...c,
        messages: c.messages.map(m => m.id === messageId ? { ...m, content } : m)
      } : c)
    }
    saveToStorage(next)
    return next
  }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  getConversationsByFriend: (friendId) => {
    return get().conversations.filter(c => c.friendId === friendId)
  },

  createGroup: (name, memberIds) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        groups: [...state.groups, {
          id, name, members: memberIds.map(friendId => ({ friendId, roleCardId: '' })), // convert string[] to GroupMember[]
          announcement: '', announcementFiles: [],
          messages: [], boundBoardIds: [],
          createdAt: Date.now()
        }],
        activeGroupId: id,
      }
      saveToStorage(next)
      return next
    })
    return id
  },
  updateGroup: (id, updates) => set((state) => {
    const next = { ...state, groups: state.groups.map(g => g.id === id ? { ...g, ...updates } : g) }
    saveToStorage(next)
    return next
  }),
  deleteGroup: (id) => set((state) => {
    const next = { ...state, groups: state.groups.filter(g => g.id !== id) }
    saveToStorage(next)
    return next
  }),
  addMessage: (groupId, message) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        groups: state.groups.map(g => g.id === groupId ? {
          ...g, messages: [...g.messages, { ...message, id, timestamp: Date.now() }]
        } : g)
      }
      saveToStorage(next)
      return next
    })
    return id
  },

  updateGroupMessage: (groupId, messageId, content) => set((state) => {
    const next = {
      ...state,
      groups: state.groups.map(g => g.id === groupId ? {
        ...g,
        messages: g.messages.map(m => m.id === messageId ? { ...m, content } : m)
      } : g)
    }
    saveToStorage(next)
    return next
  }),

  createBoard: (name, description, ownerId) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        featureBoards: [...state.featureBoards, {
          id, name, description, ownerId,
          version: '0.1.0', progress: 0,
          status: 'planning' as BoardStatus,
          history: [], boundGroupIds: [],
          createdAt: Date.now(), updatedAt: Date.now()
        }],
        activeBoardId: id,
      }
      saveToStorage(next)
      return next
    })
    return id
  },
  updateBoard: (id, updates) => set((state) => {
    const next = { ...state, featureBoards: state.featureBoards.map(b => b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b) }
    saveToStorage(next)
    return next
  }),
  deleteBoard: (id) => set((state) => {
    const next = { ...state, featureBoards: state.featureBoards.filter(b => b.id !== id) }
    saveToStorage(next)
    return next
  }),
  addBoardHistory: (boardId, entry) => set((state) => {
    const next = {
      ...state,
      featureBoards: state.featureBoards.map(b => b.id === boardId ? {
        ...b,
        history: [...b.history, { ...entry, id: uuidv4(), timestamp: Date.now() }],
        updatedAt: Date.now()
      } : b)
    }
    saveToStorage(next)
    return next
  }),
  bindGroupToBoard: (groupId, boardId) => set((state) => {
    const next = {
      ...state,
      groups: state.groups.map(g => g.id === groupId ? {
        ...g, boundBoardIds: g.boundBoardIds.includes(boardId) ? g.boundBoardIds : [...g.boundBoardIds, boardId]
      } : g),
      featureBoards: state.featureBoards.map(b => b.id === boardId ? {
        ...b, boundGroupIds: b.boundGroupIds.includes(groupId) ? b.boundGroupIds : [...b.boundGroupIds, groupId]
      } : b)
    }
    saveToStorage(next)
    return next
  }),
  unbindGroupFromBoard: (groupId, boardId) => set((state) => {
    const next = {
      ...state,
      groups: state.groups.map(g => g.id === groupId ? {
        ...g, boundBoardIds: g.boundBoardIds.filter(id => id !== boardId)
      } : g),
      featureBoards: state.featureBoards.map(b => b.id === boardId ? {
        ...b, boundGroupIds: b.boundGroupIds.filter(id => id !== groupId)
      } : b)
    }
    saveToStorage(next)
    return next
  }),

  addTask: (task) => {
    const id = uuidv4()
    set((state) => {
      const next = { ...state, tasks: [...state.tasks, { ...task, id, createdAt: Date.now(), updatedAt: Date.now() }] }
      saveToStorage(next)
      return next
    })
    return id
  },
  updateTask: (id, updates) => set((state) => {
    const next = { ...state, tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t) }
    saveToStorage(next)
    return next
  }),
  addLog: (log) => set((state) => {
    const next = { ...state, logs: [{ ...log, id: uuidv4(), timestamp: Date.now() }, ...state.logs].slice(0, 500) }
    saveToStorage(next)
    return next
  }),
  clearLogs: () => set((state) => {
    const next = { ...state, logs: [] }
    saveToStorage(next)
    return next
  }),

  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveGroup: (id) => set({ activeGroupId: id }),
  setActiveBoard: (id) => set({ activeBoardId: id }),
  addOuterMessage: (message) => set((state) => {
    const next = { ...state, outerMessages: [...state.outerMessages, { ...message, id: uuidv4(), timestamp: Date.now() }] }
    saveToStorage(next)
    return next
  }),

  // Role card methods
  addRoleCard: (card) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        roleCards: [...state.roleCards, {
          ...card,
          id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
      }
      saveToStorage(next)
      return next
    })
    return id
  },

  updateRoleCard: (id, updates) => set((state) => {
    const next = {
      ...state,
      roleCards: state.roleCards.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c),
    }
    saveToStorage(next)
    return next
  }),

  deleteRoleCard: (id) => set((state) => {
    const next = {
      ...state,
      roleCards: state.roleCards.filter(c => c.id !== id),
    }
    saveToStorage(next)
    return next
  }),

  getRoleCard: (id) => {
    return get().roleCards.find(c => c.id === id)
  },

  updateGroupMemberRole: (groupId, friendId, roleCardId) => set((state) => {
    const next = {
      ...state,
      groups: state.groups.map(g => g.id === groupId ? {
        ...g,
        members: g.members.map(m => m.friendId === friendId ? { ...m, roleCardId } : m)
      } : g)
    }
    saveToStorage(next)
    return next
  }),

  // Memory methods
  addMemory: (memory) => {
    const id = uuidv4()
    set((state) => {
      const next = {
        ...state,
        memories: [...state.memories, { ...memory, id, createdAt: Date.now() }],
      }
      saveToStorage(next)
      return next
    })
    return id
  },

  deleteMemory: (id) => set((state) => {
    const next = { ...state, memories: state.memories.filter(m => m.id !== id) }
    saveToStorage(next)
    return next
  }),

  getMemoriesByFriend: (friendId) => {
    return get().memories.filter(m => m.friendId === friendId)
  },

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
