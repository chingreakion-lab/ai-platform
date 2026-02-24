import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db-init'
import {
  upsertFriend, deleteFriend,
  upsertGroup, deleteGroup,
  upsertMessage, updateMessageContent,
  upsertConversation, deleteConversation,
  upsertBoard, deleteBoard,
  upsertTask, upsertLog, clearAllLogs,
  upsertRoleCard, deleteRoleCard,
  upsertMemory, deleteMemory,
} from '@/lib/db-actions'

let initialized = false
function ensureInit() {
  if (!initialized) { initDB(); initialized = true }
}

export async function POST(req: NextRequest) {
  try {
    ensureInit()
    const body = await req.json()
    const { _entity, ...data } = body

    switch (_entity) {
      case 'friend': upsertFriend(data); break
      case 'group': upsertGroup(data); break
      case 'message': upsertMessage(data, data._parentType, data._parentId); break
      case 'message_update': updateMessageContent(data.id, data.content); break
      case 'conversation': upsertConversation(data); break
      case 'board': upsertBoard(data); break
      case 'task': upsertTask(data); break
      case 'log': upsertLog(data); break
      case 'rolecard': upsertRoleCard(data); break
      case 'memory': upsertMemory(data); break
      default: return NextResponse.json({ error: `unknown entity: ${_entity}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[db/entity POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    ensureInit()
    const { searchParams } = new URL(req.url)
    const entity = searchParams.get('entity')
    const id = searchParams.get('id')
    if (!entity || !id) return NextResponse.json({ error: 'missing entity or id' }, { status: 400 })

    switch (entity) {
      case 'friend': deleteFriend(id); break
      case 'group': deleteGroup(id); break
      case 'conversation': deleteConversation(id); break
      case 'board': deleteBoard(id); break
      case 'rolecard': deleteRoleCard(id); break
      case 'memory': deleteMemory(id); break
      case 'logs': clearAllLogs(); break
      default: return NextResponse.json({ error: `unknown entity: ${entity}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[db/entity DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
