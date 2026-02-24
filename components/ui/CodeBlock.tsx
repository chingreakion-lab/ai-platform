'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Copy, Check, Play, Loader2, Terminal } from 'lucide-react'

interface ExecutionResult {
  output: string
  exitCode: number
  error: string | null
}

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.default),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 380, background: '#161724', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 16, height: 16, color: '#8e9299' }} className="animate-spin" />
      </div>
    ),
  }
)

const RUNNABLE = new Set(['python', 'python3', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'shell', 'ruby', 'go'])
const MONACO_THRESHOLD = 10

const MONACO_LANG_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'shell',
  py: 'python',
  python3: 'python',
  shell: 'shell',
}

interface CodeBlockProps {
  language: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const lineCount = code.split('\n').length
  const lang = (language || 'text').toLowerCase()
  const canRun = RUNNABLE.has(lang)
  const useMonaco = lineCount > MONACO_THRESHOLD
  const monacoLang = MONACO_LANG_MAP[lang] ?? lang

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang }),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ output: '', exitCode: -1, error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ margin: '10px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #262736', fontSize: 13 }} className="not-prose">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#1a1b2e' }}>
        <span style={{ fontSize: 11, color: '#8e9299', fontFamily: 'monospace', userSelect: 'none' }}>{language || 'text'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: copied ? '#22c55e' : '#8e9299', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
          >
            {copied ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
            {copied ? '已复制' : '复制'}
          </button>
          {canRun && (
            <button
              onClick={handleRun}
              disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#fff', background: running ? 'rgba(66,133,244,0.4)' : '#4285f4', border: 'none', cursor: running ? 'not-allowed' : 'pointer', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}
            >
              {running ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Play style={{ width: 11, height: 11 }} />}
              {running ? '运行中...' : '运行'}
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      {useMonaco ? (
        <MonacoEditor
          height={380}
          language={monacoLang}
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineHeight: 20,
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
            wordWrap: 'off',
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: 'none',
            contextmenu: false,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
          }}
        />
      ) : (
        <SyntaxHighlighter
          language={lang}
          style={oneDark}
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.775rem', lineHeight: '1.6', background: '#161724', padding: '12px 16px' }}
          showLineNumbers={lineCount > 4}
          lineNumberStyle={{ color: '#3a3b4e', fontSize: '0.7rem', minWidth: '2.2em', userSelect: 'none' }}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      )}

      {/* Execution result */}
      {result && (
        <div style={{ borderTop: `1px solid ${result.exitCode === 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, background: result.exitCode === 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid #262736' }}>
            <Terminal style={{ width: 11, height: 11, color: '#8e9299' }} />
            <span style={{ fontSize: 11, color: '#8e9299', fontFamily: 'monospace' }}>
              输出{result.exitCode !== 0 && <span style={{ marginLeft: 8, color: '#f87171' }}>退出码 {result.exitCode}</span>}
            </span>
          </div>
          <pre style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 192, margin: 0 }}>
            {result.output ? <span style={{ color: '#86efac' }}>{result.output}</span> : null}
            {result.error && result.exitCode !== 0 ? <span style={{ color: '#f87171' }}>{result.error}</span> : null}
            {!result.output && !result.error ? <span style={{ color: '#3a3b4e' }}>(无输出)</span> : null}
          </pre>
        </div>
      )}
    </div>
  )
}
