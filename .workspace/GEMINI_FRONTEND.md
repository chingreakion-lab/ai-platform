# Gemini 前端任务书

> 仓库：https://github.com/chingreakion-lab/ai-platform
> 你负责：整个平台的前端视觉层重做
> 你的输出最终要和 Claude 写的后端无缝对接

---

## 你进来第一件事

```bash
git clone https://github.com/chingreakion-lab/ai-platform.git
cd ai-platform
npm install
npm run dev   # 默认 3000 端口
```

然后读这两个文件：
- `.workspace/RULES.md` — 工作规则，必须遵守
- `.workspace/TASKS.md` — 任务状态，你做完更新状态

---

## 现有架构（你需要对接的后端）

### 技术栈
- **框架**：Next.js 16，App Router，TypeScript
- **状态**：Zustand store，`lib/store.ts`，持久化到 localStorage（key: `ai-platform-v1`）
- **样式**：Tailwind CSS + shadcn/ui（`components/ui/`）

### 关键 API（Claude 写的，你不动）

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/chat` | POST | 单次对话，返回 JSON `{ response: string }` |
| `/api/agent` | POST | SSE 流，ReAct Agent 循环 |
| `/api/orchestrate` | POST | SSE 流，监工协调前端+后端三角色协作 |
| `/api/execute` | POST | 在 Docker 容器执行代码 |
| `/api/workspace` | POST/GET | 持久化工作区容器管理 |
| `/api/upload` | POST | 上传文件到 Cloudflare R2 |
| `/api/supervisor` | POST | Playwright 截图 + Gemini Vision 验收 |

### Store 核心数据结构（只读，你通过 hooks 访问）

```typescript
// lib/types.ts 里定义的

interface AIFriend {
  id: string; name: string; provider: 'gemini'|'claude'|'xai'
  model: string; apiKey: string; avatar: string; description: string
}

interface Conversation {  // 1:1 对话
  id: string; friendId: string; name: string
  messages: Message[]; createdAt: number; lastActiveAt: number
}

interface Group {          // 多人群聊
  id: string; name: string
  members: GroupMember[]  // { friendId: string; roleCardId: string }
  messages: Message[]; announcement: string
}

interface RoleCard {       // 固定三个：监工/前端/后端
  id: string; name: string; emoji: string; systemPrompt: string
  builtIn: true
}

interface Memory {         // 跨对话记忆
  id: string; friendId: string; content: string; summary: string
  tags: string[]; createdAt: number
}
```

Store hooks 使用方式：
```typescript
const { friends, groups, conversations, roleCards, memories } = useAppStore()
const { addFriend, createGroup, addConversation, addMessage } = useAppStore()
```

---

## 你需要做的事（前端重做）

当前前端是功能优先做的，视觉粗糙，交互不流畅。你来做一个真正好看、好用的前端。

### 设计风格
- 暗色主题（已有 `bg-[#0e0f1a]` 基调，延续这个方向）
- 参考：Linear、Vercel Dashboard、Raycast 的设计语言
- 简洁、信息密度高、不花哨

### 任务 F-1：左侧边栏重做（`components/sidebar/ContactSidebar.tsx`）

**现状问题**：
- 好友列表展开/折叠交互生硬
- 没有显示最后一条消息的预览
- 群组和好友的视觉区分不够清晰
- 没有搜索功能

**你要做**：
```
左侧边栏（宽240px，深色背景）
├── 顶部搜索框（搜索好友名/群组名/对话内容）
├── 好友区
│   └── 每个好友：头像 + 名字 + 最后消息预览（灰色截断）
│       └── 展开后显示：该好友的所有对话框
│           └── 每个对话框：名字 + 时间 + 未读点（如有新消息）
└── 群组区
    └── 每个群组：图标 + 名字 + 成员数 + 角色标签行
```

**对接方式**：
- `getConversationsByFriend(friendId)` 获取对话列表
- `setActiveConversation(id)` 切换到1:1对话
- `setActiveGroup(id) + setActiveView('main')` 切换到群聊

---

### 任务 F-2：群聊界面重做（`components/views/MainView.tsx`）

**现状问题**：
- 成员头像区域信息太少，看不出谁是监工/前端/后端
- 消息气泡区分不明显（用户/监工/前端/后端 颜色一样）
- 没有流式消息的动画效果
- 角色分配对话框太朴素

**你要做**：

消息区分：
```
用户消息：靠右，蓝色气泡
监工消息：靠左，带 👁️ 标记，深紫色左边框
前端消息：靠左，带 🎨 标记，蓝色左边框
后端消息：靠左，带 ⚙️ 标记，绿色左边框
系统消息：居中，灰色小字（如"─── 第1轮协作 ───"）
```

成员栏（顶部）：
```
每个成员：头像圆圈（用 friend.avatar 颜色）+ 名字 + 角色徽章
角色徽章：监工=紫色、前端=蓝色、后端=绿色
点击成员 → 弹出角色选择对话框（保持现有逻辑，只改样式）
```

角色分配对话框：
```
3张卡片（监工/前端/后端），每张卡片：
- 大 emoji
- 角色名
- 2行角色描述
- 当前已选高亮（蓝色边框）
```

**对接的状态**（不要改逻辑，只改 JSX 和样式）：
- `selectedGroup.members` — 成员列表
- `roleCards` — 三个角色卡牌
- `updateGroupMemberRole(groupId, friendId, roleCardId)` — 分配角色
- `handleSendMessage(content, files?)` — 已有，不要动

---

### 任务 F-3：1:1 对话界面（`components/views/FriendChatView.tsx`）

**现状**：基本可用，需要视觉统一。

**你要做**：
- 和群聊界面同一套视觉语言（暗色、气泡样式一致）
- 顶部显示好友的 provider 徽章（Gemini/Claude/Grok）
- 流式消息有打字机光标效果（`streamingMessageId` prop 已有）
- `/agent` 模式触发时顶部出现一个 Agent 运行状态条

---

### 任务 F-4：设置页面（`components/views/SettingsView.tsx`）

**现状**：功能完整，样式需要统一。

**你要做**：
- 暗色主题统一
- 添加好友的表单 — 每个 provider 显示对应颜色和图标
- 记忆管理区块（已有数据，只需重做样式）

---

### 任务 F-5：消息输入框（`components/chat/ChatArea.tsx`）

**现状**：基本功能有，需要升级。

**你要做**：
- 输入框底部固定，支持 shift+enter 换行，enter 发送
- 左侧 + 按钮 → 上传文件（已有 `/api/upload` 对接）
- 文件上传后在输入框上方显示文件预览（图片缩略图/文件名）
- 发送按钮在有内容时变蓝色激活

---

## 对接规范（你的前端要满足这些）

### 1. 不要改这些文件（Claude 负责）
```
app/api/         ← 所有后端 API
lib/store.ts     ← 状态管理逻辑
lib/types.ts     ← 类型定义
lib/agent-tools.ts ← 工具执行
```

### 2. 你可以改/新建这些
```
components/      ← 所有组件
app/page.tsx     ← 入口（只能改 className，不能改结构）
app/globals.css  ← 全局样式
```

### 3. SSE 流式消息处理（F-2、F-3 都用到）

`/api/orchestrate` 的 SSE 事件格式：
```typescript
// 你需要处理的事件类型
{ type: 'round_start',   round: number, maxRounds: number }
{ type: 'agent_start',   agent: '监工'|'前端'|'后端', action: string }
{ type: 'agent_message', agent: '监工'|'前端'|'后端', content: string }
{ type: 'done',          summary: string }
{ type: 'error',         message: string }
```

这些事件已经在 `handleSendMessage` 里处理好了，结果存进了 `group.messages`。你只需要**根据 `message.senderName` 判断是哪个角色来渲染不同样式**，不需要自己处理 SSE。

### 4. 流式消息 prop

`ChatArea` 组件收到 `streamingMessageId?: string | null` prop，表示哪条消息正在流式输出。你在渲染这条消息时加光标动画：
```tsx
{isStreaming && <span className="animate-pulse">▊</span>}
```

### 5. 已有的 shadcn 组件（直接用，不要重装）
```
Button、Input、Textarea、Avatar、AvatarFallback
Dialog、DialogContent、DialogHeader、DialogTitle、DialogFooter
ScrollArea、Badge、Progress、Select、Tooltip
```

---

## 完成标准

每个任务完成后：
1. `npm run build` 必须通过（0 TypeScript 错误）
2. 在 `.workspace/TASKS.md` 更新状态，标记 `[x]`，写 commit hash
3. commit 格式：`feat: F-X 任务名称`

全部完成后推到 GitHub，Claude 接手做最终验收和集成测试。

---

## 当你卡住时

1. 先读 `components/` 下的现有代码，理解现有组件结构
2. 看 `lib/store.ts` 了解所有可用的状态和方法
3. 看 `lib/types.ts` 了解所有数据类型
4. 不确定和 Claude 的对接方式时，以本文档为准

你写的组件要让 Claude 能直接集成，不要引入新的状态管理方案，不要改 store 的逻辑。
