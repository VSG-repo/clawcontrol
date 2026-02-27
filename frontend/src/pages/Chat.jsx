/**
 * Chat — Phase 3: Split-pane chat interface with session history.
 *
 * Layout: [Conversation] | [drag handle] | [ArtifactPane]
 *
 * Features:
 *  - Session history in main sidebar ("Your chats" subsection via useSessionStore)
 *  - Per-response metadata drawer (latency, tokens, cost, model, request ID)
 *  - Failover transparency badge
 *  - Cost per message streaming estimate + session total in header
 *  - Model selector (override routing per session)
 *  - Auto-scroll with pause on hover
 *  - Resizable artifact pane
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Send, ChevronRight, ChevronLeft, Cpu,
  DollarSign, Zap, RotateCcw, GripVertical, Plus
} from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useSessionStore } from '@/store/useSessionStore'
import ChatMessage from '@/components/ChatMessage'
import ArtifactPane from '@/components/ArtifactPane'
import { useWagzStore } from '@/store/useWagzStore'

const TIER_COLORS = {
  T1: '#E8472A',
  T2: '#7C6FCD',
  T3: '#E0A020',
  T4: '#4A90D9',
}

// ─── Model selector ──────────────────────────────────────────────────────────

function ModelSelector({ models, selected, onSelect }) {
  const [open, setOpen] = useState(false)

  const current = useMemo(() => {
    if (!selected) return models.find((m) => m.is_primary) ?? null
    return models.find((m) => m.model_id === selected) ?? null
  }, [models, selected])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3A3A3A')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2A2A2A')}
      >
        <Cpu size={11} color="#E8472A" />
        <span>{current?.name ?? 'Default'}</span>
        {current?.tier && (
          <span
            className="text-xs font-bold px-1 rounded"
            style={{
              background: `${TIER_COLORS[current.tier] ?? '#666'}20`,
              color: TIER_COLORS[current.tier] ?? '#666',
            }}
          >
            {current.tier}
          </span>
        )}
        {selected && (
          <span className="ml-1" style={{ color: '#E8472A', fontSize: '9px' }}>FORCED</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full mb-1 left-0 z-50 rounded-lg overflow-hidden py-1 min-w-[220px]"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
          >
            <div className="px-3 py-1.5 text-xs uppercase tracking-wider" style={{ color: '#444' }}>
              Model Override
            </div>
            <button
              onClick={() => { onSelect(null); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
              style={{ background: !selected ? '#E8472A15' : 'transparent', color: !selected ? '#E8472A' : '#888' }}
              onMouseEnter={(e) => { if (selected) e.currentTarget.style.background = '#1E1E1E' }}
              onMouseLeave={(e) => { if (selected) e.currentTarget.style.background = 'transparent' }}
            >
              Gateway Default (auto-route)
            </button>
            {models.map((m) => (
              <button
                key={m.model_id}
                onClick={() => { onSelect(m.model_id); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
                style={{ background: selected === m.model_id ? '#E8472A15' : 'transparent', color: selected === m.model_id ? '#E8472A' : '#888' }}
                onMouseEnter={(e) => { if (selected !== m.model_id) e.currentTarget.style.background = '#1E1E1E' }}
                onMouseLeave={(e) => { if (selected !== m.model_id) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ color: TIER_COLORS[m.tier] ?? '#555', minWidth: '22px', fontWeight: 700 }}>
                  {m.tier ?? '—'}
                </span>
                <span className="truncate">{m.name}</span>
                {m.is_primary && (
                  <span className="ml-auto text-xs" style={{ color: '#E8472A' }}>primary</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Input bar ───────────────────────────────────────────────────────────────

function InputBar({ onSend, isStreaming, models, selectedModel, onSelectModel }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!text.trim() || isStreaming) return
    onSend(text)
    setText('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  return (
    <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid #1E1E1E', background: '#0D0D0D' }}>
      <div className="flex items-center gap-2 mb-2">
        <ModelSelector models={models} selected={selectedModel} onSelect={onSelectModel} />
      </div>
      <div
        className="flex items-end gap-2 rounded-xl px-3 py-2"
        style={{ background: '#141414', border: '1px solid #2A2A2A' }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none"
          style={{ color: '#E8E8E8', lineHeight: '1.5', minHeight: '24px', maxHeight: '160px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isStreaming}
          className="flex-shrink-0 p-2 rounded-lg transition-all"
          style={{
            background: text.trim() && !isStreaming ? '#E8472A' : '#1E1E1E',
            color: text.trim() && !isStreaming ? '#FFF' : '#444',
            cursor: text.trim() && !isStreaming ? 'pointer' : 'not-allowed',
          }}
        >
          {isStreaming ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      <p className="text-xs mt-1.5 px-1" style={{ color: '#2A2A2A' }}>
        Routed through OpenClaw gateway · context persists in thread
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Chat() {
  const { authToken } = useWagzStore()

  const {
    messages,
    isStreaming,
    sessionCost,
    sessionTokens,
    contextId,
    selectedModel,
    setSelectedModel,
    send,
    newThread,
    loadSession,
  } = useChat()

  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActiveId = useSessionStore((s) => s.setActiveId)
  const createSession = useSessionStore((s) => s.createSession)
  const updateSession = useSessionStore((s) => s.updateSession)

  const [models, setModels] = useState([])
  const [artifactOpen, setArtifactOpen] = useState(true)
  const [splitPct, setSplitPct] = useState(80)

  // Scroll management
  const scrollRef = useRef(null)
  const isHovering = useRef(false)
  const lastMsgCount = useRef(0)

  // Drag-to-resize
  const containerRef = useRef(null)
  const isDragging = useRef(false)

  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(80, Math.max(20, pct)))
    }

    const onUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Load models
  useEffect(() => {
    fetch('/api/chat/models', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => {})
  }, [authToken])

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isHovering.current) return
    const msgCount = messages.length
    const lastMsg = messages[messages.length - 1]
    if (msgCount !== lastMsgCount.current || lastMsg?.status === 'streaming') {
      lastMsgCount.current = msgCount
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Persist session messages after each completed assistant response.
  // Guard: only run when the last assistant message is done (not just a user message).
  useEffect(() => {
    if (!contextId || messages.length === 0) return
    const lastAssist = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssist || lastAssist.status === 'streaming') return

    updateSession(contextId, {
      messages,
      model: lastAssist.model ?? null,
      model_id: lastAssist.model_id ?? null,
    })
  }, [messages, contextId, updateSession])

  // Send handler — creates session on first message in a new thread
  const handleSend = useCallback(
    async (text) => {
      const usedCtxId = await send(text)
      if (!usedCtxId) return
      // Create session entry if this is a new context
      if (!sessions.find((s) => s.id === usedCtxId)) {
        createSession(usedCtxId, text)
      }
    },
    [send, sessions, createSession]
  )

  // New thread — clear active selection and chat state
  const handleNewThread = useCallback(() => {
    if (isStreaming) return
    setActiveId(null)
    newThread()
  }, [isStreaming, setActiveId, newThread])

  // Load a session from history
  const handleSelectSession = useCallback(
    (session) => {
      if (isStreaming) return
      setActiveId(session.id)
      loadSession(session.messages ?? [], session.id)
    },
    [isStreaming, setActiveId, loadSession]
  )

  // Listen for session-load events dispatched by Layout sidebar
  useEffect(() => {
    const handler = (e) => {
      const session = e.detail
      if (!session || isStreaming) return
      setActiveId(session.id)
      loadSession(session.messages ?? [], session.id)
    }
    window.addEventListener('clawcontrol:load-session', handler)
    return () => window.removeEventListener('clawcontrol:load-session', handler)
  }, [isStreaming, setActiveId, loadSession])

  // Artifact pane
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return null
  }, [messages])

  const hasArtifact = useMemo(() => {
    if (!lastAssistant?.content) return false
    return /```[\w]*\n[\s\S]*?```|\|.+\|.+\|/.test(lastAssistant.content)
  }, [lastAssistant])

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#0D0D0D' }}>

      {/* Main area: conversation + artifact */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid #1E1E1E', background: '#0D0D0D' }}
        >
          <button
            onClick={handleNewThread}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm transition-colors"
            style={{ color: '#CCC', border: '1px solid #2A2A2A' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#E8472A'; e.currentTarget.style.borderColor = '#E8472A40' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#CCC'; e.currentTarget.style.borderColor = '#2A2A2A' }}
            title="New chat"
          >
            <Plus size={13} />
            New Chat
          </button>

          <div className="flex items-center gap-3 ml-auto text-xs" style={{ color: '#555' }}>
            {sessionTokens > 0 && (
              <span className="flex items-center gap-1">
                <Zap size={11} color="#555" />
                {sessionTokens.toLocaleString()} tok
              </span>
            )}
            {sessionCost > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign size={11} color="#555" />
                ${sessionCost.toFixed(6)}
              </span>
            )}
            <button
              onClick={() => setArtifactOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
              style={{
                border: '1px solid #222',
                color: artifactOpen ? '#E8472A' : '#555',
                borderColor: artifactOpen ? '#E8472A30' : '#222',
              }}
              title={artifactOpen ? 'Hide artifact pane' : 'Show artifact pane'}
            >
              {artifactOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
              Artifact
            </button>
          </div>
        </div>

        {/* Split-pane body */}
        <div ref={containerRef} className="flex flex-1 overflow-hidden">

          {/* Conversation pane */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: artifactOpen ? `${splitPct}%` : '100%', minWidth: 0 }}
          >
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4"
              onMouseEnter={() => { isHovering.current = true }}
              onMouseLeave={() => { isHovering.current = false }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="mb-4" style={{ opacity: 0.15 }}>
                    <path d="M 8 22 C 3 16 1 9 4 3" stroke="#E8472A" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M 12 22 C 13 15 11 8 12 2" stroke="#E8472A" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M 16 22 C 21 16 23 9 20 3" stroke="#E8472A" strokeWidth="1.9" strokeLinecap="round" />
                    <line x1="12" y1="20" x2="18" y2="8" stroke="#E8472A" strokeWidth="1.35" strokeLinecap="round" />
                    <circle cx="12" cy="20" r="1.55" fill="#E8472A" />
                  </svg>
                  <p className="text-sm" style={{ color: '#333' }}>
                    {sessions.length > 0 ? 'Select a session or start a new thread' : 'Send a message to begin'}
                  </p>
                </div>
              ) : (
                messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)
              )}
            </div>

            <InputBar
              onSend={handleSend}
              isStreaming={isStreaming}
              models={models}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
            />
          </div>

          {/* Drag handle */}
          {artifactOpen && (
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: '8px',
                background: '#111',
                borderLeft: '1px solid #1E1E1E',
                borderRight: '1px solid #1E1E1E',
                cursor: 'col-resize',
                position: 'relative',
              }}
              onMouseDown={handleDragStart}
            >
              <div style={{ width: '4px', height: '32px', background: '#2A2A2A', borderRadius: '4px', position: 'relative' }}>
                <GripVertical
                  size={10}
                  style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#444', pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}

          {/* Artifact pane */}
          {artifactOpen && (
            <div className="flex-1 overflow-hidden min-w-0">
              <ArtifactPane message={hasArtifact ? lastAssistant : null} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
