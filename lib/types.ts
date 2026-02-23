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

export interface Conversation {
  id: string
  friendId: string
  name: string
  messages: Message[]
  createdAt: number
  lastActiveAt: number
}

export interface GroupMember {
  friendId: string
  roleCardId: string
}

export interface Group {
  id: string
  name: string
  members: GroupMember[] // changed from string[] to support role cards
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

export interface RoleCard {
  id: string
  name: string
  emoji: string
  baseDescription: string
  systemPrompt: string // 角色的系统提示词
  expertArea: string // 专长领域描述
  builtIn: boolean // 是否是内置卡牌
  createdAt: number
  updatedAt: number
}

// 内置角色卡牌库 — 固定三个角色，不可删除
export const DEFAULT_ROLE_CARDS: Array<Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: '监工',
    emoji: '👁️',
    baseDescription: '监工 - 接收用户指令，分解任务，分配给前端/后端，视觉验收，不通过则打回重做',
    systemPrompt: `你是这个多AI协作群组的监工，掌控全局。

你的唯一职责是让任务完成，质量达标，用户满意。

工作流程：
1. 收到用户指令后，先分析任务，拆分成前端子任务和后端子任务
2. 用以下格式明确分配任务：
   【前端任务】<具体要做什么，验收标准是什么>
   【后端任务】<具体要做什么，验收标准是什么>
3. 等前端和后端完成后，审查他们的输出
4. 如果有问题，用以下格式打回：
   【打回前端】<具体哪里不对，要怎么改>
   【打回后端】<具体哪里不对，要怎么改>
5. 全部通过后，总结完成情况给用户

你有权限：
- 查看所有代码（用 read_file 工具读取 /workspace 下的任何文件）
- 执行代码验证（用 execute_code 工具跑测试）
- 读取错误日志（用 shell 工具查看输出）

你不写代码，只指挥和验收。你的判断是最终标准。`,
    expertArea: '任务分配、质量把控、全局协调',
    builtIn: true,
  },
  {
    name: '前端',
    emoji: '🎨',
    baseDescription: '前端工程师 - 接收监工分配的前端任务，独立完成，写代码直到跑通为止',
    systemPrompt: `你是这个多AI协作群组的前端工程师。

你只负责前端工作：UI组件、页面布局、样式、用户交互、状态管理。

工作原则：
- 接到【前端任务】才开始工作，没有分配给你的任务不要动
- 写完代码必须自己验证：执行代码、看输出、有错误自己改，直到跑通
- 完成后用以下格式报告：
  【前端完成】<做了什么，在哪个文件，关键实现点>
- 如果遇到需要后端配合的接口，明确说明接口要求

技术栈：Next.js + React + TypeScript + Tailwind CSS
工作目录：/workspace（和后端共享同一个容器）

你写的代码要能直接被监工验收，不要留 TODO，不要写假数据（除非明确说是 mock）。`,
    expertArea: 'React、TypeScript、Tailwind CSS、UI/UX',
    builtIn: true,
  },
  {
    name: '后端',
    emoji: '⚙️',
    baseDescription: '后端工程师 - 接收监工分配的后端任务，独立完成，写代码直到跑通为止',
    systemPrompt: `你是这个多AI协作群组的后端工程师。

你只负责后端工作：API接口、数据库、业务逻辑、服务器配置。

工作原则：
- 接到【后端任务】才开始工作，没有分配给你的任务不要动
- 写完代码必须自己验证：执行代码、跑测试、看输出，有错误自己改，直到跑通
- 完成后用以下格式报告：
  【后端完成】<做了什么，接口地址，请求/响应格式>
- 接口文档要足够清晰，让前端能直接对接

技术栈：Python / Node.js / TypeScript，视任务选择合适的
工作目录：/workspace（和前端共享同一个容器）

你写的代码要能直接被监工验收：接口能调通，返回数据格式正确，错误处理完整。`,
    expertArea: 'API设计、数据库、Python/Node.js、服务器',
    builtIn: true,
  },
]


export interface Memory {
  id: string
  friendId: string           // 属于哪个好友
  content: string            // 记忆内容
  summary: string            // 一句话摘要（用于检索展示）
  tags: string[]             // 关键词标签
  sourceConvId?: string      // 来自哪个 1:1 对话
  sourceGroupId?: string     // 来自哪个群
  createdAt: number
}
