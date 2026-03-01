import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { useDebugStore } from './store/useDebugStore.js'
import { useWagzStore } from './store/useWagzStore.js'
import { API_BASE } from './config.js'

// ── Global fetch interceptor ────────────────────────────────────────────────
// Instruments /api/ calls: injects CSRF header on mutations, handles 401s.
const _fetch = window.fetch
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input))
  const isInstrumented = url.includes(`${API_BASE}/`) || url.includes('openrouter')
  if (!isInstrumented) return _fetch(input, init)

  const method = (init?.method ?? 'GET').toUpperCase()

  // Inject X-Requested-With on all mutating API calls (CSRF protection)
  if (method !== 'GET' && method !== 'HEAD') {
    init = { ...init, headers: { ...(init?.headers ?? {}), 'X-Requested-With': 'XMLHttpRequest' } }
  }

  const path = url.startsWith('http') ? (() => { try { return new URL(url).pathname } catch { return url } })() : url
  const t0  = performance.now()
  const dbg = useDebugStore.getState()

  try {
    const resp = await _fetch(input, init)
    const ms     = Math.round(performance.now() - t0)
    const isSSE  = resp.headers?.get('content-type')?.includes('text/event-stream')
    const level  = resp.ok ? 'success' : 'warn'
    dbg.addEntry(level, 'fetch', `${method} ${path} → ${resp.status} (${ms}ms)${isSSE ? ' [SSE]' : ''}`)

    // 401 → clear auth and let App re-trigger auto-login or show login page
    if (resp.status === 401) {
      localStorage.removeItem('wagz_token')
      useWagzStore.getState().clearAuth()
    }

    return resp
  } catch (err) {
    const ms = Math.round(performance.now() - t0)
    dbg.addEntry('error', 'fetch', `${method} ${path} failed (${ms}ms)`, err.message)
    throw err
  }
}
// ────────────────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
