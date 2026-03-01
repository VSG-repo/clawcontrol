/**
 * ChatMessage — renders a single chat turn.
 * - User messages: right-aligned bubble
 * - Assistant messages: left-aligned with:
 *   - Model badge + tier
 *   - Failover indicator (⚡ badge)
 *   - Streaming spinner
 *   - Cost/token/latency footer
 *   - Expandable metadata drawer
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Zap, Copy, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const TIER_COLORS = {
  T1: '#E8472A',
  T2: '#7C6FCD',
  T3: '#E0A020',
  T4: '#4A90D9',
}

function tierColor(tier) {
  return TIER_COLORS[tier] || '#666'
}

function shortModel(model_id) {
  if (!model_id) return '—'
  return model_id.split('/').pop()
}

function formatCost(usd) {
  if (usd == null) return '—'
  if (usd < 0.000001) return '<$0.000001'
  return `$${usd.toFixed(6)}`
}

function formatLatency(ms) {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function formatLive(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

function LatencyBadge({ msg }) {
  const [elapsed, setElapsed] = useState(() =>
    msg.startedAt ? Date.now() - msg.startedAt : 0
  )
  const intervalRef = useRef(null)

  useEffect(() => {
    if (msg.status !== 'streaming') {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - (msg.startedAt ?? Date.now()))
    }, 100)
    return () => clearInterval(intervalRef.current)
  }, [msg.status, msg.startedAt])

  const isStreaming = msg.status === 'streaming'
  const display = isStreaming
    ? formatLive(elapsed)
    : msg.latency_ms != null
      ? formatLive(msg.latency_ms)
      : null

  if (!display) return null

  return (
    <span
      className="flex items-center gap-1 text-xs tabular-nums"
      style={{ color: isStreaming ? '#E8472A' : '#555' }}
    >
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
          style={{ background: '#E8472A' }}
        />
      )}
      ⏱ {display}
    </span>
  )
}

function MetadataDrawer({ msg }) {
  const navigate = useNavigate()

  const rows = [
    { label: 'Request ID', value: msg.request_id || '—' },
    { label: 'Model ID', value: msg.model_id || '—' },
    { label: 'Requested Model', value: msg.requested_model_id || '—' },
    { label: 'Latency', value: formatLatency(msg.latency_ms) },
    { label: 'Tokens (prompt)', value: msg.prompt_tokens ?? '—' },
    { label: 'Tokens (completion)', value: msg.completion_tokens ?? '—' },
    { label: 'Cost estimate', value: formatCost(msg.cost_estimate) },
    { label: 'Finish reason', value: msg.finish_reason || '—' },
  ]

  const handleJumpToLog = () => {
    // Store ts for logs page to pick up
    if (msg.ts) {
      localStorage.setItem('wagz_log_jump_ts', msg.ts)
    }
    navigate('/logs')
  }

  return (
    <div
      className="mt-2 rounded-md text-xs"
      style={{ background: '#111', border: '1px solid #2A2A2A' }}
    >
      <div className="px-3 py-2 space-y-1.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4">
            <span style={{ color: '#555' }}>{label}</span>
            <span
              className="font-mono truncate text-right"
              style={{ color: '#888', maxWidth: '200px' }}
              title={String(value)}
            >
              {String(value)}
            </span>
          </div>
        ))}
      </div>
      <div
        className="px-3 py-2 flex justify-end"
        style={{ borderTop: '1px solid #222' }}
      >
        <button
          onClick={handleJumpToLog}
          className="text-xs transition-colors"
          style={{ color: '#E8472A' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Jump to logs →
        </button>
      </div>
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded transition-colors"
      style={{ color: '#444' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
      title="Copy response"
      aria-label={copied ? 'Copied' : 'Copy response'}
    >
      {copied ? <Check size={12} color="#E8472A" /> : <Copy size={12} />}
    </button>
  )
}

export default function ChatMessage({ msg }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  try {
  if (msg.role === 'user') {
    const atts = msg.attachments ?? []
    const images = atts.filter((a) => a.type === 'image')
    const files  = atts.filter((a) => a.type !== 'image')
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] flex flex-col gap-2">
          {/* Attachment previews above text */}
          {(images.length > 0 || files.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-end">
              {images.map((att) =>
                att.data ? (
                  <img
                    key={att.id}
                    src={att.data}
                    alt={att.name}
                    className="rounded-lg object-contain"
                    style={{ maxWidth: 150, maxHeight: 100 }}
                  />
                ) : (
                  <span
                    key={att.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
                    style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
                    title={att.name}
                  >
                    📷 {att.name.length > 20 ? att.name.slice(0, 20) + '…' : att.name}
                  </span>
                )
              )}
              {files.map((att) => (
                <span
                  key={att.id}
                  className="text-xs px-2.5 py-1.5 rounded-md"
                  style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                >
                  {att.name.length > 20 ? att.name.slice(0, 20) + '…' : att.name}
                </span>
              ))}
            </div>
          )}
          {/* Text bubble — hide if empty and attachments present */}
          {msg.content && (
            <div
              className="px-3.5 py-2.5 rounded-xl text-base"
              style={{
                background: '#1E1E1E',
                border: '1px solid #2A2A2A',
                color: '#E8E8E8',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  const isStreaming = msg.status === 'streaming'
  const isError = msg.status === 'error'
  const hasContent = !!msg.content

  return (
    <div className="mb-5">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        {/* Tier badge */}
        {msg.tier && (
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{
              background: `${tierColor(msg.tier)}20`,
              color: tierColor(msg.tier),
            }}
          >
            {msg.tier}
          </span>
        )}

        {/* Model name */}
        <span className="text-xs font-medium" style={{ color: '#888' }}>
          {shortModel(msg.model_id)}
        </span>

        {/* Failover badge */}
        {msg.failover && (
          <span
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
            style={{ background: '#E0A02020', color: '#E0A020' }}
            title={`Routed via fallback — originally requested: ${msg.failover_from}`}
          >
            <Zap size={10} fill="#E0A020" />
            Fallback: {shortModel(msg.failover_from)}
          </span>
        )}

        {/* Live latency timer — ticks during streaming, shows final time when done */}
        <LatencyBadge msg={msg} />

        <div className="ml-auto flex items-center gap-1">
          {hasContent && <CopyButton text={msg.content} />}
          {/* Metadata toggle */}
          {msg.status === 'done' && (
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="p-1 rounded transition-colors"
              style={{ color: '#444' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
              title="Toggle metadata"
              aria-label={drawerOpen ? 'Hide metadata' : 'Show metadata'}
              aria-expanded={drawerOpen}
            >
              {drawerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Message body */}
      <div
        className="text-base rounded-xl px-4 py-3"
        style={{
          background: isError ? '#1A0A0A' : '#141414',
          border: `1px solid ${isError ? '#4A1A1A' : '#1E1E1E'}`,
          color: isError ? '#E05252' : '#E0E0E0',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: isStreaming && !hasContent ? '2.5rem' : undefined,
        }}
      >
        {isStreaming && !hasContent ? (
          <span className="animate-pulse" style={{ color: '#444' }}>
            ▋
          </span>
        ) : (
          msg.content
        )}
      </div>

      {/* Footer stats */}
      {msg.status === 'done' && (
        <div
          className="flex items-center gap-3 mt-1.5 px-1 text-xs"
          style={{ color: '#666' }}
        >
          <span>{msg.token_estimate != null ? `${msg.token_estimate} tok` : ''}</span>
          <span>·</span>
          <span>{formatCost(msg.cost_estimate)}</span>
        </div>
      )}

      {/* Metadata drawer */}
      {drawerOpen && <MetadataDrawer msg={msg} />}
    </div>
  )
  } catch (err) {
    console.error('ChatMessage render error:', err)
    return (
      <div
        className="mb-4 px-4 py-3 rounded-xl text-sm"
        style={{ border: '1px solid #E8472A', background: '#1A0A0A', color: '#E05252' }}
      >
        Failed to render message
      </div>
    )
  }
}
