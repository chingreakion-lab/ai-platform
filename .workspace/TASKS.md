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

### [~] TASK-1 持久化共享工作区
优先级：P0（最优先）
预计工作量：3-4小时

进度：正在开始
- 下一步：创建 workspace API 路由和修改 agent 使用新的 docker exec 方式

目标：
一个长期运行的 Docker 容器，所有 AI 共享同一个文件系统。
Grok 写的文件 Gemini 能直接读到，装过的包不用重装。

需要做：
1. 新建 `/app/api/workspace/route.ts`
   - `POST /api/workspace/start` → 启动持久容器（`docker run -d --name ai-platform-workspace ...`）
   - `GET /api/workspace/status` → 检查容器是否在运行
   - `POST /api/workspace/exec` → `docker exec ai-platform-workspace bash -c "..."`
   - `DELETE /api/workspace/stop` → 停止容器

2. 修改 `/app/api/agent/route.ts`
   - 把 `executeCode()` 从 `docker run --rm` 改成 `docker exec ai-platform-workspace`
   - 工作目录统一用 `/workspace/`
   - 文件操作改为读写容器内 `/workspace/` 路径

3. 在平台设置页加"工作区"控制面板
   - 显示容器状态（运行中/已停止）
   - 启动/停止按钮
   - 显示已安装的包列表

容器配置参考：
```bash
docker run -d \
  --name ai-platform-workspace \
  --memory 512m --cpus 2 \
  --network none \
  -v ai-workspace:/workspace \
  python:3.11-slim \
  tail -f /dev/null
```

注意：
- 启动前先检查容器是否已存在：`docker inspect ai-platform-workspace`
- 容器名固定为 `ai-platform-workspace`
- 先装常用依赖：`pip install numpy pandas matplotlib requests`

---

### [ ] TASK-2 UI 重构：好友 + 群组系统
优先级：P0
预计工作量：6-8小时

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

### [ ] TASK-3 角色卡牌系统
优先级：P1（TASK-2 完成后做）
预计工作量：3-4小时

目标：
- 平台内置角色卡牌库
- 用户可自定义卡牌（写 system prompt）
- 群里：用户把卡牌分配给某个好友
- 同一个好友在不同群可以是不同角色

内置角色：首席工程师🔧 / 前端工程师🎨 / 后端工程师⚙️ / 测试工程师🧪 / 数据分析师📊 / 代码审查员👁️

详细 system prompt 见旧版 NEXT_TASKS.md（仍在 git 历史里）

需要做：
1. 新建 `RoleCard` 类型和内置卡牌数据
2. Store 新增 `roleCards` + CRUD
3. 群组设置里加角色分配 UI（每个成员旁边的卡牌选择器）
4. Agent 调用时把角色卡牌的 system prompt 注入

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
