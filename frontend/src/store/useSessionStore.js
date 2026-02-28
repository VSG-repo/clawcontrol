/**
 * useSessionStore — Zustand store for chat session history.
 *
 * IMPORTANT: Do NOT use a JavaScript getter for computed fields in Zustand v5.
 * Zustand uses useSyncExternalStore internally, which requires snapshot values to
 * be referentially stable between store updates. A getter that calls sortSessions()
 * creates a new array on every selector call, violating this requirement and causing
 * "Maximum update depth exceeded". Instead, keep `sessions` as a plain sorted state
 * field, updated (and re-sorted) eagerly inside each mutation.
 *
 * Each session: { id, title, ts, model, model_id, pinned, messages[] }
 *
 * - Max 20 sessions: pinned sessions preserved, oldest unpinned trimmed.
 * - Messages capped at 60 per session.
 * - Sorted: pinned first (newest-first within pinned), then unpinned newest-first.
 */
import { create } from 'zustand'

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

/** Strip base64 image data before persisting — keeps metadata, drops payload. */
function sanitizeMessages(messages) {
  return messages.map((msg) => {
    if (!msg.attachments?.length) return msg
    return {
      ...msg,
      attachments: msg.attachments.map((att) =>
        att.type === 'image' && att.data
          ? { ...att, data: '' }
          : att
      ),
    }
  })
}

function sanitizeSessions(sessions) {
  return sessions.map((s) => ({
    ...s,
    messages: sanitizeMessages(s.messages ?? []),
  }))
}

function save(sessions) {
  const payload = sanitizeSessions(sessions)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.warn('localStorage quota exceeded, trimming sessions:', err)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.slice(0, 5)))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
}

function trimSessions(sessions) {
  const pinned = sessions.filter((s) => s.pinned)
  const unpinned = sessions.filter((s) => !s.pinned)
  const maxUnpinned = Math.max(0, MAX_SESSIONS - pinned.length)
  return [...pinned, ...unpinned.slice(0, maxUnpinned)]
}

function sortSessions(sessions) {
  const byTs = (a, b) => b.ts.localeCompare(a.ts)
  const pinned = sessions.filter((s) => s.pinned).sort(byTs)
  const unpinned = sessions.filter((s) => !s.pinned).sort(byTs)
  return [...pinned, ...unpinned]
}

function makeTitle(text) {
  const t = text.trim().replace(/\n+/g, ' ')
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

export const useSessionStore = create((set) => ({
  // sessions is always kept sorted; reference only changes on actual mutations
  sessions: sortSessions(load()),
  activeId: null,

  setActiveId: (id) => set({ activeId: id }),

  createSession: (id, firstMessage) => {
    set((state) => {
      if (state.sessions.find((s) => s.id === id)) return {}
      const raw = [
        {
          id,
          title: makeTitle(firstMessage),
          ts: new Date().toISOString(),
          model: null,
          model_id: null,
          pinned: false,
          messages: [],
        },
        ...state.sessions,
      ]
      const next = sortSessions(trimSessions(raw))
      save(next)
      return { sessions: next, activeId: id }
    })
  },

  updateSession: (id, patch) => {
    set((state) => {
      const raw = state.sessions.map((s) => {
        if (s.id !== id) return s
        const messages = patch.messages
          ? patch.messages.slice(-MAX_MESSAGES_PER_SESSION)
          : s.messages
        return { ...s, ...patch, messages, ts: patch.ts ?? s.ts }
      })
      const next = sortSessions(raw)
      save(next)
      return { sessions: next }
    })
  },

  togglePin: (id) => {
    set((state) => {
      const raw = state.sessions.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned } : s
      )
      const next = sortSessions(raw)
      save(next)
      return { sessions: next }
    })
  },

  deleteSession: (id) => {
    set((state) => {
      const next = state.sessions.filter((s) => s.id !== id)
      save(next)
      return {
        sessions: next,
        activeId: state.activeId === id ? null : state.activeId,
      }
    })
  },
}))
