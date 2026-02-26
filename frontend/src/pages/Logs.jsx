import { useState, useEffect, useRef, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  Search, Download, RefreshCw, Pause, Play,
  AlertCircle, AlertTriangle, Info, Filter, ChevronDown,
  CheckCircle, XCircle, Clock, Cpu, Send, Activity,
  GitBranch, Zap, RotateCcw,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — LOGS (original, untouched)
// ═══════════════════════════════════════════════════════════════════════════

const LEVEL = {
  ERROR: { color: '#E05252', bg: '#E0525215', border: '#E0525240', icon: AlertCircle },
  WARN:  { color: '#E0A020', bg: '#E0A02015', border: '#E0A02040', icon: AlertTriangle },
  INFO:  { color: '#666666', bg: 'transparent', border: 'transparent', icon: Info },
}

function LevelBadge({ level }) {
  const cfg = LEVEL[level] ?? LEVEL.INFO
  return (
    <span
      className="inline-block text-sm px-1.5 py-0.5 rounded font-mono font-bold flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, minWidth: '46px', textAlign: 'center' }}
    >
      {level}
    </span>
  )
}

function SourceBadge({ source }) {
  return (
    <span
      className="inline-block text-sm px-1.5 py-0.5 rounded flex-shrink-0"
      style={{
        background: source === 'audit' ? '#7C6FCD20' : '#E8472A15',
        color: source === 'audit' ? '#7C6FCD' : '#E8472A',
        border: `1px solid ${source === 'audit' ? '#7C6FCD40' : '#E8472A40'}`,
      }}
    >
      {source}
    </span>
  )
}

function LogRow({ entry, search }) {
  const cfg = LEVEL[entry.level] ?? LEVEL.INFO
  const ts = new Date(entry.ts)
  const timeStr = ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const highlight = (text) => {
    if (!search) return text
    const idx = text.toLowerCase().indexOf(search.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#E8472A40', color: '#fff', borderRadius: '2px' }}>
          {text.slice(idx, idx + search.length)}
        </mark>
        {text.slice(idx + search.length)}
      </>
    )
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-1.5 border-b font-mono text-sm hover:bg-white/5 transition-colors"
      style={{ borderColor: '#1A1A1A', background: entry.level === 'ERROR' ? '#E0525208' : 'transparent' }}
    >
      <div className="flex-shrink-0 text-right" style={{ color: '#444', minWidth: '100px' }}>
        <span style={{ color: '#666' }}>{timeStr}</span>
        <span className="hidden md:inline" style={{ color: '#333' }}> {dateStr}</span>
      </div>
      <LevelBadge level={entry.level} />
      <SourceBadge source={entry.source} />
      <span className="flex-1 break-all leading-relaxed" style={{ color: cfg.color === '#666666' ? '#999' : cfg.color }}>
        {highlight(entry.message)}
      </span>
    </div>
  )
}

const TIME_RANGES = [
  { label: '1h',  hours: 1 },
  { label: '6h',  hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
  { label: 'All', hours: null },
]

function LogsTab({ authToken }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState('ALL')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [timeRange, setTimeRange] = useState(TIME_RANGES[2])
  const [sources, setSources] = useState({ gateway: true, audit: true })
  const [liveMode, setLiveMode] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [total, setTotal] = useState(0)

  const listRef = useRef(null)
  const atBottomRef = useRef(true)

  const sinceIso = () => {
    if (!timeRange.hours) return ''
    return new Date(Date.now() - timeRange.hours * 3600 * 1000).toISOString()
  }

  const sourcesParam = () =>
    Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(',') || 'gateway'

  const fetchLogs = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ level, search, limit: '500', since: sinceIso(), sources: sourcesParam() })
      const r = await fetch(`/api/logs?${params}`, { headers: { Authorization: `Bearer ${authToken}` } })
      const data = await r.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch { /* keep existing */ } finally { setLoading(false) }
  }, [authToken, level, search, timeRange, sources]) // eslint-disable-line

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!listRef.current || isPaused) return
    if (atBottomRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [logs, isPaused])

  useEffect(() => {
    if (!liveMode) return
    const id = setInterval(() => { if (!isPaused) fetchLogs() }, 3000)
    return () => clearInterval(id)
  }, [liveMode, isPaused, fetchLogs])

  const onScroll = () => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 60
  }

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const exportLogs = () => {
    const text = logs.map(e => `${e.ts} [${e.level}] [${e.source}] ${e.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wagz-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const errorCount = logs.filter(l => l.level === 'ERROR').length
  const warnCount  = logs.filter(l => l.level === 'WARN').length

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="text-sm px-2 py-1 rounded" style={{ background: '#E0525215', color: '#E05252', border: '1px solid #E0525240' }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-sm px-2 py-1 rounded" style={{ background: '#E0A02015', color: '#E0A020', border: '1px solid #E0A02040' }}>
              {warnCount} warn{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-sm" style={{ color: '#555' }}>{total} entries</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-48 px-3 py-2 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <Search size={13} color="#666" />
          <input
            type="text"
            placeholder="Search logs…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-white placeholder-gray-600"
          />
        </div>
        <div className="flex gap-1">
          {['ALL', 'INFO', 'WARN', 'ERROR'].map(l => (
            <button key={l} onClick={() => setLevel(l)} className="text-sm px-2.5 py-1.5 rounded font-medium transition-colors"
              style={{ background: level === l ? (l === 'ERROR' ? '#E05252' : l === 'WARN' ? '#E0A020' : '#E8472A') : '#1A1A1A', color: level === l ? '#fff' : '#666', border: `1px solid ${level === l ? 'transparent' : '#2A2A2A'}` }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button key={r.label} onClick={() => setTimeRange(r)} className="text-sm px-2 py-1.5 rounded transition-colors"
              style={{ background: timeRange.label === r.label ? '#E8472A20' : '#1A1A1A', color: timeRange.label === r.label ? '#E8472A' : '#666', border: `1px solid ${timeRange.label === r.label ? '#E8472A40' : '#2A2A2A'}` }}>
              {r.label}
            </button>
          ))}
        </div>
        {['gateway', 'audit'].map(src => (
          <button key={src} onClick={() => setSources(s => ({ ...s, [src]: !s[src] }))} className="text-sm px-2 py-1.5 rounded transition-colors"
            style={{ background: sources[src] ? (src === 'audit' ? '#7C6FCD20' : '#E8472A15') : '#1A1A1A', color: sources[src] ? (src === 'audit' ? '#7C6FCD' : '#E8472A') : '#555', border: `1px solid ${sources[src] ? (src === 'audit' ? '#7C6FCD40' : '#E8472A40') : '#2A2A2A'}` }}>
            {src}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setLiveMode(l => !l)} className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded transition-colors"
            style={{ background: liveMode ? '#E8472A15' : '#1A1A1A', color: liveMode ? '#E8472A' : '#555', border: `1px solid ${liveMode ? '#E8472A40' : '#2A2A2A'}` }}>
            <div className={`w-1.5 h-1.5 rounded-full ${liveMode ? 'animate-pulse' : ''}`} style={{ background: liveMode ? '#E8472A' : '#444' }} />
            {liveMode ? 'Live' : 'Paused'}
          </button>
          <button onClick={fetchLogs} disabled={loading} className="p-1.5 rounded transition-colors" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }} title="Refresh now">
            <RefreshCw size={13} color="#666" className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportLogs} disabled={logs.length === 0} className="p-1.5 rounded transition-colors" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }} title="Export to file">
            <Download size={13} color="#666" />
          </button>
        </div>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto rounded-md relative" style={{ background: '#111', border: '1px solid #1E1E1E', minHeight: 0 }}
        ref={listRef} onScroll={onScroll}
        onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
        <div className="sticky top-0 flex items-center gap-2 px-3 py-1.5 font-mono text-sm border-b z-10"
          style={{ background: '#0D0D0D', borderColor: '#1E1E1E', color: '#444' }}>
          <span style={{ minWidth: '100px' }}>Time</span>
          <span style={{ minWidth: '46px' }}>Level</span>
          <span style={{ minWidth: '54px' }}>Source</span>
          <span>Message</span>
          {isPaused && (
            <span className="ml-auto flex items-center gap-1 text-sm" style={{ color: '#E0A020' }}>
              <Pause size={10} /> Paused
            </span>
          )}
        </div>
        {logs.length === 0
          ? <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#444' }}>{loading ? 'Loading logs…' : 'No log entries match your filters'}</div>
          : logs.map(entry => <LogRow key={entry.id} entry={entry} search={search} />)
        }
        <div id="log-bottom" />
      </div>

      <div className="flex items-center justify-between mt-2 flex-shrink-0">
        <span className="text-sm" style={{ color: '#444' }}>
          Showing {logs.length} of {total} entries · {timeRange.label} window
        </span>
        {!atBottomRef.current && (
          <button onClick={() => { listRef.current.scrollTop = listRef.current.scrollHeight; atBottomRef.current = true }}
            className="text-sm px-2 py-1 rounded" style={{ background: '#E8472A20', color: '#E8472A', border: '1px solid #E8472A40' }}>
            ↓ Scroll to bottom
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function useAutoRefresh(fn, intervalMs, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    fn()
    const id = setInterval(fn, intervalMs)
    return () => clearInterval(id)
  }, [enabled]) // eslint-disable-line
}

function EmptyState({ text }) {
  return (
    <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#444' }}>{text}</div>
  )
}

const STATUS_LABELS = {
  active:      'Active',
  idle:        'Idle',
  archived:    'Archived',
  success:     'Success',
  error:       'Error',
  pending:     'Pending',
  failed:      'Failed',
  quarantined: 'Quarantined',
  delivered:   'Delivered',
  running:     'Running',
  completed:   'Completed',
}

function StatusPill({ status }) {
  const map = {
    active:      { color: '#E8472A', bg: '#E8472A20', border: '#E8472A40', dot: true },
    idle:        { color: '#E0A020', bg: '#E0A02015', border: '#E0A02040', dot: false },
    archived:    { color: '#555',    bg: '#55555515', border: '#55555530', dot: false },
    success:     { color: '#4CAF50', bg: '#4CAF5015', border: '#4CAF5040', dot: false },
    error:       { color: '#E05252', bg: '#E0525215', border: '#E0525240', dot: false },
    pending:     { color: '#E0A020', bg: '#E0A02015', border: '#E0A02040', dot: false },
    failed:      { color: '#E05252', bg: '#E0525215', border: '#E0525240', dot: false },
    quarantined: { color: '#9C27B0', bg: '#9C27B015', border: '#9C27B040', dot: false },
    delivered:   { color: '#4CAF50', bg: '#4CAF5015', border: '#4CAF5040', dot: false },
    running:     { color: '#E8472A', bg: '#E8472A20', border: '#E8472A40', dot: true },
    completed:   { color: '#4CAF50', bg: '#4CAF5015', border: '#4CAF5040', dot: false },
  }
  const cfg = map[status] ?? map.idle
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.dot && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />}
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function relTime(isoStr) {
  if (!isoStr) return '—'
  const diff = Date.now() - new Date(isoStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function absTime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function FilterRow({ children }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3 flex-shrink-0">{children}</div>
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-48 px-3 py-2 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <Search size={13} color="#666" />
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent text-sm outline-none text-white placeholder-gray-600" />
    </div>
  )
}

function RefreshBtn({ onClick, loading, label }) {
  return (
    <button onClick={onClick} disabled={loading} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ml-auto"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}>
      <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
      {label ?? 'Refresh'}
    </button>
  )
}

function TabCard({ children }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ background: '#111', border: '1px solid #1E1E1E' }}>
      {children}
    </div>
  )
}

// ── Display helpers ──────────────────────────────────────────────────────────

function sessionLabel(key) {
  const parts = key.split(':')
  if (parts.length === 3 && parts[2] === 'main') return { label: 'WAGZ (Main)', sub: null }
  if (parts.length === 4 && parts[2] === 'cron') return { label: 'Scheduled Task', sub: parts[3].slice(0, 8) + '…' }
  if (parts.length === 4 && parts[2] === 'openai') return { label: 'OpenAI Sub-agent', sub: parts[3].slice(0, 8) + '…' }
  if (parts.length === 6 && parts[4] === 'run') return { label: 'Task Run', sub: parts[5].slice(0, 8) + '…' }
  return { label: parts.slice(2).join(':'), sub: null }
}

const MODEL_NAMES = {
  'gpt-5.1-codex-max': 'Codex Max',
  'openai-codex':       'Codex',
  'gpt-4o':             'GPT-4o',
  'gpt-4o-mini':        'GPT-4o Mini',
  'gpt-4.5':            'GPT-4.5',
  'gpt-oss-20b':        'GPT OSS 20B',
  'claude-3-5-sonnet':  'Sonnet 3.5',
  'claude-3-5-haiku':   'Haiku 3.5',
  'claude-3-7-sonnet':  'Sonnet 3.7',
  'claude-opus-4-5':    'Opus 4.5',
  'claude-sonnet-4-5':  'Sonnet 4.5',
  'claude-haiku-4-5':   'Haiku 4.5',
}

function modelLabel(model) {
  if (!model) return '—'
  const base = model.includes('/') ? model.split('/').pop() : model
  if (MODEL_NAMES[base]) return MODEL_NAMES[base]
  if (MODEL_NAMES[model]) return MODEL_NAMES[model]
  return base.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function cronHuman(scheduleKind, expr) {
  if (scheduleKind === 'at') {
    try { return `Once — ${absTime(expr)}` } catch { return expr }
  }
  if (!expr) return '—'
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, , dow] = parts
  const pad = n => String(n).padStart(2, '0')
  const t = `${pad(hour)}:${pad(min)}`
  if (dom.startsWith('*/') && dow === '*') return `Every ${dom.slice(2)} days at ${t}`
  if (dom === '*' && dow === '*' && hour !== '*') return `Daily at ${t}`
  if (hour.startsWith('*/') && dom === '*') return `Every ${hour.slice(2)} hours`
  if (hour === '*' && dom === '*') return 'Hourly'
  return expr
}

function fmtDuration(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const EXEC_HUMANIZE = [
  [/^openclaw\s+update/i,   'Running OpenClaw update'],
  [/^openclaw\s+models/i,   'Listing models'],
  [/^openclaw\s+sessions/i, 'Listing sessions'],
  [/^openclaw\s+status/i,   'Checking OpenClaw status'],
  [/^openclaw\s+channels/i, 'Checking channels'],
  [/^git\s+commit/i,        'Committing changes'],
  [/^git\s+push/i,          'Pushing to remote'],
  [/^git\s+pull/i,          'Pulling latest changes'],
  [/^git\s+add/i,           'Staging files'],
  [/^npm\s+install/i,       'Installing npm packages'],
  [/^pip\s+install/i,       'Installing Python packages'],
  [/^rm\s+-rf/i,            'Deleting files'],
  [/^mkdir/i,               'Creating directory'],
  [/^curl\s+/i,             'HTTP request'],
  [/^python\s+/i,           'Running Python script'],
  [/^node\s+/i,             'Running Node script'],
  [/^bash\s+/i,             'Running shell script'],
]

function humanSummary(summary) {
  if (!summary) return ''
  if (summary.startsWith('exec: ')) {
    const cmd = summary.slice(6).trim()
    for (const [pat, label] of EXEC_HUMANIZE) {
      if (pat.test(cmd)) return label
    }
    return `Running: ${cmd.length > 50 ? cmd.slice(0, 50) + '…' : cmd}`
  }
  if (summary.startsWith('process.poll: '))  return `Monitoring: ${summary.slice(14)}`
  if (summary.startsWith('process.start: ')) return `Starting: ${summary.slice(15)}`
  if (summary.startsWith('process.stop: '))  return `Stopping: ${summary.slice(14)}`
  if (summary.startsWith('read: '))  return `Reading: ${summary.slice(6).split('/').pop()}`
  if (summary.startsWith('write: ')) return `Writing: ${summary.slice(7).split('/').pop()}`
  if (summary.startsWith('search: ')) return `Searching: ${summary.slice(8)}`
  return summary
}

function translateCronError(err) {
  if (!err) return null
  if (/unknown model/i.test(err)) return 'Model not found — update model in Routing'
  if (/cron delivery target is missing|delivery target.*missing|missing.*delivery/i.test(err))
    return 'No delivery channel set — configure in Channels'
  return err
}

const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/

function stripTimestamp(s) {
  if (!s) return s
  return s.replace(ISO_TS_RE, '').trim()
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — SESSIONS
// ═══════════════════════════════════════════════════════════════════════════

function SessionsTab({ authToken }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('')

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const r = await fetch(`/api/observe/sessions${params}`, { headers: { Authorization: `Bearer ${authToken}` } })
      const d = await r.json()
      setSessions(d.sessions || [])
    } catch { /* keep */ } finally { setLoading(false) }
  }, [authToken, statusFilter])

  useAutoRefresh(load, 30_000)

  const filtered = sessions.filter(s =>
    !search || s.key.toLowerCase().includes(search.toLowerCase()) ||
    s.model.toLowerCase().includes(search.toLowerCase())
  )

  const counts = { active: 0, idle: 0, archived: 0 }
  sessions.forEach(s => counts[s.status] = (counts[s.status] || 0) + 1)

  return (
    <div className="flex flex-col h-full">
      <FilterRow>
        <SearchBox value={search} onChange={setSearch} placeholder="Search session key or model…" />
        <div className="flex gap-1">
          {['', 'active', 'idle', 'archived'].map(st => (
            <button key={st} onClick={() => setStatus(st)} className="text-xs px-2.5 py-1.5 rounded transition-colors"
              style={{ background: statusFilter === st ? '#E8472A' : '#1A1A1A', color: statusFilter === st ? '#fff' : '#666', border: `1px solid ${statusFilter === st ? 'transparent' : '#2A2A2A'}` }}>
              {st || 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="text-xs" style={{ color: k === 'active' ? '#E8472A' : k === 'idle' ? '#E0A020' : '#555' }}>
              {v} {k}
            </span>
          ))}
        </div>
        <RefreshBtn onClick={load} loading={loading} />
      </FilterRow>

      <TabCard>
        {/* Header */}
        <div className="grid text-xs px-3 py-2 border-b font-medium"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderColor: '#1E1E1E', color: '#444', background: '#0D0D0D' }}>
          <span>Session</span><span>Model</span><span>Status</span><span>Last Active</span><span>Tokens</span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          {filtered.length === 0
            ? <EmptyState text={loading ? 'Loading sessions…' : 'No sessions match'} />
            : filtered.map(s => {
              const { label, sub } = sessionLabel(s.key)
              return (
                <div key={s.key} className="grid text-xs px-3 py-2.5 border-b hover:bg-white/5 transition-colors items-center"
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderColor: '#1A1A1A' }}>
                  <div>
                    <div className="font-semibold" style={{ color: '#DDD' }}>{label}</div>
                    {sub && <div className="mt-0.5 font-mono" style={{ color: '#555' }}>{sub}</div>}
                  </div>
                  <div style={{ color: '#999' }}>{modelLabel(s.model)}</div>
                  <div><StatusPill status={s.status} /></div>
                  <div style={{ color: '#666' }}>{relTime(s.last_activity)}</div>
                  <div style={{ color: '#666' }}>
                    {s.total_tokens ? `${(s.total_tokens / 1000).toFixed(1)}k` : '—'}
                    {s.context_tokens ? <span style={{ color: '#444' }}> / {(s.context_tokens / 1000).toFixed(0)}k</span> : null}
                  </div>
                </div>
              )
            })
          }
        </div>
      </TabCard>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — TASKS / CRON
// ═══════════════════════════════════════════════════════════════════════════

function CronTab({ authToken }) {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const r = await fetch('/api/observe/cron', { headers: { Authorization: `Bearer ${authToken}` } })
      const d = await r.json()
      setJobs(d.jobs || [])
    } catch { /* keep */ } finally { setLoading(false) }
  }, [authToken])

  useAutoRefresh(load, 30_000)

  return (
    <div className="flex flex-col h-full">
      <FilterRow>
        <span className="text-xs" style={{ color: '#555' }}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
        <RefreshBtn onClick={load} loading={loading} />
      </FilterRow>

      <div className="space-y-3">
        {jobs.length === 0
          ? <TabCard><EmptyState text={loading ? 'Loading jobs…' : 'No cron jobs configured'} /></TabCard>
          : jobs.map(job => (
            <div key={job.id} className="p-4 rounded-md" style={{ background: '#1A1A1A', border: `1px solid ${job.last_status === 'error' ? '#E0525240' : '#2A2A2A'}` }}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{job.name}</span>
                    {!job.enabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#55555520', color: '#666', border: '1px solid #33333340' }}>disabled</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#888' }}>{cronHuman(job.schedule_kind, job.schedule)}</div>
                  <div className="text-xs mt-0.5 font-mono" style={{ color: '#444' }} title={job.schedule}>{job.schedule}</div>
                </div>
                <StatusPill status={job.last_status ?? 'pending'} />
              </div>

              {job.payload_preview && (
                <div className="text-xs mb-2 px-2 py-1.5 rounded" style={{ background: '#0D0D0D', color: '#777', border: '1px solid #222' }}>
                  {job.payload_preview}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  ['Last Run', relTime(job.last_run)],
                  ['Next Run', absTime(job.next_run)],
                  ['Duration', fmtDuration(job.last_duration_ms)],
                  ['Errors', job.consecutive_errors > 0 ? `${job.consecutive_errors} consecutive` : '0'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ color: '#555' }}>{label}</div>
                    <div style={{ color: '#999' }}>{val}</div>
                  </div>
                ))}
              </div>

              {job.last_error && (
                <div className="mt-2 text-xs px-2 py-1.5 rounded" style={{ background: '#E0525210', color: '#E05252', border: '1px solid #E0525230' }}>
                  {translateCronError(job.last_error)}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — DELIVERY QUEUE
// ═══════════════════════════════════════════════════════════════════════════

function QueueTab({ authToken }) {
  const [events, setEvents]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [statusFilter, setStatus] = useState('')

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const r = await fetch(`/api/observe/queue${params}`, { headers: { Authorization: `Bearer ${authToken}` } })
      const d = await r.json()
      setEvents(d.events || [])
    } catch { /* keep */ } finally { setLoading(false) }
  }, [authToken, statusFilter])

  useAutoRefresh(load, 30_000)

  const statusColor = {
    pending:     '#E0A020',
    failed:      '#E05252',
    quarantined: '#9C27B0',
    delivered:   '#4CAF50',
  }

  return (
    <div className="flex flex-col h-full">
      <FilterRow>
        <div className="flex gap-1">
          {['', 'pending', 'failed', 'quarantined', 'delivered'].map(st => (
            <button key={st} onClick={() => setStatus(st)} className="text-xs px-2.5 py-1.5 rounded transition-colors"
              style={{ background: statusFilter === st ? '#E8472A' : '#1A1A1A', color: statusFilter === st ? '#fff' : '#666', border: `1px solid ${statusFilter === st ? 'transparent' : '#2A2A2A'}` }}>
              {st || 'All'}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: '#555' }}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
        <RefreshBtn onClick={load} loading={loading} />
      </FilterRow>

      <TabCard>
        <div className="grid text-xs px-3 py-2 border-b font-medium"
          style={{ gridTemplateColumns: '1fr 1fr 1.5fr 1fr 1fr', borderColor: '#1E1E1E', color: '#444', background: '#0D0D0D' }}>
          <span>Time</span><span>Channel</span><span>Message</span><span>Status</span><span>Retries</span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          {events.length === 0
            ? <EmptyState text={loading ? 'Loading queue…' : 'No delivery events — channels not yet configured'} />
            : events.map(ev => (
              <div key={ev.id} className="grid text-xs px-3 py-2.5 border-b hover:bg-white/5 transition-colors items-center"
                style={{ gridTemplateColumns: '1fr 1fr 1.5fr 1fr 1fr', borderColor: '#1A1A1A' }}>
                <span className="font-mono" style={{ color: '#666' }}>{relTime(ev.ts)}</span>
                <span style={{ color: '#999' }}>{ev.channel}</span>
                <span className="truncate" style={{ color: '#777' }} title={ev.message}>{ev.message}</span>
                <StatusPill status={ev.status} />
                <span style={{ color: ev.retry_count > 0 ? '#E0A020' : '#555' }}>{ev.retry_count}</span>
              </div>
            ))
          }
        </div>
      </TabCard>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5 — ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════

function ToolActionRow({ action }) {
  const iconColor = action.status === 'completed' ? '#4CAF50' : action.status === 'error' ? '#E05252' : '#E8472A'
  const Icon = action.status === 'completed' ? CheckCircle : action.status === 'error' ? XCircle : Zap

  return (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0" style={{ borderColor: '#1E1E1E' }}>
      <Icon size={12} color={iconColor} className={action.status === 'running' ? 'animate-pulse mt-0.5' : 'mt-0.5'} style={{ flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#DDD' }}>{humanSummary(action.summary)}</span>
          {action.duration_ms != null && (
            <span className="text-xs" style={{ color: '#555' }}>{fmtDuration(action.duration_ms)}</span>
          )}
        </div>
        {action.result_preview && (
          <div className="text-xs mt-0.5 truncate" style={{ color: '#555' }}>{action.result_preview}</div>
        )}
      </div>
      <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>{relTime(action.timestamp)}</span>
    </div>
  )
}

function AgentNode({ agent, depth = 0 }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = agent.children && agent.children.length > 0
  const hasActions  = agent.actions && agent.actions.length > 0

  const borderColor = agent.status === 'active' ? '#E8472A40' : '#2A2A2A'
  const indent = depth * 20

  return (
    <div style={{ marginLeft: `${indent}px` }} className="mb-3">
      {/* Connector line for children */}
      <div className="relative">
        {depth > 0 && (
          <div className="absolute" style={{ left: -12, top: 14, width: 10, height: 1, background: '#2A2A2A' }} />
        )}

        <div className="rounded-md" style={{ background: '#1A1A1A', border: `1px solid ${borderColor}` }}>
          {/* Agent header */}
          <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
            <div className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: agent.status === 'active' ? '#E8472A' : '#444', boxShadow: agent.status === 'active' ? '0 0 6px #E8472A80' : 'none' }} />
            <span className="text-xs font-semibold flex-1" style={{ color: '#DDD' }}>{sessionLabel(agent.key).label}</span>
            <StatusPill status={agent.status} />
            {agent.model && <span className="text-xs hidden md:block" style={{ color: '#555' }}>{modelLabel(agent.model)}</span>}
            <span className="text-xs" style={{ color: '#444' }}>{relTime(agent.last_activity)}</span>
            {(hasActions || hasChildren) && (
              <ChevronDown size={12} color="#555" style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
            )}
          </div>

          {/* Task description */}
          {expanded && agent.current_task && (
            <div className="px-3 pb-2 text-xs" style={{ color: '#777', borderTop: '1px solid #222' }}>
              <span style={{ color: '#555' }}>Task: </span>{stripTimestamp(agent.current_task)}
            </div>
          )}

          {/* Actions feed */}
          {expanded && hasActions && (
            <div className="px-3 pb-2" style={{ borderTop: '1px solid #1A1A1A' }}>
              <div className="text-xs mb-1 mt-2" style={{ color: '#555' }}>Recent actions</div>
              {agent.actions.map((a, i) => <ToolActionRow key={a.id + i} action={a} />)}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-2 border-l" style={{ borderColor: '#2A2A2A', marginLeft: 10, paddingLeft: 2 }}>
          {agent.children.map(child => <AgentNode key={child.key} agent={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

function ActivityTab({ authToken }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const r = await fetch('/api/observe/activity', { headers: { Authorization: `Bearer ${authToken}` } })
      setData(await r.json())
      setLastRefresh(new Date())
    } catch { /* keep */ } finally { setLoading(false) }
  }, [authToken])

  useAutoRefresh(load, 5_000)

  const agents   = data?.agents ?? []
  const approvals = data?.pending_approvals ?? []
  const activeCount = agents.filter(a => a.status === 'active').length

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#E8472A' }} />
            <span className="text-xs" style={{ color: '#E8472A' }}>Live · 5s</span>
          </div>
          <span className="text-xs" style={{ color: '#555' }}>
            {agents.length} agent{agents.length !== 1 ? 's' : ''}{activeCount > 0 ? ` · ${activeCount} active` : ''}
          </span>
          {lastRefresh && (
            <span className="text-xs" style={{ color: '#444' }}>Updated {relTime(lastRefresh.toISOString())}</span>
          )}
        </div>
        <RefreshBtn onClick={load} loading={loading} />
      </div>

      {/* Approvals banner */}
      {approvals.length > 0 && (
        <div className="mb-3 p-3 rounded-md flex-shrink-0" style={{ background: '#E0A02015', border: '1px solid #E0A02040' }}>
          <div className="text-xs font-semibold mb-1.5" style={{ color: '#E0A020' }}>
            {approvals.length} allowlist {approvals.length === 1 ? 'rule' : 'rules'} active
          </div>
          <div className="space-y-1">
            {approvals.map((ap, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                <CheckCircle size={11} color="#4CAF50" />
                <span className="font-mono">{ap.pattern}</span>
                <span style={{ color: '#555' }}>({ap.scope})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent tree */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {agents.length === 0
          ? <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#444' }}>
              {loading ? 'Loading activity…' : 'No recent agent activity'}
            </div>
          : agents.map(agent => <AgentNode key={agent.key} agent={agent} depth={0} />)
        }
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT — SUB-TAB SHELL
// ═══════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'logs',     label: 'Logs',     Icon: Filter },
  { id: 'sessions', label: 'Sessions', Icon: Cpu },
  { id: 'cron',     label: 'Tasks',    Icon: Clock },
  { id: 'queue',    label: 'Queue',    Icon: Send },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

export default function Logs() {
  const { authToken } = useWagzStore()
  const [activeTab, setActiveTab] = useState('logs')

  return (
    <div className="flex flex-col h-full p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Observability Hub</h1>
          <p className="text-sm mt-0.5" style={{ color: '#666' }}>
            Phase 2 — Logs · Sessions · Tasks · Queue · Activity
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-4 flex-shrink-0 border-b" style={{ borderColor: '#2A2A2A' }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 transition-colors relative"
              style={{ color: active ? '#E8472A' : '#666' }}
            >
              <Icon size={12} />
              {label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: '#E8472A' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'logs'     && <LogsTab     authToken={authToken} />}
        {activeTab === 'sessions' && <SessionsTab authToken={authToken} />}
        {activeTab === 'cron'     && <CronTab     authToken={authToken} />}
        {activeTab === 'queue'    && <QueueTab    authToken={authToken} />}
        {activeTab === 'activity' && <ActivityTab authToken={authToken} />}
      </div>
    </div>
  )
}
