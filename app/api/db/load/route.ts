import { NextResponse } from 'next/server'
import { initDB } from '@/lib/db-init'
import { loadAllData } from '@/lib/db-actions'

let initialized = false

export async function GET() {
  try {
    if (!initialized) {
      initDB()
      initialized = true
    }
    const data = loadAllData()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[db/load]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
