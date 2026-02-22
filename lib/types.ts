export type AIProvider = 'gemini' | 'claude' | 'xai'

export interface AIFriend {
  id: string
  name: string
  provider: AIProvider
  model: string
  apiKey: string
  avatar: string // color hex
  description: string
  role: 'chief' | 'feature' // chief = 主工程师, feature = 功能群工程师
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  senderId: string // user or friend id
  senderName: string
  timestamp: number
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size: number
}

export interface Group {
  id: string
  name: string
  members: string[] // AIFriend ids
  announcement: string
  announcementFiles: Attachment[]
  messages: Message[]
  boundBoardIds: string[]
  createdAt: number
}

export interface BoardHistory {
  id: string
  version: string
  description: string
  timestamp: number
  authorId: string
}

export type BoardStatus = 'planning' | 'in-progress' | 'done' | 'paused'

export interface FeatureBoard {
  id: string
  name: string
  description: string
  version: string
  progress: number // 0-100
  status: BoardStatus
  history: BoardHistory[]
  boundGroupIds: string[]
  ownerId: string // feature engineer id
  createdAt: number
  updatedAt: number
}

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
  result?: string
}

export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  timestamp: number
  taskId?: string
}

export type UserRole = 'chief' | 'feature'

export interface Permission {
  role: UserRole
  boardId?: string // for feature engineers, which board they own
}

export type ViewType = 'main' | 'feature' | 'outer' | 'settings'

export interface SupervisorResult {
  passed: boolean
  feedback: string
  screenshotUrl?: string
}
