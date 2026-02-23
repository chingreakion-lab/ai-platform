# 交接文档 — Multi-AI Collaboration Platform

> 任何人（包括新的 Claude 实例）拿到这份文档都能继续工作。

---

## 项目位置

```
本地代码：/tmp/ai-platform/
GitHub：   https://github.com/chingreakion-lab/ai-platform
运行端口：  http://localhost:3099
启动命令：  cd /tmp/ai-platform && npm run dev -- --port 3099
```

## 环境变量（本地 .env.local，不提交 GitHub）

```
/tmp/ai-platform/.env.local
内含：
  NEXT_PUBLIC_XAI_API_KEY       = xai-tNfQRe2st...（Grok）
  NEXT_PUBLIC_GEMINI_API_KEY    = AIzaSyBrGf4a...（Gemini）
  NEXT_PUBLIC_CLAUDE_API_KEY    = sk-ant-api03...（Claude）
  NEXT_PUBLIC_R2_ACCOUNT_ID     = ...
  NEXT_PUBLIC_R2_ACCESS_KEY_ID  = ...
  NEXT_PUBLIC_R2_SECRET_KEY     = ...
  NEXT_PUBLIC_R2_BUCKET         = my-ai-studio
  GEMINI_API_KEY                = ...（服务端，用于 supervisor）
```

## 当前技术栈

- **框架**：Next.js 16（App Router，Turbopack）
- **状态**：Zustand + localStorage（key: `ai-platform-v1`）
- **样式**：Tailwind CSS + shadcn/ui
- **Docker**：本地 Docker Desktop，用于代码沙盒执行
- **存储**：Cloudflare R2（截图上传）
- **AI 接口**：Grok（xAI）/ Gemini（Google）/ Claude（Anthropic）

## 当前文件结构

```
/tmp/ai-platform/
├── app/
│   ├── api/
│   │   ├── agent/route.ts      ← ReAct Agent 循环（SSE流式）★ 最新
│   │   ├── chat/route.ts       ← 普通单轮对话
│   │   ├── execute/route.ts    ← Docker 沙盒代码执行
│   │   ├── supervisor/route.ts ← Playwright 截图 + Gemini Vision 验收
│   │   └── upload/route.ts     ← R2 文件上传
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── chat/
│   │   └── ChatArea.tsx        ← 消息渲染 + 代码块 + 沙盒消息样式
│   ├── layout/
│   │   ├── MainLayout.tsx      ← 顶部导航 + 四个视图切换
│   │   └── EngineerSidebar.tsx ← 右侧工程师侧边栏（Tasks + Logs）
│   └── views/
│       ├── MainView.tsx        ← 群聊主界面 ★ 最新（含 runAgentMember）
│       ├── FeatureView.tsx     ← 功能区看板
│       ├── OuterDialog.tsx     ← 外层对话（首席工程师单聊）
│       └── SettingsView.tsx    ← 设置（好友/API配置）
├── lib/
│   ├── store.ts                ← Zustand store + localStorage 持久化
│   ├── types.ts                ← 所有 TypeScript 类型定义
│   ├── ai.ts                   ← AI 调用封装（Gemini/Claude/xAI）
│   ├── r2.ts                   ← R2 上传工具
│   └── utils.ts
└── .workspace/
    ├── HANDOVER.md             ← 本文件
    └── NEXT_TASKS.md           ← 下一步任务详细设计
```

## 已完成功能（截至 commit c0ae54a）

1. **群聊** — 多 AI 同时在群里回复
2. **ReAct Agent 循环** — 每个 AI 成员能自主调用工具迭代完成任务
   - 工具：`execute_code` / `write_file` / `read_file` / `shell`
   - SSE 流式推送每一步到群聊
   - 最多 12 轮迭代
3. **Docker 沙盒** — 安全隔离执行代码（--network none 等）
4. **代码块渲染** — AI 消息里的代码块带复制/运行按钮
5. **沙盒消息** — 工具执行结果以居中系统消息样式显示
6. **功能区** — 看板式任务管理
7. **监工机制** — Playwright + Gemini Vision 截图验收
8. **R2 上传** — 文件和截图上传到 Cloudflare R2
9. **设置页** — 好友配置（API Key + 模型选择）

## 已知问题

- Docker 镜像已预拉取：python:3.11-alpine / node:20-alpine / alpine:latest / ruby:3.2-alpine / golang:1.21-alpine
- Agent 用 XML 格式 tool_call（不是原生 function calling），精度有限
- 每次 Agent 任务都是新的临时工作区（任务结束后 rm -rf），AI 之间没有共享持久文件系统

---

## 下一步要做的事（按优先级）

详见 NEXT_TASKS.md，核心是：

### P0：产品重设计（用户已确认方向）

用户要做的是**真正的多 AI 版 Claude Code**，需要：

**1. 好友 + 群组系统重构**
- 好友列表和群组列表并列（不是群组包含好友）
- 每个好友下可开多个独立对话框（有名字/主题）
- 加好友 = 配置 API Key（现在 SettingsView 的逻辑）
- 一个好友可以加入多个群

**2. 角色卡牌系统**
- 平台内置角色卡牌库（首席工程师、前端、后端、测试等）
- 用户自定义卡牌（写 system prompt）
- 群里：用户把卡牌分配给某个好友
- 同一个好友在不同群可以是不同角色

**3. 记忆系统**
- 每个好友有全局记忆库（跨对话框）
- 默认各对话框隔离
- 用户说"记住XX" → 存入记忆
- 用户说"想起XX那次" → AI 调取相关记忆
- 聊天记录永久保存（除非用户主动删除）

**4. 持久化共享工作区（技术核心）**
- 启动一个长期运行的 Docker 容器（不是 --rm）
- 所有 AI 用 docker exec 在同一容器里执行
- /workspace/ 目录共享，文件互相可见
- 装过的依赖不用重装
- 参考：OpenHands / aider 的 workspace 设计

**5. 原生 Function Calling**
- 替换当前的 XML 文本解析
- Claude → Anthropic tool_use
- Gemini → function_declarations
- Grok → OpenAI-compatible tools

---

## 给接手者的提示

- 项目用 Turbopack，不要用 webpack 相关配置
- Docker 路径：`/usr/local/bin/docker`
- Node 路径：`/Users/mimap/.nvm/versions/node/v22.22.0/bin/node`
- Playwright Chromium：`~/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
- localStorage key：`ai-platform-v1`（不是 `ai-platform-store`）
- 中文输入法会拦截 Enter 键，测试时用 JS 触发发送或直接点按钮
- 浏览器实际 viewport 是 1684x1141，截图缩放到 1347x913，点击坐标要按截图比例换算
