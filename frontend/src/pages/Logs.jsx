import { useState, useEffect, useRef, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  Search, Download, RefreshCw, Pause, Play,
  AlertCircle, AlertTriangle, Info, Filter, ChevronDown,
} from 'lucide-react'

// ─── Level badge ──────────────────────────────────────────────────────────────

const LEVEL = {
  ERROR: { color: '#E05252', bg: '#E0525215', border: '#E0525240', icon: AlertCircle },
  WARN:  { color: '#E0A020', bg: '#E0A02015', border: '#E0A02040', icon: AlertTriangle },
  INFO:  { color: '#666666', bg: 'transparent', border: 'transparent', icon: Info },
}

function LevelBadge({ level }) {
  const cfg = LEVEL[level] ?? LEVEL.INFO
  return (
    <span
      className="inline-block text-xs px-1.5 py-0.5 rounded font-mono font-bold flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, minWidth: '46px', textAlign: 'center' }}
    >
      {level}
    </span>
  )
}

function SourceBadge({ source }) {
  return (
    <span
      className="inline-block text-xs px-1.5 py-0.5 rounded flex-shrink-0"
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

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({ entry, search }) {
  const cfg = LEVEL[entry.level] ?? LEVEL.INFO
  const ts = new Date(entry.ts)
  const timeStr = ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // Highlight search term in message
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
      className="flex items-start gap-2 px-3 py-1.5 border-b font-mono text-xs hover:bg-white/5 transition-colors"
      style={{ borderColor: '#1A1A1A', background: entry.level === 'ERROR' ? '#E0525208' : 'transparent' }}
    >
      {/* Timestamp */}
      <div className="flex-shrink-0 text-right" style={{ color: '#444', minWidth: '100px' }}>
        <span style={{ color: '#666' }}>{timeStr}</span>
        <span className="hidden md:inline" style={{ color: '#333' }}> {dateStr}</span>
      </div>

      {/* Level */}
      <LevelBadge level={entry.level} />

      {/* Source */}
      <SourceBadge source={entry.source} />

      {/* Message */}
      <span
        className="flex-1 break-all leading-relaxed"
        style={{ color: cfg.color === '#666666' ? '#999' : cfg.color }}
      >
        {highlight(entry.message)}
      </span>
    </div>
  )
}

// ─── Time range options ───────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '1h',  hours: 1 },
  { label: '6h',  hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
  { label: 'All', hours: null },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Logs() {
  const { authToken } = useWagzStore()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState('ALL')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [timeRange, setTimeRange] = useState(TIME_RANGES[2]) // default 24h
  const [sources, setSources] = useState({ gateway: true, audit: true })
  const [liveMode, setLiveMode] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [total, setTotal] = useState(0)

  const listRef = useRef(null)
  const atBottomRef = useRef(true)
  const liveRef = useRef(liveMode)
  liveRef.current = liveMode

  const sinceIso = () => {
    if (!timeRange.hours) return ''
    const d = new Date(Date.now() - timeRange.hours * 3600 * 1000)
    return d.toISOString()
  }

  const sourcesParam = () =>
    Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(',') || 'gateway'

  const fetchLogs = useCallback(async (append = false) => {
    if (!authToken) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        level,
        search,
        limit: '500',
        since: sinceIso(),
        sources: sourcesParam(),
      })
      const r = await fetch(`/api/logs?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await r.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch {
      // keep existing logs on error
    } finally {
      setLoading(false)
    }
  }, [authToken, level, search, timeRange, sources]) // eslint-disable-line

  // Initial + dependency-triggered fetch
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-scroll to bottom when new logs arrive (unless paused by hover)
  useEffect(() => {
    if (!listRef.current || isPaused) return
    if (atBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [logs, isPaused])

  // Live polling every 3s
  useEffect(() => {
    if (!liveMode) return
    const id = setInterval(() => {
      if (!isPaused) fetchLogs()
    }, 3000)
    return () => clearInterval(id)
  }, [liveMode, isPaused, fetchLogs])

  // Track scroll position to detect "at bottom"
  const onScroll = () => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 60
  }

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Export
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
    <div className="flex flex-col h-full p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">Logs Explorer</h1>
          <p className="text-xs mt-0.5" style={{ color: '#666' }}>
            Phase 2 — Gateway &amp; Config Audit Logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Error/warn summary */}
          {errorCount > 0 && (
            <span className="text-xs px-2 py-1 rounded" style={{ background: '#E0525215', color: '#E05252', border: '1px solid #E0525240' }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs px-2 py-1 rounded" style={{ background: '#E0A02015', color: '#E0A020', border: '1px solid #E0A02040' }}>
              {warnCount} warn{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs" style={{ color: '#555' }}>{total} entries</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 flex-shrink-0">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-48 px-3 py-2 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <Search size={13} color="#666" />
          <input
            type="text"
            placeholder="Search logs…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none text-white placeholder-gray-600"
          />
        </div>

        {/* Level filter */}
        <div className="flex gap-1">
          {['ALL', 'INFO', 'WARN', 'ERROR'].map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className="text-xs px-2.5 py-1.5 rounded font-medium transition-colors"
              style={{
                background: level === l ? (l === 'ERROR' ? '#E05252' : l === 'WARN' ? '#E0A020' : '#E8472A') : '#1A1A1A',
                color: level === l ? '#fff' : '#666',
                border: `1px solid ${level === l ? 'transparent' : '#2A2A2A'}`,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Time range */}
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setTimeRange(r)}
              className="text-xs px-2 py-1.5 rounded transition-colors"
              style={{
                background: timeRange.label === r.label ? '#E8472A20' : '#1A1A1A',
                color: timeRange.label === r.label ? '#E8472A' : '#666',
                border: `1px solid ${timeRange.label === r.label ? '#E8472A40' : '#2A2A2A'}`,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Source toggles */}
        {['gateway', 'audit'].map(src => (
          <button
            key={src}
            onClick={() => setSources(s => ({ ...s, [src]: !s[src] }))}
            className="text-xs px-2 py-1.5 rounded transition-colors"
            style={{
              background: sources[src] ? (src === 'audit' ? '#7C6FCD20' : '#E8472A15') : '#1A1A1A',
              color: sources[src] ? (src === 'audit' ? '#7C6FCD' : '#E8472A') : '#555',
              border: `1px solid ${sources[src] ? (src === 'audit' ? '#7C6FCD40' : '#E8472A40') : '#2A2A2A'}`,
            }}
          >
            {src}
          </button>
        ))}

        {/* Live / pause / refresh */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setLiveMode(l => !l)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded transition-colors"
            style={{
              background: liveMode ? '#E8472A15' : '#1A1A1A',
              color: liveMode ? '#E8472A' : '#555',
              border: `1px solid ${liveMode ? '#E8472A40' : '#2A2A2A'}`,
            }}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${liveMode ? 'animate-pulse' : ''}`}
              style={{ background: liveMode ? '#E8472A' : '#444' }} />
            {liveMode ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded transition-colors"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
            title="Refresh now"
          >
            <RefreshCw size={13} color="#666" className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={exportLogs}
            disabled={logs.length === 0}
            className="p-1.5 rounded transition-colors"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
            title="Export to file"
          >
            <Download size={13} color="#666" />
          </button>
        </div>
      </div>

      {/* Log list */}
      <div
        className="flex-1 overflow-y-auto rounded-md relative"
        style={{ background: '#111', border: '1px solid #1E1E1E', minHeight: 0 }}
        ref={listRef}
        onScroll={onScroll}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Column headers */}
        <div className="sticky top-0 flex items-center gap-2 px-3 py-1.5 font-mono text-xs border-b z-10"
          style={{ background: '#0D0D0D', borderColor: '#1E1E1E', color: '#444' }}>
          <span style={{ minWidth: '100px' }}>Time</span>
          <span style={{ minWidth: '46px' }}>Level</span>
          <span style={{ minWidth: '54px' }}>Source</span>
          <span>Message</span>
          {isPaused && (
            <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: '#E0A020' }}>
              <Pause size={10} /> Paused
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#444' }}>
            {loading ? 'Loading logs…' : 'No log entries match your filters'}
          </div>
        ) : (
          logs.map(entry => (
            <LogRow key={entry.id} entry={entry} search={search} />
          ))
        )}

        {/* Bottom sentinel for auto-scroll reference */}
        <div id="log-bottom" />
      </div>

      {/* Footer status bar */}
      <div className="flex items-center justify-between mt-2 flex-shrink-0">
        <span className="text-xs" style={{ color: '#444' }}>
          Showing {logs.length} of {total} entries · {timeRange.label} window
        </span>
        {!atBottomRef.current && (
          <button
            onClick={() => { listRef.current.scrollTop = listRef.current.scrollHeight; atBottomRef.current = true }}
            className="text-xs px-2 py-1 rounded"
            style={{ background: '#E8472A20', color: '#E8472A', border: '1px solid #E8472A40' }}
          >
            ↓ Scroll to bottom
          </button>
        )}
      </div>
    </div>
  )
}
