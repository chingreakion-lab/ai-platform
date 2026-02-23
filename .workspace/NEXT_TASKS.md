# 下一步任务详细设计

## 整体目标

把现在的"多 AI 群聊 + Agent 执行"升级成**真正的多 AI 版 Claude Code**。

核心差距：
1. 没有持久化共享工作区（AI 之间不共享文件系统）
2. 没有好友独立对话框（现在只有群聊）
3. 没有角色卡牌（AI 角色固定，不能灵活分配）
4. 没有记忆系统（聊天记录不持久，AI 无法调取历史）
5. 工具调用用 XML 解析，精度差（应该用原生 Function Calling）

---

## TASK-1：持久化共享工作区 ★ 最优先

### 目标
一个长期运行的 Docker 容器，所有 AI 在同一个文件系统里工作。

### 实现方案

**新建 `/app/api/workspace/route.ts`**

```typescript
// 管理持久容器的生命周期
GET  /api/workspace/status   → 容器是否在运行
POST /api/workspace/start    → 启动容器（如果没在跑）
POST /api/workspace/exec     → 在容器里执行命令
POST /api/workspace/write    → 写文件到容器
GET  /api/workspace/read     → 读容器内文件
DELETE /api/workspace/stop   → 停止容器
```

**容器配置**
```bash
docker run -d \
  --name ai-platform-workspace \
  --memory 512m \
  --cpus 2 \
  --network none \          # 安全隔离
  -v ai-workspace:/workspace \  # 持久化 volume
  python:3.11-slim \
  tail -f /dev/null         # 保持运行

# 执行命令用 docker exec
docker exec ai-platform-workspace bash -c "cd /workspace && python main.py"
```

**修改 `/app/api/agent/route.ts`**
- 把 `executeCode()` 改成用 `docker exec ai-platform-workspace` 而不是 `docker run --rm`
- 工作目录统一用 `/workspace/`
- 文件操作读写 `/workspace/` 下的路径

### 预装依赖
```bash
# 容器启动后预装常用包
docker exec ai-platform-workspace pip install numpy pandas matplotlib requests
docker exec ai-platform-workspace apt-get install -y nodejs npm curl
```

---

## TASK-2：产品 UI 重构

### 新的整体布局

```
┌─────────────────────────────────────────────────────────┐
│ AI 协作平台                                    [控制台]  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ [好友]   │                                              │
│ [群组]   │         主内容区                              │
│          │                                              │
│ 好友列表 │                                              │
│ ├ Grok   │                                              │
│ │ ├对话1 │                                              │
│ │ └对话2 │                                              │
│ ├ Gemini │                                              │
│ └ Claude │                                              │
│          │                                              │
│ 群组列表 │                                              │
│ ├ 工程群 │                                              │
│ └ 分析群 │                                              │
│          │                                              │
│ [+ 好友] │                                              │
│ [+ 群组] │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 新建文件

**`/components/sidebar/ContactSidebar.tsx`**
- 好友列表（可展开，每个好友下显示对话框列表）
- 群组列表
- 点击对话框/群组 → 主内容区切换
- 好友头像 + 在线状态 + 名字

**`/components/views/FriendChatView.tsx`**
- 单个好友的某个对话框
- 和现有 ChatArea 类似，但是 1:1 对话
- 支持 Agent 模式（和群聊一样能调工具）
- 对话框名称可编辑

**`/components/views/GroupChatView.tsx`**
- 现有 MainView 的群聊部分，独立出来
- 显示成员角色卡牌

### 修改现有文件

**`/lib/types.ts`** — 新增类型
```typescript
// 对话框（一个好友可以有多个）
interface Conversation {
  id: string
  friendId: string
  name: string          // 对话框名称，用户可改
  messages: Message[]
  createdAt: number
  lastActiveAt: number
}

// 角色卡牌
interface RoleCard {
  id: string
  name: string          // "首席工程师"
  icon: string          // "🔧"
  description: string   // 展示给用户看的描述
  systemPrompt: string  // 实际注入给 AI 的 prompt
  isBuiltin: boolean    // 平台内置 vs 用户自定义
}

// 群成员（好友 + 分配的角色卡牌）
interface GroupMember {
  friendId: string
  roleCardId: string    // 在这个群里扮演什么角色
}

// 修改 Group
interface Group {
  id: string
  name: string
  members: GroupMember[]  // 改成 GroupMember[]（原来是 string[]）
  messages: Message[]
  announcement: string
  boundBoardIds: string[]
}
```

**`/lib/store.ts`** — 新增 state
```typescript
conversations: Conversation[]     // 好友对话框列表
roleCards: RoleCard[]             // 角色卡牌库
memories: Memory[]                // 记忆系统（TASK-3）

addConversation(friendId, name)
deleteConversation(id)
renameConversation(id, name)
addConversationMessage(convId, message)
```

---

## TASK-3：角色卡牌系统

### 内置卡牌（平台预设）

```typescript
const BUILTIN_ROLE_CARDS: RoleCard[] = [
  {
    id: 'chief-engineer',
    name: '首席工程师',
    icon: '🔧',
    description: '负责任务拆解、分配、验收',
    systemPrompt: `你是团队的首席工程师。
收到任务后，你的职责是：
1. 分析任务，拆解成具体的子任务
2. 输出清晰的执行计划（JSON格式）
3. 协调团队成员分工合作
4. 对完成的工作进行验收
你不需要自己实现所有功能，而是指挥和协调。`,
    isBuiltin: true,
  },
  {
    id: 'frontend-engineer',
    name: '前端工程师',
    icon: '🎨',
    description: '负责 UI/UX 实现',
    systemPrompt: `你是前端工程师，专注于用户界面和体验。
擅长：React/Next.js/Tailwind CSS/TypeScript
收到任务后，你负责实现前端部分，写出可运行的代码并执行验证。`,
    isBuiltin: true,
  },
  {
    id: 'backend-engineer',
    name: '后端工程师',
    icon: '⚙️',
    description: '负责 API/数据库/服务端',
    systemPrompt: `你是后端工程师，专注于服务端开发。
擅长：Python/Node.js/数据库/API设计
收到任务后，你负责实现后端部分，写出可运行的代码并执行验证。`,
    isBuiltin: true,
  },
  {
    id: 'test-engineer',
    name: '测试工程师',
    icon: '🧪',
    description: '负责写测试、找 bug、验证结果',
    systemPrompt: `你是测试工程师，负责保证代码质量。
你的职责：写测试用例、执行测试、发现和报告 bug、验证功能正确性。
收到代码或功能描述后，立即写测试并执行，报告测试结果。`,
    isBuiltin: true,
  },
  {
    id: 'data-analyst',
    name: '数据分析师',
    icon: '📊',
    description: '负责数据处理和分析',
    systemPrompt: `你是数据分析师，专注于数据处理、统计分析和可视化。
擅长：Python/pandas/numpy/matplotlib
收到数据相关任务后，写代码处理和分析数据，执行并展示结果。`,
    isBuiltin: true,
  },
  {
    id: 'code-reviewer',
    name: '代码审查员',
    icon: '👁️',
    description: '负责代码审查和质量把控',
    systemPrompt: `你是代码审查员，负责审查代码质量、安全性和可维护性。
收到代码后，分析潜在问题、提出改进建议，必要时写出修复版本并执行验证。`,
    isBuiltin: true,
  },
]
```

### 群组里分配角色的 UI

在群组设置里，每个成员旁边有一个角色卡牌选择器：
```
群组成员：
  [Grok 头像]  Grok        角色: [🔧 首席工程师 ▼]
  [G 头像]     Gemini      角色: [⚙️ 后端工程师 ▼]
  [C 头像]     Claude      角色: [🧪 测试工程师 ▼]
```

---

## TASK-4：记忆系统

### 数据结构

```typescript
interface Memory {
  id: string
  friendId: string          // 属于哪个好友
  content: string           // 记忆内容
  sourceConvId?: string     // 来自哪个对话框
  sourceGroupId?: string    // 来自哪个群
  tags: string[]            // 用于检索的标签
  createdAt: number
  summary: string           // AI 生成的简短摘要
}
```

### 触发方式

**存入记忆：**
- 用户说"记住这个"→ 把当前上下文存入记忆
- 用户说"记住：XXX"→ 直接把 XXX 存入

**调取记忆：**
- 用户说"想起我们之前讨论的 XXX"
- 系统搜索记忆库，把相关记忆注入到当前对话上下文
- AI 就能"想起来"

**实现方式：**
- 简单版：关键词匹配（MVP）
- 进阶版：embedding 向量搜索

### System Prompt 注入

每次对话开始时，检查是否有相关记忆，有则注入：
```
你是 Grok...

[相关记忆]
- 2024-01: 用户的项目用 Next.js + Tailwind，不用 Vue
- 2024-02: 用户偏好简洁代码风格，不喜欢过度注释
```

---

## TASK-5：原生 Function Calling（替换 XML 解析）

### 目标
把现在 `/app/api/agent/route.ts` 里的 XML 文本解析改成各家原生的 function calling。

### Claude（Anthropic tool_use）
```typescript
// 请求
{
  tools: [{
    name: "execute_code",
    description: "在 Docker 沙盒里执行代码",
    input_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python", "javascript", "bash", "go"] },
        code: { type: "string" }
      }
    }
  }]
}

// 响应检测
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(c => c.type === 'tool_use')
  // toolUse.name, toolUse.input
}
```

### Gemini（function_declarations）
```typescript
{
  tools: [{
    function_declarations: [{
      name: "execute_code",
      description: "...",
      parameters: { type: "OBJECT", properties: { ... } }
    }]
  }]
}
```

### Grok/xAI（OpenAI-compatible tools）
```typescript
{
  tools: [{
    type: "function",
    function: {
      name: "execute_code",
      description: "...",
      parameters: { type: "object", properties: { ... } }
    }
  }]
}
```

---

## 执行顺序建议

```
1. TASK-1（持久容器）→ 最快见效，解决核心问题
2. TASK-2（UI重构）  → 工作量最大，先做好友对话框
3. TASK-3（角色卡牌）→ UI 重构里顺带做
4. TASK-4（记忆系统）→ 先做简单关键词版
5. TASK-5（Function Calling）→ 最后做，提升精度
```

---

## 给接手者的注意事项

- 现在的 `groups[].members` 是 `string[]`（friendId 数组），TASK-2 要改成 `GroupMember[]`，需要做数据迁移
- localStorage 的 key 是 `ai-platform-v1`，如果改了 store 结构要处理旧数据兼容
- Docker 容器名固定用 `ai-platform-workspace`，启动前先检查是否已存在
- 浏览器测试时输入法问题：用 JS fiber dispatch 设置输入值，再点发送按钮
