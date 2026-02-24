import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db-init'
import { migrateFromLocalStorage } from '@/lib/db-actions'

let initialized = false

export async function POST(req: NextRequest) {
  try {
    if (!initialized) { initDB(); initialized = true }
    const { data } = await req.json()
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'missing data string' }, { status: 400 })
    }
    const result = migrateFromLocalStorage(data)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[db/migrate]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
