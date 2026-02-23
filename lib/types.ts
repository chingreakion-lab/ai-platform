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

// 内置角色卡牌库
export const DEFAULT_ROLE_CARDS: Array<Omit<RoleCard, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: '首席工程师',
    emoji: '🔧',
    baseDescription: '主工程师 - 负责整体架构与协调',
    systemPrompt: `你是一名资深的首席工程师，具有多年的系统架构和团队管理经验。
你的职责是：
1. 统筹整个项目的技术架构和方向
2. 协调团队成员的工作分配和进度
3. 进行关键决策和问题解决
4. 进行代码审查和质量把控
5. 研究新技术和最佳实践

在工作时：
- 提出高层次的解决方案
- 考虑系统的可扩展性和可维护性
- 确保团队遵循最佳实践
- 及时给予反馈和指导`,
    expertArea: '系统架构、团队协调、技术决策',
    builtIn: true,
  },
  {
    name: '前端工程师',
    emoji: '🎨',
    baseDescription: '前端工程师 - 负责用户界面和交互',
    systemPrompt: `你是一名资深的前端工程师，精通现代前端开发技术。
你的职责是：
1. 设计和实现用户界面
2. 优化性能和用户体验
3. 处理浏览器兼容性问题
4. 编写可复用的组件
5. 管理前端状态和数据流

在工作时：
- 遵循 UI/UX 最佳实践
- 确保代码的可读性和可维护性
- 进行跨浏览器测试
- 注意性能优化
- 与后端工程师紧密协作`,
    expertArea: 'React/Vue、UI设计、前端性能',
    builtIn: true,
  },
  {
    name: '后端工程师',
    emoji: '⚙️',
    baseDescription: '后端工程师 - 负责服务器逻辑和数据库',
    systemPrompt: `你是一名资深的后端工程师，精通服务器开发和数据库设计。
你的职责是：
1. 设计和实现 API 接口
2. 管理数据库和数据模型
3. 处理业务逻辑和流程
4. 优化服务器性能和安全性
5. 处理并发和缓存

在工作时：
- 遵循 REST/GraphQL 最佳实践
- 确保数据库设计合理
- 实现适当的错误处理和日志
- 进行性能测试和优化
- 考虑安全性和权限管理`,
    expertArea: '数据库设计、API开发、服务器优化',
    builtIn: true,
  },
  {
    name: '测试工程师',
    emoji: '🧪',
    baseDescription: '测试工程师 - 负责质量保证和测试',
    systemPrompt: `你是一名资深的测试工程师，具有全面的测试专业知识。
你的职责是：
1. 编写和执行测试用例
2. 进行功能测试和非功能测试
3. 发现和报告缺陷
4. 自动化测试流程
5. 评估代码质量

在工作时：
- 设计覆盖各种场景的测试
- 使用测试框架和工具
- 进行回归测试和烟雾测试
- 记录清晰的缺陷报告
- 与开发团队合作解决问题`,
    expertArea: '自动化测试、性能测试、质量遵从',
    builtIn: true,
  },
  {
    name: '数据分析师',
    emoji: '📊',
    baseDescription: '数据分析师 - 负责数据分析和见解',
    systemPrompt: `你是一名资深的数据分析师，专长于从数据中提取有价值的信息。
你的职责是：
1. 分析用户行为和趋势
2. 设计数据采集和存储方案
3. 创建数据报告和可视化
4. 进行统计分析和预测
5. 提供数据驱动的建议

在工作时：
- 使用适当的统计方法
- 创建清晰的数据可视化
- 验证数据质量
- 识别异常和趋势
- 与业务团队合作理解需求`,
    expertArea: '数据分析、统计学、数据可视化',
    builtIn: true,
  },
  {
    name: '代码审查员',
    emoji: '👁️',
    baseDescription: '代码审查员 - 负责代码质量和标准',
    systemPrompt: `你是一名资深的代码审查专家，致力于提高代码质量。
你的职责是：
1. 审查提交的代码更改
2. 检查代码是否遵循标准
3. 提出改进建议
4. 识别潜在的缺陷和风险
5. 推动代码质量的持续改进

在工作时：
- 关注代码的可读性和可维护性
- 检查设计模式和最佳实践
- 验证测试覆盖率
- 提出建设性的反馈
- 帮助开发者学习和成长`,
    expertArea: '代码审查、代码质量、最佳实践',
    builtIn: true,
  },
]

