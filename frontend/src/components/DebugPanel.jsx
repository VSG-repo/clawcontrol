/**
 * DebugPanel — slide-in debug console.
 * 400px wide, fixed right, full height, z-50.
 * Entries are color-coded by level and labeled by category.
 */
import { useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { useDebugStore } from '@/store/useDebugStore'

const LEVEL_COLOR = {
  success: '#4ADE80',
  warn:    '#E0A020',
  error:   '#E05252',
  info:    '#555555',
}

const CAT_STYLE = {
  fetch:  { bg: '#0A1A0A', color: '#4ADE80' },
  sse:    { bg: '#0A0A1A', color: '#7C6FCD' },
  ws:     { bg: '#0A0F1A', color: '#4A90D9' },
  attach: { bg: '#1A0F0A', color: '#E0A020' },
}

export default function DebugPanel() {
  const { entries, open, setOpen, clear } = useDebugStore()
  const bottomRef = useRef(null)

  // Auto-scroll to bottom when new entries arrive (while open)
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [entries.length, open])

  if (!open) return null

  // Entries stored newest-first; display oldest-first (chronological)
  const displayed = [...entries].reverse()

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col"
      style={{
        width: '400px',
        background: '#0D0D0D',
        borderLeft: '1px solid #2A2A2A',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #1E1E1E' }}
      >
        <span className="text-sm font-medium" style={{ color: '#CCC' }}>Debug Console</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: '#333' }}>
            {entries.length}/200
          </span>
          <button
            onClick={clear}
            className="p-1 rounded transition-colors"
            style={{ color: '#444' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
            title="Clear log"
            aria-label="Clear log"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded transition-colors"
            style={{ color: '#444' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#E8472A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
            title="Close"
            aria-label="Close debug panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-2 space-y-px" style={{ fontFamily: 'monospace' }}>
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: '#2A2A2A' }}>
            No events captured yet
          </div>
        ) : (
          displayed.map((e) => {
            const cat = CAT_STYLE[e.category] ?? CAT_STYLE.fetch
            const lc  = LEVEL_COLOR[e.level] ?? '#555'
            return (
              <div
                key={e.id}
                className="flex items-start gap-1.5 px-2 py-1 rounded text-xs"
                style={{ background: '#080808', borderLeft: `2px solid ${lc}` }}
              >
                {/* Timestamp */}
                <span className="flex-shrink-0 text-xs" style={{ color: '#2A2A2A', minWidth: '80px' }}>
                  {e.ts}
                </span>
                {/* Category badge */}
                <span
                  className="flex-shrink-0 rounded px-1"
                  style={{ background: cat.bg, color: cat.color, fontSize: '10px', lineHeight: '16px' }}
                >
                  {e.category}
                </span>
                {/* Message + detail */}
                <div className="flex-1 min-w-0">
                  <span style={{ color: lc }}>{e.message}</span>
                  {e.detail && (
                    <div
                      className="mt-0.5 text-xs break-all"
                      style={{ color: '#444' }}
                    >
                      {e.detail}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
