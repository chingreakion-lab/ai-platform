# AI 协作平台 项目报告

**仓库** `https://github.com/chingreakion-lab/ai-platform.git`  
**本地路径** `/tmp/ai-platform`  
**当前版本** `58b0cd6`  
**报告日期** 2026-02-23

---

## 一、产品定位

这是一个让用户把多个 AI 组成真实工作团队的协作平台。区别于普通 AI 聊天工具的核心在于：**AI 之间可以协作**——用户说一句话，团队内的多个 AI 会自动分工、接力执行，最终交付结果，用户全程不需要干预。

目标用户：需要用 AI 完成有一定复杂度的工程任务（写代码、分析数据、部署服务）的开发者或产品经理。

---

## 二、核心功能模块

### 2.1 AI 好友管理

用户可以创建任意数量的 AI 成员，每个成员独立配置：

- **名字**：自定义
- **模型**：支持 Gemini（Google）、Claude（Anthropic）、Grok（xAI）三家
- **API Key**：每个成员可以用不同的 Key，支持多账号
- **角色分类**：主工程师 或 功能工程师（影响在群组中的行为权重）

### 2.2 1:1 私聊

用户与单个 AI 成员的对话界面。特性：

- 消息完整支持 **Markdown 渲染**（标题、列表、表格、引用、链接）
- 代码块带 **语法高亮**（oneDark 主题，支持 Python/JS/TS/Go/Bash 等）
- **流式输出**：AI 回复逐字出现，有光标动画，不等全部完成再显示
- `thinking` 推理过程仅后台记录，不显示在聊天界面（避免空气泡）
- 工具调用过程显示为系统提示条，不打断对话流

### 2.3 群组协作（核心）

将多个 AI 成员组成一个群，用户发一条消息，群内所有 AI 按顺序响应，像一个真实的工作群。

- **创建时分配角色**：建群弹窗内嵌角色选择器，每个成员勾选后即可分配角色卡片
- **角色卡片系统**：6张内置卡片（首席工程师🔧 前端工程师🎨 后端工程师⚙️ 测试工程师🧪 数据分析师📊 代码审查员👁️），用户也可自定义
- **事后修改**：群头部"🎭 分配角色"按钮可随时重新分配，多成员时支持标签切换逐一设置
- **流式协作**：每个 AI 成员的回复实时流式显示，有独立的流式光标

### 2.4 AI 执行工具（Agent 能力）

每个 AI 成员不只是聊天，还能真正执行任务。内置 4 个工具：

| 工具 | 功能 |
|------|------|
| `execute_code` | 在沙箱容器里执行代码（Python/JS/TS/Bash/Go/Ruby） |
| `write_file` | 向工作区写入文件 |
| `read_file` | 读取工作区文件 |
| `shell` | 执行 shell 命令（安装依赖、查看文件等） |

**工作区共享**：所有 AI 成员共用同一个 Docker 容器（`ai-platform-workspace`），A 写的文件 B 可以读，A 安装的依赖 B 可以用。

**最大迭代**：每次任务最多 12 轮工具调用，防止死循环。

### 2.5 视觉验收（Supervisor）

`/api/supervisor` 路由实现了一个视觉验收能力：

1. 用 **Playwright** 对目标 URL 截图（全页面，1280×800）
2. 截图上传到 **Cloudflare R2** 对象存储
3. 把截图 + 验收标准发给 **Gemini Vision** 进行 AI 评审
4. 返回 `{ passed, feedback, issues, screenshotUrl }`

这让监工可以真正"看"到界面，而不是只靠代码猜测结果。

### 2.6 记忆系统

AI 成员之间有跨对话记忆。每次对话结束后可提取关键信息存入记忆库，下次对话时相关记忆会注入 system prompt，AI 能记住之前发生的事情。

---

## 三、技术架构

### 3.1 前端

| 技术 | 用途 |
|------|------|
| Next.js 16.1.6 + App Router | 应用框架 |
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Zustand v5 | 全局状态管理 |
| localStorage | 数据持久化（key: `ai-platform-v1`） |
| shadcn/ui + Tailwind CSS v4 | 组件库 + 样式 |
| react-markdown + remark-gfm | Markdown 渲染 |
| react-syntax-highlighter | 代码高亮 |

### 3.2 后端（Next.js API Routes）

| 路由 | 功能 |
|------|------|
| `POST /api/agent` | 核心 AI Agent 执行，返回 SSE 事件流 |
| `POST /api/supervisor` | 视觉截图 + Gemini Vision 验收 |
| `POST /api/chat` | 简单单轮对话（无工具） |
| `POST /api/upload` | 文件上传到 R2 |
| `GET /api/workspace` | 查询工作区容器状态 |
| `POST /api/execute` | 代码快速执行（聊天界面内嵌） |

### 3.3 AI 接入

三家 AI 原生 SDK 接入，各有差异：

- **Claude**：`@anthropic-ai/sdk`，`baseURL` 固定为 `https://api.anthropic.com`（不可改），使用 `tools` 参数做 Function Calling
- **Gemini**：`@google/generative-ai`，使用 `tools` + `functionCall`/`functionResponse` 格式
- **Grok**：`openai` SDK，指向 `https://api.x.ai/v1`，OpenAI 兼容格式

### 3.4 SSE 事件协议

`/api/agent` 推送的事件格式：

```
event: start         { agent, task }
event: thinking      { agent, iteration }      → 前端忽略，不显示
event: message       { agent, content }        → 追加到当前气泡
event: tool_call     { agent, tool, args }     → 显示工具调用条
event: tool_result   { agent, tool, result }   → 前端忽略，不显示
event: done          { agent, summary }        → 结束流式光标
event: error         { agent, message }        → 显示错误
```

### 3.5 基础设施

- **Docker 沙箱**：`python:3.11-slim` 容器，512MB 内存，2 CPU，无网络，持久化 volume `ai-workspace`
- **Cloudflare R2**：截图和附件存储
- **Playwright**：无头浏览器截图，使用本地安装的 Chrome for Testing

---

## 四、文件结构

```
/tmp/ai-platform
├── app/
│   ├── page.tsx                    # 入口页
│   └── api/
│       ├── agent/route.ts          # 核心 Agent SSE（三家 AI + 工具调用）
│       ├── supervisor/route.ts     # 视觉截图 + Vision 验收
│       ├── chat/route.ts           # 简单对话
│       ├── execute/route.ts        # 代码执行
│       ├── upload/route.ts         # 文件上传
│       └── workspace/route.ts     # 工作区状态
├── components/
│   ├── views/
│   │   ├── MainView.tsx            # 群组协作主视图
│   │   ├── FriendChatView.tsx      # 1:1 私聊视图
│   │   └── SettingsView.tsx        # 设置页
│   ├── chat/
│   │   └── ChatArea.tsx            # 共用消息列表 + 输入栏
│   ├── sidebar/
│   │   └── ContactSidebar.tsx      # 左侧导航
│   └── layout/
│       └── MainLayout.tsx          # 整体布局
├── lib/
│   ├── store.ts                    # Zustand 全局状态（512行）
│   ├── types.ts                    # 所有类型 + 内置角色卡片
│   └── agent-tools.ts              # 工具定义（三家 AI 格式适配）
└── CLAUDE.md                       # AI 接手指南
```

---

## 五、数据模型

所有数据存在 localStorage，无数据库。

```
AIFriend       → id, name, provider, model, apiKey, avatar, role
Conversation   → id, friendId, name, messages[]
Group          → id, name, members[{friendId, roleCardId}], messages[], boundBoardIds[]
GroupMember    → friendId, roleCardId
RoleCard       → id, name, emoji, systemPrompt, expertArea, builtIn
Message        → id, role, content, senderId, senderName, timestamp, attachments[]
Memory         → id, friendId, content, summary, tags, sourceConvId/GroupId
FeatureBoard   → id, name, description, version, progress, status, ownerId
```

---

## 六、已完成里程碑

| 版本 | 主要内容 |
|------|---------|
| `c233794` | 初始多 AI 协作平台基础实现 |
| `3466f6f` | Docker 沙箱代码执行 |
| `5ab3459` | AI 代码块自动执行并反馈结果 |
| `570b998` | 三家 AI 原生 Function Calling 适配（取代 XML 解析） |
| `5e4f1cb` | 记忆系统、RoleCard 系统 |
| `f8df3e6` | Markdown/语法高亮/流式合并/onboarding 大改 |
| `58b0cd6` | 创建群组内嵌角色分配 + 群头部角色管理优化 |

---

## 七、当前状态与下一步

### 已实现但前端入口不完善

- **自动任务流**：`/api/supervisor` 视觉验收能力已实现，但 MainView 里还没有"一键启动任务流→监工自动拆解→前后端自动执行"的完整 UI 流程
- **FeatureBoard**（功能板块）：类型和 store 方法已定义，UI 尚未连接

### 用户核心诉求（待实现）

用户想要的最终形态：

> 三个固定 AI（监工、前端工程师、后端工程师）。用户说一句话，监工自动拆解任务并分配，前端和后端各自执行，监工用视觉能力验收结果。用户全程只等结果。

实现这个需要：

1. 在群组视图加"自动模式"开关
2. 接入监工拆解逻辑（调 `/api/agent` 让监工输出任务列表）
3. 依次调 `/api/agent` 驱动前端/后端 AI 执行各自任务
4. 调 `/api/supervisor` 做视觉验收，不通过则反馈给 AI 重做
5. 全流程进度实时显示在界面上

### 前后端分工（进行中）

目前正在与 Gemini 协作：**Gemini 负责前端 UI 重构**（参考 Nexus 暗色风格），**Claude 负责后端 API 和自动任务流实现**。接口契约以本报告第三节 SSE 协议为准。

---

## 八、环境配置

```env
GEMINI_API_KEY=          # Google Gemini
ANTHROPIC_API_KEY=       # Claude（baseURL 固定 https://api.anthropic.com）
XAI_API_KEY=             # Grok
R2_ENDPOINT=             # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
```

启动：
```bash
cd /tmp/ai-platform
npm install
npm run dev -- --port 3099
```

构建验证：
```bash
npm run build   # 必须零 TypeScript 错误才能提交
```
