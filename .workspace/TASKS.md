# 任务状态总表

> 这是唯一的任务真相来源。所有人必须在开始/结束工作时更新这里。
> 状态标记：`[ ]` 待开始 / `[~]` 进行中 / `[x]` 已完成 / `[!]` 有问题

---

## 已完成的工作

### [x] PHASE-1 基础平台搭建
完成时间：2026-02-22
Commit：c233794

做了什么：
- Next.js 16 项目初始化（App Router + Turbopack）
- Zustand store + localStorage 持久化（key: `ai-platform-v1`）
- 四个视图：主界面（群聊）/ 功能区 / 外层对话 / 设置
- AI 接口对接：Grok（xAI）/ Gemini / Claude
- R2 文件上传
- 工程师侧边栏（Tasks + Logs）

测试结果：三个 AI API 均可调用，群聊消息收发正常

---

### [x] PHASE-2 Docker 代码沙盒
完成时间：2026-02-22
Commit：3466f6f

做了什么：
- 新建 `/app/api/execute/route.ts`
- 用 `child_process.execFile('docker', ...)` 调用 Docker CLI
- 安全限制：`--network none / --memory 128m / --cpus 0.5 / --pids-limit 64 / --read-only / 15s 超时`
- 支持语言：Python / JavaScript / TypeScript / Bash / Ruby / Go
- ChatArea 新增代码块渲染 + ▶ 运行按钮

测试结果：
- Python `print(42)` → 输出 42 ✅
- JS 数组操作 → 正常输出 ✅
- 网络隔离：访问 google.com → socket.gaierror ✅

已知问题：无

---

### [x] PHASE-3 AI 自动执行代码并反馈
完成时间：2026-02-23
Commit：5ab3459

做了什么：
- AI 回复包含代码块时，自动检测并执行
- 执行结果以 `🖥️ 沙盒` 系统消息发回群聊
- 结果进入 history，后续 AI 能看到

测试结果：Grok 写冒泡排序 → 自动执行 → 显示排序结果 ✅

已知问题：每轮都是新容器，Grok 写的文件 Gemini 看不到（TASK-1 要解决）

---

### [x] PHASE-4 ReAct Agent 循环
完成时间：2026-02-23
Commit：c0ae54a

做了什么：
- 新建 `/app/api/agent/route.ts`
- SSE 流式推送每一步（thinking / tool_call / tool_result / done）
- 工具集：`execute_code` / `write_file` / `read_file` / `shell`
- 最多 12 轮迭代
- MainView 改为调用 `/api/agent`，实时显示每步

工具调用格式：XML 文本解析（不是原生 function calling）
```xml
<tool_call>
<name>execute_code</name>
<language>python</language>
<code>print("hello")</code>
</tool_call>
```

测试结果：
- 三个 AI（Grok/Gemini/Claude）全部跑通 Agent 循环 ✅
- 质数计算：思考→写代码→执行→报告，完整闭环 ✅

已知问题：
- XML 解析有时候模型输出格式不对导致解析失败（TASK-5 要改成原生 function calling）
- 每个 Agent 有独立临时工作区，任务结束即销毁（TASK-1 要解决）
- 三个 AI 各自独立完成任务，没有真正分工（TASK-3 角色卡牌要解决）

---

### [x] PHASE-5 交接文档
完成时间：2026-02-23
Commit：c6e2f3e

做了什么：
- `.workspace/HANDOVER.md`：项目全貌、文件结构、环境配置
- `.workspace/NEXT_TASKS.md`：下一步任务设计（已被本文件替代）
- `.workspace/RULES.md`：工作规则
- `.workspace/TASKS.md`：本文件

---

## 待完成的工作

### [x] TASK-1 持久化共享工作区
优先级：P0（最优先）
完成时间：2026-02-23
Commit：68654f4 (fix: 多语言支持修复)

目标：
一个长期运行的 Docker 容器，所有 AI 共享同一个文件系统。
Grok 写的文件 Gemini 能直接读到，装过的包不用重装。

完成情况：✅

实现完成：
1. ✅ `/app/api/workspace/route.ts` - 容器启动/停止/状态查询 API
2. ✅ `/app/api/agent/route.ts` - 改用 docker exec 在持久容器执行
3. ✅ `/app/api/execute/route.ts` - **混合方案**：Python→持久容器，其他语言→独立容器

测试方法：
- 启动开发服务器：npm run dev --port 3100
- 测试 workspace API：curl /api/workspace?action=status
- 测试多语言执行：POST /api/execute with code & language

真实测试结果（2026-02-23 11:05）：
- ✅ npm run build 成功（Turbopack 编译通过）
- ✅ 开发服务器启动正常（port 3100 listening）
- ✅ /api/workspace/status 返回 {"running":true,"containerName":"ai-platform-workspace"}
- ✅ JavaScript 执行成功：console.log 输出正确（用独立 node:20-alpine 容器）
- ✅ Python 执行成功：文件写入 /workspace/python_test.txt
- ✅ Python 执行成功：文件读取，内容为"持久化测试"（验证了持久化）
- ✅ 多次执行列出了之前写的文件（persistent_test.txt, test_code.py）

已知问题修复：
- ❌ 原始问题：execute/route.ts 改成全部语言用 python:3.11-slim 容器，会导致 JS/TS/Ruby/Go 失败
- ✅ 修复方案：usePersistentWorkspace 标记，Python true，其他语言 false（各用各自容器）
- ✅ 测试验证：JavaScript 成功执行，Python 成功持久化

---

### [x] TASK-2 UI 重构：好友 + 群组系统
优先级：P0
完成时间：2026-02-23
Commit：8593652

目标：
重构 UI 从上方标签导航到左侧边栏，支持 1:1 好友对话和群聊。

完成情况：✅

实现完成：
1. ✅ TASK-2-A: 修改 /lib/types.ts
   - 添加 Conversation 接口（支持 1:1 好友对话）
   - 添加 GroupMember 接口（包含 friendId + roleCardId）
   - 修改 Group.members 从 string[] 改为 GroupMember[]

2. ✅ TASK-2-B: 编辑 /lib/store.ts
   - 添加 6 个对话管理方法（addConversation, deleteConversation, renameConversation, addConversationMessage, setActiveConversation, getConversationsByFriend）
   - 修改 createGroup 签名：接受 string[] memberIds，内部转换为 GroupMember[]
   - 更新存储机制包含 conversations

3. ✅ TASK-2-C: 创建 /components/sidebar/ContactSidebar.tsx
   - 左侧边栏展示好友列表（可展开/折叠)
   - 在好友下显示该好友的所有 1:1 对话
   - 群组列表独立展示
   - 支持创建新对话
   - 点击作用：进入对话或群聊

4. ✅ TASK-2-D: 创建 /components/views/FriendChatView.tsx
   - 1:1 对话界面，显示对话历史
   - 支持重命名对话
   - 集成 ChatArea 组件
   - 支持 /agent 前缀触发 AI Agent 自动执行
   - SSE 流式处理 Agent 响应

5. ✅ TASK-2-E: 改造 /components/layout/MainLayout.tsx
   - 集成 ContactSidebar 左侧边栏
   - 菜单按钮可折叠/展开边栏
   - 检测 activeConversationId 当有活跃对话时显示 FriendChatView
   - 保留原有的标签导航和其他视图（MainView, FeatureView, etc）
   - 双路由：群聊模式和 1:1 对话模式

编译状态：✅ npm run build 成功（Turbopack 编译 1268ms，TypeScript 编译通过)

目标：
- 好友列表和群组列表并列（都在左侧边栏）
- 每个好友下可开多个独立对话框
- 加好友 = 配置 API Key
- 一个好友可以加入多个群

需要做：

**2-A 新类型（`/lib/types.ts`）**
```typescript
interface Conversation {
  id: string
  friendId: string
  name: string
  messages: Message[]
  createdAt: number
  lastActiveAt: number
}

interface GroupMember {
  friendId: string
  roleCardId: string
}
// Group.members 从 string[] 改为 GroupMember[]
```

**2-B Store 新增（`/lib/store.ts`）**
```typescript
conversations: Conversation[]
addConversation(friendId, name): string
deleteConversation(id): void
renameConversation(id, name): void
addConversationMessage(convId, message): void
```
注意：Group.members 结构变化需要做数据迁移（旧数据兼容处理）

**2-C 新建 `/components/sidebar/ContactSidebar.tsx`**
- 好友列表（可展开，显示对话框列表）
- 群组列表
- 点击对话框/群组 → 主内容区切换

**2-D 新建 `/components/views/FriendChatView.tsx`**
- 1:1 好友对话（支持 Agent 模式）
- 对话框名称可编辑

**2-E 修改 `/components/layout/MainLayout.tsx`**
- 顶部四个 tab（主界面/功能区/外层对话/设置）改为左侧边栏导航
- 接入 ContactSidebar

---

### [~] TASK-3 角色卡牌系统
优先级：P1
预计工作量：3-4小时
开始时间：2026-02-23

进度：正在实现 3-A（新增 RoleCard 类型和内置卡牌）
- TASK-3-A ⏳ 进行中：修改 /lib/types.ts - 添加 RoleCard 接口和内置卡牌库
- TASK-3-B ⏳ 待开始：编辑 /lib/store.ts - 添加 roleCards CRUD 方法
- TASK-3-C ⏳ 待开始：改造群组设置 UI - 每个成员可分配角色卡牌
- TASK-3-D ⏳ 待开始：修改 Agent 调用 - 注入角色卡牌的 system prompt

目标：
- 内置角色卡牌库（首席工程师、前端、后端、测试、数据分析、代码审查）
- 用户可自定义角色卡牌
- 群里将卡牌分配给成员，支持不同群用不同角色
- Agent 运行时使用对应角色的 system prompt

---

### [ ] TASK-4 记忆系统
优先级：P1
预计工作量：4-5小时

目标：
- 每个好友有全局记忆库（跨对话框）
- 默认各对话框隔离
- 用户说"记住这个" → 存入记忆
- 用户说"想起XX那次" → AI 调取相关记忆
- 聊天记录永久保存（除非用户主动删除）

MVP 方案（关键词匹配，不用 embedding）：
```typescript
interface Memory {
  id: string
  friendId: string
  content: string
  sourceConvId?: string
  sourceGroupId?: string
  tags: string[]
  createdAt: number
  summary: string
}
```

触发："记住" / "想起" / "记忆" 等关键词检测

---

### [ ] TASK-5 原生 Function Calling（替换 XML 解析）
优先级：P2（最后做）
预计工作量：4-5小时

目标：
把 `/app/api/agent/route.ts` 里的 XML 文本解析改成各家原生格式：
- Claude → Anthropic `tool_use`
- Gemini → `function_declarations`
- Grok → OpenAI-compatible `tools`

这会大幅提升工具调用的准确率。

---

## 进行中的工作

（当前没有进行中的任务）

---

## 发现的新问题（需要新建任务）

1. 中文输入法拦截 Enter 键 → 用户必须点发送按钮，无法回车发送（低优先级）
2. Agent 同时跑多个成员时，SSE 流可能交错 → 目前是顺序执行规避了这个问题
3. 浏览器 viewport 1684x1141，截图缩放 1347x913 → 自动化测试坐标要换算
