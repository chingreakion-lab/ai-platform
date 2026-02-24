import { db } from './db'
import { sql } from 'drizzle-orm'

export function initDB() {
  db.run(sql`CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    avatar TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'feature',
    workspace_path TEXT
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    announcement TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    role_card_id TEXT NOT NULL DEFAULT ''
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS group_bound_boards (
    group_id TEXT NOT NULL,
    board_id TEXT NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS announcement_files (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    parent_type TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    attachments_json TEXT
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    friend_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS feature_boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '0.1.0',
    progress REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planning',
    owner_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS board_history (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL,
    author_id TEXT NOT NULL DEFAULT ''
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS board_bound_groups (
    board_id TEXT NOT NULL,
    group_id TEXT NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    task_id TEXT
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS role_cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    base_description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    expert_area TEXT NOT NULL DEFAULT '',
    built_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    friend_id TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_conv_id TEXT,
    source_group_id TEXT,
    created_at INTEGER NOT NULL
  )`)

  // Indexes for common queries
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_type, parent_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_memories_friend ON memories(friend_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_conversations_friend ON conversations(friend_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_board_history_board ON board_history(board_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)`)
}
