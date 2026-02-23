/**
 * SessionList — left sidebar panel showing the last 20 chat sessions.
 *
 * Features:
 *  - Auto-generated title from first user message (60 char max)
 *  - Relative timestamp and model badge per session
 *  - Pin/unpin on hover (pinned sessions sort to top, persist in localStorage)
 *  - Active session highlighted with orange left border
 *  - "New" button creates a fresh thread
 */
import { useState } from 'react'
import { Plus, Pin, MessageSquareDashed } from 'lucide-react'

function formatAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000
  if (diff < 60)         return 'just now'
  if (diff < 3600)       return `${Math.round(diff / 60)}m ago`
  if (diff < 86400)      return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7)  return `${Math.round(diff / 86400)}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SessionItem({ session, isActive, onSelect, onTogglePin }) {
  const [hovered, setHovered] = useState(false)
  const showPin = hovered || session.pinned

  return (
    <button
      onClick={() => onSelect(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left rounded-md transition-colors"
      style={{
        padding: '8px 10px 8px 10px',
        background: isActive ? '#E8472A0D' : hovered ? '#141414' : 'transparent',
        borderLeft: `2px solid ${isActive ? '#E8472A' : 'transparent'}`,
        paddingLeft: isActive ? '8px' : '10px',
      }}
    >
      {/* Title row */}
      <div className="flex items-start gap-1">
        <p
          className="flex-1 min-w-0 text-xs leading-snug"
          style={{
            color: isActive ? '#E8E8E8' : '#888',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {session.title || 'New conversation'}
        </p>

        {/* Pin button */}
        {showPin && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(session.id) }}
            className="flex-shrink-0 p-0.5 rounded transition-opacity"
            style={{ opacity: session.pinned ? 1 : 0.5, marginTop: '1px' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = session.pinned ? '1' : '0.5')}
            title={session.pinned ? 'Unpin' : 'Pin to top'}
          >
            <Pin
              size={10}
              color={session.pinned ? '#E8472A' : '#666'}
              fill={session.pinned ? '#E8472A' : 'none'}
            />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-1" style={{ color: '#3A3A3A' }}>
        <span className="text-xs" style={{ color: '#444' }}>
          {formatAgo(session.ts)}
        </span>
        {session.model && (
          <>
            <span style={{ fontSize: '10px' }}>·</span>
            <span
              className="text-xs truncate"
              style={{ color: '#3A3A3A', maxWidth: '80px' }}
              title={session.model_id}
            >
              {session.model}
            </span>
          </>
        )}
      </div>
    </button>
  )
}

export default function SessionList({ sessions, activeId, onSelect, onTogglePin, onNewThread }) {
  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: '200px',
        background: '#0A0A0A',
        borderRight: '1px solid #1A1A1A',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #141414' }}
      >
        <span
          className="text-xs font-medium uppercase tracking-widest"
          style={{ color: '#333', letterSpacing: '0.08em' }}
        >
          History
        </span>
        <button
          onClick={onNewThread}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{ color: '#555', border: '1px solid #1E1E1E' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#E8472A'
            e.currentTarget.style.borderColor = '#E8472A50'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#555'
            e.currentTarget.style.borderColor = '#1E1E1E'
          }}
          title="New thread"
        >
          <Plus size={11} />
          New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquareDashed size={22} style={{ color: '#222', marginBottom: '8px' }} />
            <p className="text-xs" style={{ color: '#333' }}>
              No sessions yet
            </p>
            <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>
              Send a message to start
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeId}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
            />
          ))
        )}
      </div>
    </div>
  )
}
