import { db } from './db'
import * as schema from './schema'
import { eq, desc } from 'drizzle-orm'
import { AIFriend, Group, Conversation, FeatureBoard, Task, LogEntry, RoleCard, Memory, Message, Attachment } from './types'

// ── helpers ───────────────────────────────────────────────────────────────────

function deserializeMessage(row: typeof schema.messages.$inferSelect): Message {
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    senderId: row.senderId,
    senderName: row.senderName,
    timestamp: row.timestamp,
    attachments: row.attachmentsJson ? JSON.parse(row.attachmentsJson) : undefined,
  }
}

// ── Load all data (called on app startup) ────────────────────────────────────

export function loadAllData() {
  const allFriends = db.select().from(schema.friends).all()
  const allGroups = db.select().from(schema.groups).all()
  const allGroupMembers = db.select().from(schema.groupMembers).all()
  const allGroupBoundBoards = db.select().from(schema.groupBoundBoards).all()
  const allAnnouncementFiles = db.select().from(schema.announcementFiles).all()
  const allMessages = db.select().from(schema.messages).all()
  const allConversations = db.select().from(schema.conversations).all()
  const allFeatureBoards = db.select().from(schema.featureBoards).all()
  const allBoardHistory = db.select().from(schema.boardHistory).all()
  const allBoardBoundGroups = db.select().from(schema.boardBoundGroups).all()
  const allTasks = db.select().from(schema.tasks).all()
  const allLogs = db.select().from(schema.logs).orderBy(desc(schema.logs.timestamp)).limit(500).all()
  const allRoleCards = db.select().from(schema.roleCards).all()
  const allMemories = db.select().from(schema.memories).all()

  const friends: AIFriend[] = allFriends.map(f => ({
    id: f.id, name: f.name, provider: f.provider as AIFriend['provider'],
    model: f.model, apiKey: f.apiKey, avatar: f.avatar,
    description: f.description, role: f.role as AIFriend['role'],
    workspacePath: f.workspacePath ?? undefined,
  }))

  const groups: Group[] = allGroups.map(g => ({
    id: g.id, name: g.name, announcement: g.announcement, createdAt: g.createdAt,
    members: allGroupMembers.filter(m => m.groupId === g.id).map(m => ({ friendId: m.friendId, roleCardId: m.roleCardId })),
    boundBoardIds: allGroupBoundBoards.filter(b => b.groupId === g.id).map(b => b.boardId),
    messages: allMessages.filter(m => m.parentType === 'group' && m.parentId === g.id)
      .sort((a, b) => a.timestamp - b.timestamp).map(deserializeMessage),
    announcementFiles: allAnnouncementFiles.filter(f => f.groupId === g.id).map(f => ({
      id: f.id, name: f.name, url: f.url, type: f.type, size: f.size,
    })) as Attachment[],
  }))

  const conversations: Conversation[] = allConversations.map(c => ({
    id: c.id, friendId: c.friendId, name: c.name,
    createdAt: c.createdAt, lastActiveAt: c.lastActiveAt,
    messages: allMessages.filter(m => m.parentType === 'conversation' && m.parentId === c.id)
      .sort((a, b) => a.timestamp - b.timestamp).map(deserializeMessage),
  }))

  const featureBoards: FeatureBoard[] = allFeatureBoards.map(b => ({
    id: b.id, name: b.name, description: b.description, version: b.version,
    progress: b.progress, status: b.status as FeatureBoard['status'],
    ownerId: b.ownerId, createdAt: b.createdAt, updatedAt: b.updatedAt,
    history: allBoardHistory.filter(h => h.boardId === b.id)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(h => ({ id: h.id, version: h.version, description: h.description, timestamp: h.timestamp, authorId: h.authorId })),
    boundGroupIds: allBoardBoundGroups.filter(bg => bg.boardId === b.id).map(bg => bg.groupId),
  }))

  const tasks: Task[] = allTasks.map(t => ({
    id: t.id, title: t.title, description: t.description,
    status: t.status as Task['status'], result: t.result ?? undefined,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  }))

  const logs: LogEntry[] = allLogs.map(l => ({
    id: l.id, level: l.level as LogEntry['level'], message: l.message,
    timestamp: l.timestamp, taskId: l.taskId ?? undefined,
  }))

  const roleCards: RoleCard[] = allRoleCards.map(r => ({
    id: r.id, name: r.name, emoji: r.emoji, baseDescription: r.baseDescription,
    systemPrompt: r.systemPrompt, expertArea: r.expertArea,
    builtIn: !!r.builtIn, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }))

  const memories: Memory[] = allMemories.map(m => ({
    id: m.id, friendId: m.friendId, content: m.content, summary: m.summary,
    tags: JSON.parse(m.tagsJson || '[]'),
    sourceConvId: m.sourceConvId ?? undefined,
    sourceGroupId: m.sourceGroupId ?? undefined,
    createdAt: m.createdAt,
  }))

  const outerMessages = allMessages.filter(m => m.parentType === 'outer')
    .sort((a, b) => a.timestamp - b.timestamp).map(deserializeMessage)

  return { friends, groups, conversations, featureBoards, tasks, logs, roleCards, memories, outerMessages }
}

// ── Friends ───────────────────────────────────────────────────────────────────

export function upsertFriend(f: AIFriend) {
  db.insert(schema.friends).values({
    id: f.id, name: f.name, provider: f.provider, model: f.model,
    apiKey: f.apiKey, avatar: f.avatar, description: f.description,
    role: f.role, workspacePath: f.workspacePath,
  }).onConflictDoUpdate({ target: schema.friends.id, set: {
    name: f.name, provider: f.provider, model: f.model, apiKey: f.apiKey,
    avatar: f.avatar, description: f.description, role: f.role, workspacePath: f.workspacePath,
  }}).run()
}

export function deleteFriend(id: string) {
  db.delete(schema.friends).where(eq(schema.friends.id, id)).run()
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function upsertGroup(g: Group) {
  db.insert(schema.groups).values({
    id: g.id, name: g.name, announcement: g.announcement, createdAt: g.createdAt,
  }).onConflictDoUpdate({ target: schema.groups.id, set: {
    name: g.name, announcement: g.announcement,
  }}).run()

  // Replace members
  db.delete(schema.groupMembers).where(eq(schema.groupMembers.groupId, g.id)).run()
  for (const m of g.members) {
    db.insert(schema.groupMembers).values({ groupId: g.id, friendId: m.friendId, roleCardId: m.roleCardId }).run()
  }

  // Replace bound boards
  db.delete(schema.groupBoundBoards).where(eq(schema.groupBoundBoards.groupId, g.id)).run()
  for (const boardId of g.boundBoardIds) {
    db.insert(schema.groupBoundBoards).values({ groupId: g.id, boardId }).run()
  }

  // Replace announcement files
  db.delete(schema.announcementFiles).where(eq(schema.announcementFiles.groupId, g.id)).run()
  for (const f of g.announcementFiles) {
    db.insert(schema.announcementFiles).values({
      id: f.id, groupId: g.id, name: f.name, url: f.url,
      type: (f as Attachment & { type?: string }).type ?? '',
      size: (f as Attachment & { size?: number }).size ?? 0,
    }).run()
  }
}

export function deleteGroup(id: string) {
  db.delete(schema.groupMembers).where(eq(schema.groupMembers.groupId, id)).run()
  db.delete(schema.groupBoundBoards).where(eq(schema.groupBoundBoards.groupId, id)).run()
  db.delete(schema.announcementFiles).where(eq(schema.announcementFiles.groupId, id)).run()
  db.delete(schema.messages).where(eq(schema.messages.parentId, id)).run()
  db.delete(schema.groups).where(eq(schema.groups.id, id)).run()
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function upsertMessage(msg: Message, parentType: string, parentId: string) {
  db.insert(schema.messages).values({
    id: msg.id, parentType, parentId,
    role: msg.role, content: msg.content,
    senderId: msg.senderId, senderName: msg.senderName,
    timestamp: msg.timestamp,
    attachmentsJson: msg.attachments ? JSON.stringify(msg.attachments) : null,
  }).onConflictDoUpdate({ target: schema.messages.id, set: {
    content: msg.content,
    attachmentsJson: msg.attachments ? JSON.stringify(msg.attachments) : null,
  }}).run()
}

export function updateMessageContent(id: string, content: string) {
  db.update(schema.messages).set({ content }).where(eq(schema.messages.id, id)).run()
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function upsertConversation(c: Conversation) {
  db.insert(schema.conversations).values({
    id: c.id, friendId: c.friendId, name: c.name,
    createdAt: c.createdAt, lastActiveAt: c.lastActiveAt,
  }).onConflictDoUpdate({ target: schema.conversations.id, set: {
    name: c.name, lastActiveAt: c.lastActiveAt,
  }}).run()
}

export function deleteConversation(id: string) {
  db.delete(schema.messages).where(eq(schema.messages.parentId, id)).run()
  db.delete(schema.conversations).where(eq(schema.conversations.id, id)).run()
}

// ── Boards ────────────────────────────────────────────────────────────────────

export function upsertBoard(b: FeatureBoard) {
  db.insert(schema.featureBoards).values({
    id: b.id, name: b.name, description: b.description, version: b.version,
    progress: b.progress, status: b.status, ownerId: b.ownerId,
    createdAt: b.createdAt, updatedAt: b.updatedAt,
  }).onConflictDoUpdate({ target: schema.featureBoards.id, set: {
    name: b.name, description: b.description, version: b.version,
    progress: b.progress, status: b.status, updatedAt: b.updatedAt,
  }}).run()

  // Replace history
  db.delete(schema.boardHistory).where(eq(schema.boardHistory.boardId, b.id)).run()
  for (const h of b.history) {
    db.insert(schema.boardHistory).values({
      id: h.id, boardId: b.id, version: h.version,
      description: h.description, timestamp: h.timestamp, authorId: h.authorId,
    }).run()
  }

  // Replace bound groups
  db.delete(schema.boardBoundGroups).where(eq(schema.boardBoundGroups.boardId, b.id)).run()
  for (const groupId of b.boundGroupIds) {
    db.insert(schema.boardBoundGroups).values({ boardId: b.id, groupId }).run()
  }
}

export function deleteBoard(id: string) {
  db.delete(schema.boardHistory).where(eq(schema.boardHistory.boardId, id)).run()
  db.delete(schema.boardBoundGroups).where(eq(schema.boardBoundGroups.boardId, id)).run()
  db.delete(schema.featureBoards).where(eq(schema.featureBoards.id, id)).run()
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function upsertTask(t: Task) {
  db.insert(schema.tasks).values({
    id: t.id, title: t.title, description: t.description,
    status: t.status, result: t.result ?? null,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  }).onConflictDoUpdate({ target: schema.tasks.id, set: {
    status: t.status, result: t.result ?? null, updatedAt: t.updatedAt,
  }}).run()
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export function upsertLog(l: LogEntry) {
  db.insert(schema.logs).values({
    id: l.id, level: l.level, message: l.message,
    timestamp: l.timestamp, taskId: l.taskId ?? null,
  }).onConflictDoUpdate({ target: schema.logs.id, set: { message: l.message }}).run()
}

export function clearAllLogs() {
  db.delete(schema.logs).run()
}

// ── Role Cards ────────────────────────────────────────────────────────────────

export function upsertRoleCard(r: RoleCard) {
  db.insert(schema.roleCards).values({
    id: r.id, name: r.name, emoji: r.emoji,
    baseDescription: r.baseDescription, systemPrompt: r.systemPrompt,
    expertArea: r.expertArea, builtIn: !!r.builtIn,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  }).onConflictDoUpdate({ target: schema.roleCards.id, set: {
    name: r.name, emoji: r.emoji, baseDescription: r.baseDescription,
    systemPrompt: r.systemPrompt, expertArea: r.expertArea, updatedAt: r.updatedAt,
  }}).run()
}

export function deleteRoleCard(id: string) {
  db.delete(schema.roleCards).where(eq(schema.roleCards.id, id)).run()
}

// ── Memories ──────────────────────────────────────────────────────────────────

export function upsertMemory(m: Memory) {
  db.insert(schema.memories).values({
    id: m.id, friendId: m.friendId, content: m.content, summary: m.summary,
    tagsJson: JSON.stringify(m.tags),
    sourceConvId: m.sourceConvId ?? null,
    sourceGroupId: m.sourceGroupId ?? null,
    createdAt: m.createdAt,
  }).onConflictDoUpdate({ target: schema.memories.id, set: {
    content: m.content, summary: m.summary, tagsJson: JSON.stringify(m.tags),
  }}).run()
}

export function deleteMemory(id: string) {
  db.delete(schema.memories).where(eq(schema.memories.id, id)).run()
}

// ── Migrate from localStorage ─────────────────────────────────────────────────

export function migrateFromLocalStorage(raw: string) {
  let data: Record<string, unknown>
  try { data = JSON.parse(raw) } catch { return { error: 'invalid JSON' } }

  const counts = { friends: 0, groups: 0, conversations: 0, boards: 0, tasks: 0, logs: 0, roleCards: 0, memories: 0, messages: 0 }

  const friends = (data.friends as AIFriend[] | undefined) || []
  for (const f of friends) { try { upsertFriend(f); counts.friends++ } catch { /* skip */ } }

  const groups = (data.groups as Group[] | undefined) || []
  for (const g of groups) {
    try {
      upsertGroup(g)
      counts.groups++
      for (const msg of g.messages || []) {
        try { upsertMessage(msg, 'group', g.id); counts.messages++ } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const conversations = (data.conversations as Conversation[] | undefined) || []
  for (const c of conversations) {
    try {
      upsertConversation(c)
      counts.conversations++
      for (const msg of c.messages || []) {
        try { upsertMessage(msg, 'conversation', c.id); counts.messages++ } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const featureBoards = (data.featureBoards as FeatureBoard[] | undefined) || []
  for (const b of featureBoards) { try { upsertBoard(b); counts.boards++ } catch { /* skip */ } }

  const tasks = (data.tasks as Task[] | undefined) || []
  for (const t of tasks) { try { upsertTask(t); counts.tasks++ } catch { /* skip */ } }

  const logs = (data.logs as LogEntry[] | undefined) || []
  for (const l of logs.slice(0, 500)) { try { upsertLog(l); counts.logs++ } catch { /* skip */ } }

  const roleCards = (data.roleCards as RoleCard[] | undefined) || []
  for (const r of roleCards) { try { upsertRoleCard(r); counts.roleCards++ } catch { /* skip */ } }

  const memories = (data.memories as Memory[] | undefined) || []
  for (const m of memories) { try { upsertMemory(m); counts.memories++ } catch { /* skip */ } }

  const outerMessages = (data.outerMessages as Message[] | undefined) || []
  for (const msg of outerMessages) { try { upsertMessage(msg, 'outer', 'outer'); counts.messages++ } catch { /* skip */ } }

  return { success: true, counts }
}
