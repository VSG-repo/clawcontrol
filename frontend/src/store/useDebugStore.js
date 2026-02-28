/**
 * useDebugStore — global debug event log.
 * Max 200 entries; newest prepended, displayed reversed (oldest-first).
 */
import { create } from 'zustand'

const MAX_ENTRIES = 200

function nowTs() {
  const d = new Date()
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export const useDebugStore = create((set) => ({
  entries: [],
  open: false,

  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  clear: () => set({ entries: [] }),

  /** level: 'success' | 'warn' | 'error' | 'info'
   *  category: 'fetch' | 'sse' | 'ws' | 'attach'  */
  addEntry: (level, category, message, detail) =>
    set((s) => {
      const entry = {
        id: crypto.randomUUID(),
        ts: nowTs(),
        level,
        category,
        message,
        detail: detail ?? null,
      }
      const entries = [entry, ...s.entries].slice(0, MAX_ENTRIES)
      return { entries }
    }),
}))
