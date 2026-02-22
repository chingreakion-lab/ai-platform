import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function POST(req: NextRequest) {
  try {
    const { url, criteria } = await req.json()
    const { chromium } = await import('playwright')
    
    const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
    const browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    const screenshotBuffer = await page.screenshot({ fullPage: true })
    await browser.close()

    // Upload to R2
    const key = `screenshots/${uuidv4()}.png`
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: screenshotBuffer,
      ContentType: 'image/png',
    }))
    const screenshotUrl = `${process.env.R2_PUBLIC_URL}/${key}`

    // Gemini Vision analysis
    const imageBase64 = screenshotBuffer.toString('base64')
    const prompt = `你是一位专业的质量监工（监工）。请分析这个网页截图，根据以下验收标准进行评估：\n\n${criteria}\n\n请以 JSON 格式回复：\n{"passed": true/false, "feedback": "详细反馈", "issues": ["问题1", "问题2"]}`
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: imageBase64 } }] }] })
    })
    const geminiData = await geminiRes.json()
    const analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    let result
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/)
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { passed: false, feedback: analysis, issues: [] }
    } catch { result = { passed: false, feedback: analysis, issues: [] } }

    return NextResponse.json({ ...result, screenshotUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
