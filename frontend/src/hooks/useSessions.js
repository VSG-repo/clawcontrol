/**
 * useSessions — chat session history stored in localStorage.
 *
 * Each session:
 *   { id, title, ts, model, model_id, pinned, messages[] }
 *
 * - Max 20 sessions: pinned sessions are preserved, oldest unpinned are trimmed.
 * - Messages capped at 60 per session to limit localStorage size.
 * - Sorted: pinned first (newest-first within pinned), then unpinned newest-first.
 */
import { useState, useCallback, useMemo } from 'react'

const STORAGE_KEY = 'clawcontrol_sessions'
const MAX_SESSIONS = 20
const MAX_MESSAGES_PER_SESSION = 60

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Storage full — trim and retry
    const trimmed = sessions.slice(0, 10)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  }
}

function trim(sessions) {
  const pinned = sessions.filter((s) => s.pinned)
  const unpinned = sessions.filter((s) => !s.pinned)
  const maxUnpinned = Math.max(0, MAX_SESSIONS - pinned.length)
  return [...pinned, ...unpinned.slice(0, maxUnpinned)]
}

function makeTitle(text) {
  const t = text.trim().replace(/\n+/g, ' ')
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

export function useSessions() {
  const [sessions, setSessions] = useState(load)
  const [activeId, setActiveId] = useState(null)

  const commit = useCallback((next) => {
    const trimmed = trim(next)
    setSessions(trimmed)
    save(trimmed)
  }, [])

  /** Sorted view: pinned newest-first, then unpinned newest-first. */
  const sorted = useMemo(() => {
    const byTs = (a, b) => b.ts.localeCompare(a.ts)
    const pinned = sessions.filter((s) => s.pinned).sort(byTs)
    const unpinned = sessions.filter((s) => !s.pinned).sort(byTs)
    return [...pinned, ...unpinned]
  }, [sessions])

  /**
   * Create a new session entry. Call after the first message is sent.
   * Safe to call multiple times with the same id — subsequent calls are no-ops.
   */
  const createSession = useCallback(
    (id, firstMessage) => {
      setSessions((prev) => {
        if (prev.find((s) => s.id === id)) return prev // already exists
        const next = [
          {
            id,
            title: makeTitle(firstMessage),
            ts: new Date().toISOString(),
            model: null,
            model_id: null,
            pinned: false,
            messages: [],
          },
          ...prev,
        ]
        const trimmed = trim(next)
        save(trimmed)
        return trimmed
      })
      setActiveId(id)
    },
    []
  )

  /**
   * Update an existing session (messages, model info, timestamp).
   * Called after each completed response.
   */
  const updateSession = useCallback((id, patch) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id !== id) return s
        const messages = patch.messages
          ? patch.messages.slice(-MAX_MESSAGES_PER_SESSION)
          : s.messages
        return { ...s, ...patch, messages, ts: patch.ts ?? s.ts }
      })
      save(next)
      return next
    })
  }, [])

  const togglePin = useCallback((id) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned } : s
      )
      save(next)
      return next
    })
  }, [])

  const deleteSession = useCallback((id) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      save(next)
      return next
    })
    setActiveId((cur) => (cur === id ? null : cur))
  }, [])

  return {
    sessions: sorted,
    activeId,
    setActiveId,
    createSession,
    updateSession,
    togglePin,
    deleteSession,
  }
}
