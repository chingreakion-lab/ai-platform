import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const friends = sqliteTable('friends', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  apiKey: text('api_key').notNull(),
  avatar: text('avatar').notNull(),
  description: text('description').notNull().default(''),
  role: text('role').notNull().default('feature'),
  workspacePath: text('workspace_path'),
})

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  announcement: text('announcement').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export const groupMembers = sqliteTable('group_members', {
  groupId: text('group_id').notNull(),
  friendId: text('friend_id').notNull(),
  roleCardId: text('role_card_id').notNull().default(''),
})

export const groupBoundBoards = sqliteTable('group_bound_boards', {
  groupId: text('group_id').notNull(),
  boardId: text('board_id').notNull(),
})

export const announcementFiles = sqliteTable('announcement_files', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull().default(''),
  size: integer('size').notNull().default(0),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  parentType: text('parent_type').notNull(), // 'group' | 'conversation' | 'outer'
  parentId: text('parent_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  senderId: text('sender_id').notNull(),
  senderName: text('sender_name').notNull(),
  timestamp: integer('timestamp').notNull(),
  attachmentsJson: text('attachments_json'), // JSON Attachment[]
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  friendId: text('friend_id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastActiveAt: integer('last_active_at').notNull(),
})

export const featureBoards = sqliteTable('feature_boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  version: text('version').notNull().default('0.1.0'),
  progress: real('progress').notNull().default(0),
  status: text('status').notNull().default('planning'),
  ownerId: text('owner_id').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const boardHistory = sqliteTable('board_history', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull(),
  version: text('version').notNull(),
  description: text('description').notNull().default(''),
  timestamp: integer('timestamp').notNull(),
  authorId: text('author_id').notNull().default(''),
})

export const boardBoundGroups = sqliteTable('board_bound_groups', {
  boardId: text('board_id').notNull(),
  groupId: text('group_id').notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('pending'),
  result: text('result'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const logs = sqliteTable('logs', {
  id: text('id').primaryKey(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  timestamp: integer('timestamp').notNull(),
  taskId: text('task_id'),
})

export const roleCards = sqliteTable('role_cards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull().default(''),
  baseDescription: text('base_description').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  expertArea: text('expert_area').notNull().default(''),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  friendId: text('friend_id').notNull(),
  content: text('content').notNull(),
  summary: text('summary').notNull().default(''),
  tagsJson: text('tags_json').notNull().default('[]'),
  sourceConvId: text('source_conv_id'),
  sourceGroupId: text('source_group_id'),
  createdAt: integer('created_at').notNull(),
})
