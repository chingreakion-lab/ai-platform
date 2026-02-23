# AI 协作平台 — AI 接手指南

> 本文件供 AI 助手（GitHub Copilot、Claude Code、Cursor 等）阅读，提供完整项目上下文。
> 人工阅读建议从「项目概览」开始。

---

## 项目概览

**定位**：一个 Next.js 14 App Router 应用，让用户把多个 AI 好友（Gemini / Claude / Grok）组织成群组，像微信群一样协作完成编程任务。每个 AI 成员都是真正的 Agent——能写文件、执行代码、读文件、运行 Shell，在共享的 Docker 容器里持久工作。

**技术栈**：
- Next.js 14 (App Router, Turbopack)
- TypeScript
- Tailwind CSS + shadcn/ui
- Zustand（客户端状态，localStorage 持久化）
- Docker（代码沙盒：`ai-platform-workspace` 容器，Python 3.11-slim）
- Cloudflare R2（文件上传，需环境变量）
- Playwright + Gemini Vision（监工验收，需环境变量）

**启动**：
```bash
cd /tmp/ai-platform
npm run dev -- --port 3099      # 开发服务器，监听 3099
npm run build                   # 构建验证（必须零错误）
```

---

## 文件结构

```
app/
  page.tsx                  # 入口，只渲染 <MainLayout />
  layout.tsx                # HTML 根布局
  globals.css               # 全局样式
  api/
    chat/route.ts           # 普通对话 API（非流式）
    agent/route.ts          # Agent 任务 API（SSE 流式）
    execute/route.ts        # 代码执行 API（Docker）
    workspace/route.ts      # 工作区容器管理 API
    upload/route.ts         # 文件上传到 Cloudflare R2
    supervisor/route.ts     # Playwright 截图 + Gemini Vision 验收

components/
  layout/
    MainLayout.tsx          # 顶导航 + 左侧边栏 + 主内容区路由
    EngineerSidebar.tsx     # 右侧浮层控制台（任务/日志面板）
  sidebar/
    ContactSidebar.tsx      # 左侧联系人栏（好友+群组）
  views/
    MainView.tsx            # 群组聊天视图（多 Agent 协作）
    FriendChatView.tsx      # 1:1 好友聊天视图
    FeatureView.tsx         # 功能板块视图（看板）
    OuterDialog.tsx         # 与主工程师的外层对话
    SettingsView.tsx        # 设置页（好友管理 + 工作区状态）
  chat/
    ChatArea.tsx            # 通用聊天组件（消息渲染 + 输入框 + 代码块运行）
  ui/                       # shadcn/ui 基础组件

lib/
  types.ts                  # 所有 TypeScript 类型定义
  store.ts                  # Zustand store（全局状态 + localStorage）
  agent-tools.ts            # Agent 工具实现：write_file/read_file/execute_code/shell
  ai.ts                     # （保留文件，目前未使用）
  r2.ts                     # R2 上传客户端封装
  utils.ts                  # shadcn cn() 工具
```

---

## API 约定

### POST /api/chat
普通对话，非流式。

**请求**：
```json
{
  "provider": "gemini" | "claude" | "xai",
  "model": "gemini-2.5-flash",
  "apiKey": "...",
  "messages": [{"role": "user", "content": "..."}],
  "systemPrompt": "可选"
}
```

**响应**：
```json
{ "response": "AI 回复文本" }
// 或错误：
{ "error": "错误信息" }
```

**注意**：`messages` 不含 `history` 字段，调用方需自行拼装历史。

---

### POST /api/agent
Agent 任务，**SSE 流式**。Response Content-Type: `text/event-stream`。

**请求**：
```json
{
  "provider": "gemini" | "claude" | "xai",
  "model": "gemini-2.5-flash",
  "apiKey": "...",
  "agentName": "Alice",
  "task": "写一个 hello.py 并执行",
  "history": [{"role": "user", "content": "..."}],
  "systemBase": "可选，覆盖默认 system prompt",
  "groupId": "可选"
}
```

**SSE 事件流**（每条格式 `data: {...}\n\n`）：

| type | 字段 | 含义 |
|------|------|------|
| `start` | `agent`, `task` | 任务开始 |
| `thinking` | `agent`, `iteration` | 模型在思考（无 content，**不要**插入消息） |
| `message` | `agent`, `content` | 模型说了什么（有内容才显示） |
| `tool_call` | `agent`, `tool`, `args` | 调用工具（args.command 是 shell 命令） |
| `tool_result` | `agent`, `tool`, `result` | 工具执行结果（可能很长，建议只写日志） |
| `done` | `agent`, `summary` | 任务完成，summary 是总结 |
| `error` | `agent`, `message` | 出错 |

**重要**：`thinking` 事件没有 `content`，之前有 bug 插入空消息，已修复。

---

### POST /api/execute
在 Docker 容器内执行代码，非流式。

**请求**：`{ "code": "print(42)", "language": "python" }`

**支持语言**：`python`, `python3`, `javascript`, `typescript`, `bash`, `sh`, `shell`, `ruby`, `go`

**响应**：`{ "output": "42", "exitCode": 0, "error": null, "language": "python" }`

Python 用持久容器 `ai-platform-workspace`（共享文件系统），其他语言用独立 `--rm` 容器。

---

### GET /api/workspace?action=status
**响应**：`{ "running": true, "containerName": "ai-platform-workspace" }`

### POST /api/workspace
**请求**：`{ "action": "start" | "stop" | "exec" }`

---

### POST /api/upload
上传文件到 Cloudflare R2（需环境变量），FormData 格式。

**请求**：FormData，字段名 `file`

**响应**：`{ "url": "https://...", "name": "...", "size": 0, "type": "..." }`

**需要的环境变量**（`.env.local`）：
```
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
```

---

### POST /api/supervisor
截图 + AI 视觉验收，需要 Playwright 和 `GEMINI_API_KEY` 环境变量。

**请求**：`{ "url": "http://...", "criteria": "验收标准文字" }`

**响应**：`{ "passed": true, "feedback": "...", "screenshotUrl": "...", "issues": [] }`

---

## 全局状态（Zustand Store）

见 `lib/store.ts`，关键 slice 列表：

| 字段/方法 | 类型 | 说明 |
|---------|------|------|
| `friends` | `AIFriend[]` | AI 好友列表 |
| `groups` | `Group[]` | 群组列表 |
| `conversations` | `Conversation[]` | 1:1 对话列表 |
| `featureBoards` | `FeatureBoard[]` | 功能板块 |
| `tasks` | `Task[]` | 控制台任务（pending/running/done/failed） |
| `logs` | `LogEntry[]` | 控制台日志（info/warn/error/success） |
| `memories` | `Memory[]` | AI 记忆系统 |
| `outerMessages` | `Message[]` | 外层对话（与主工程师）消息 |
| `roleCards` | `RoleCard[]` | 角色卡牌库（内置 6 张） |
| `activeView` | `ViewType` | 当前视图（main/feature/outer/settings） |
| `activeConversationId` | `string\|null` | 当前打开的 1:1 对话 |

持久化：`localStorage` key `ai-platform-v1`，通过 `hydrate()` 在客户端 `useEffect` 中恢复。

---

## 已知陷阱与修复记录

### 1. Anthropic SDK baseURL 被篡改
`@anthropic-ai/sdk` npm 包的 `baseURL` 默认指向 `https://yxai.anthropic.edu.pl`（恶意中间人）。

**修复位置**：`app/api/agent/route.ts`
```typescript
const anthropic = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' })
```
**永远不要删除这行**。

---

### 2. write_file 对根路径文件创建目录 bug
旧代码 `path.replace(/\/[^/]*$/, '') || '.'` 对 `hello.py`（无斜杠）返回原字符串，导致 `mkdir -p /workspace/hello.py` 创建目录而非文件。

**修复位置**：`lib/agent-tools.ts` `writeFile` 函数
```typescript
const lastSlash = path.lastIndexOf('/')
if (lastSlash > 0) {
  const dirPath = path.slice(0, lastSlash)
  // 才创建目录
}
```

---

### 3. Gemini Agent 无限循环
Gemini API 的 `chat.sendMessage()` 返回值被丢弃，且任务消息在循环内每轮重发，导致模型反复重做任务直到 max 12 次迭代。

**修复位置**：`app/api/agent/route.ts` Gemini 分支
- 任务消息移到循环**外**只发一次
- `lastResult = await chat.sendMessage(functionResponses)` 捕获新响应

---

### 4. Claude 多工具 assistantContent 重复
Claude 多个 tool_use 时，在每个工具循环里 `push(assistantContent)` —— 导致历史里有 N 个重复的 assistant 消息块。

**修复位置**：`app/api/agent/route.ts` Claude 分支
- 先收集所有 `assistantContent` 和 `toolResults`
- 循环结束后**一次性** push `messages.push({ role: 'assistant', content: assistantContent })`

---

### 5. thinking 事件插入空消息
`FriendChatView` 早期版本将 `thinking` 和 `message` 事件同等处理，但 `thinking` 没有 `content` 字段，导致每轮迭代产生一条空气泡。

**修复位置**：`components/views/FriendChatView.tsx`
```typescript
if (data.type === 'message') {     // ← 只处理 message
  if (data.content?.trim()) { ... }
}
// thinking 事件不插消息
```

---

### 6. 群聊 tool_result 刷屏
群聊里每个工具调用结果都渲染为独立的大块代码容器，8 次迭代 = 8 个代码块，严重刷屏。

**修复位置**：`components/views/MainView.tsx` `handleAgentEvent`
- `tool_result` 现在**只写日志和 history**，不插入聊天消息
- `tool_call` 改为去插入紧凑活动标签（`system` senderId）
- `error` 在聊天里显示 ❌ 而非静默

**修复位置**：`components/chat/ChatArea.tsx`
- `senderId === 'system'` 的消息渲染为水平分隔线+单行文字，而非大容器

---

### 7. shell 工具 args 字段名错误
`handleAgentEvent` 中取 shell 命令用 `args.cmd`，但后端 SSE 发的是 `args.command`。

**已修复**：`components/views/MainView.tsx`
```typescript
tool === 'shell' ? `💻 \`${(args.command || args.cmd || '').slice(0, 60)}\`` : ...
```

---

## Provider 与模型

| Provider | key | 推荐模型 | 备注 |
|---------|-----|---------|------|
| Google Gemini | `gemini` | `gemini-2.5-flash` | `gemini-2.0-flash` 已停用 |
| Anthropic Claude | `claude` | `claude-3-haiku-20240307` | SDK baseURL 必须显式传 |
| xAI Grok | `xai` | `grok-3` | OpenAI 兼容接口 |

SettingsView 中的模型下拉列表定义在 `providerConfig` 对象里，更新模型名在那里改。

---

## Agent 工具清单（lib/agent-tools.ts）

| 工具名 | 参数 | 功能 |
|-------|------|------|
| `execute_code` | `language`, `code` | 在 Docker 内执行代码 |
| `write_file` | `path`, `content` | 写入文件到 `/workspace/` |
| `read_file` | `path` | 读取 `/workspace/` 中的文件 |
| `shell` | `command` | 在容器内执行 shell 命令 |

工作目录：`/workspace`（Docker volume `ai-workspace`，持久化）

---

## 视图路由逻辑

`MainLayout.tsx` 控制视图切换：

1. 若 `activeConversationId` 非空且对应好友存在 → 渲染 `FriendChatView`（全屏）
2. 否则根据 `activeView` 渲染：
   - `main` → `MainView`（群组聊天）
   - `feature` → `FeatureView`（功能板块）
   - `outer` → `OuterDialog`（与主工程师对话）
   - `settings` → `SettingsView`

`ContactSidebar` 始终显示（可折叠），点好友对话 → `setActiveConversation(id)`；点群组 → `setActiveGroup + setActiveView('main')`。

---

## 已完成功能清单

- [x] 三家 AI provider 原生 Function Calling（agent/route.ts）
- [x] 代码执行沙盒（Docker，持久化工作区）
- [x] 群组多 Agent 顺序协作（共享 history）
- [x] 1:1 好友聊天 + Agent 模式（/agent 前缀触发）
- [x] 记忆系统（关键词触发存储/召回，注入 system prompt）
- [x] 功能板块看板（状态/进度/版本/历史）
- [x] 群组与功能板块绑定
- [x] 角色卡牌系统（6 张内置，分配给群成员）
- [x] 公告/工作目标注入 Agent system prompt
- [x] 文件上传（R2）
- [x] 控制台侧边栏（任务状态 + 日志）
- [x] 监工机制（/api/supervisor，Playwright + Gemini Vision）
- [x] 工作区状态检测（SettingsView 实时调接口）

## 待完善 / 可改进

- [ ] `/api/supervisor` 前端触发入口（目前只有 API，SettingsView 里只有说明文字）
- [ ] 群聊支持 `/agent` 前缀单独触发某个成员（现在总是全员依次跑）
- [ ] 工具结果折叠展开（用户想看详情时可展开）
- [ ] Conversation 级别的 Agent 跑完后任务状态没有更新（FriendChatView 已修，群聊端已修）
- [ ] 记忆系统目前只有 1:1 对话触发，群聊不触发记忆存储
- [ ] 移动端布局适配

---

## 开发约定

1. **改完必须 `npm run build` 零错误**，不能有 TypeScript 编译错误
2. **永远不要删除** `baseURL: 'https://api.anthropic.com'`（见陷阱 #1）
3. SSE 解析用 `\n\n` 分割完整事件，不要逐行处理（会截断 JSON）
4. `thinking` 事件**不插消息**，`message` 事件要判 `content?.trim()` 非空才插
5. `tool_result` 在群聊不插消息（刷屏），在 1:1 聊天也不插（FriendChatView 已按此处理）
6. 多工具 Claude 响应：先收集所有块，循环结束后一次性 push，不要在 for 里 push
