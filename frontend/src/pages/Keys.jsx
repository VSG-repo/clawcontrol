import { useState, useCallback, useEffect } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  Key, Plus, RotateCcw, Shield, ShieldCheck,
  Trash2, RefreshCw, AlertTriangle, Check, X,
} from 'lucide-react'

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  valid:          { color: '#4CAF50', label: 'Valid' },
  rate_limited:   { color: '#E0A020', label: 'Rate limited' },
  invalid:        { color: '#E05252', label: 'Invalid' },
  invalid_format: { color: '#E05252', label: 'Bad format' },
  unknown:        { color: '#555555', label: 'Unknown' },
}

function StatusDot({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.unknown
  return (
    <span className="inline-flex items-center gap-1.5 text-xs flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      <span style={{ color: cfg.color }}>{cfg.label}</span>
    </span>
  )
}

function Flash({ msg, type }) {
  if (!msg) return null
  const isErr = type === 'error'
  return (
    <div className="mb-4 text-xs px-3 py-2 rounded"
      style={{
        background: isErr ? '#E0525215' : '#4CAF5015',
        border: `1px solid ${isErr ? '#E0525240' : '#4CAF5040'}`,
        color: isErr ? '#E05252' : '#4CAF50',
      }}>
      {msg}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Keys() {
  const { authToken } = useWagzStore()

  const [keys, setKeys]           = useState([])
  const [providers, setProviders] = useState([])
  const [cb, setCb]               = useState(null)
  const [loading, setLoading]     = useState(false)

  // Flash messages
  const [flash, setFlash] = useState({ msg: '', type: 'success' })

  // Add Key form
  const [showAdd, setShowAdd]     = useState(false)
  const [addProvider, setAddProvider] = useState('')
  const [addKey, setAddKey]       = useState('')
  const [addLabel, setAddLabel]   = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Per-key inline UI
  const [rotating, setRotating]       = useState(null) // provider id
  const [rotateKey, setRotateKey]     = useState('')
  const [rotateLoading, setRotateLoading] = useState(false)
  const [deleting, setDeleting]       = useState(null) // provider id
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [checking, setChecking]       = useState(null) // provider id

  // Circuit breaker form
  const [cbEnabled, setCbEnabled]   = useState(false)
  const [cbLimit, setCbLimit]       = useState('10.00')
  const [cbHardStop, setCbHardStop] = useState(false)
  const [cbSaving, setCbSaving]     = useState(false)
  const [cbError, setCbError]       = useState('')

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash({ msg: '', type: 'success' }), 3000)
  }

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const r = await fetch('/api/keys', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) throw new Error('Failed to load keys')
      const data = await r.json()
      setKeys(data.keys || [])
      setProviders(data.providers || [])
      if (data.circuit_breaker) {
        const c = data.circuit_breaker
        setCb(c)
        setCbEnabled(Boolean(c.enabled))
        setCbLimit(String(c.daily_limit_usd ?? 10))
        setCbHardStop(Boolean(c.hard_stop))
      }
    } catch (e) {
      showFlash(e.message || 'Failed to load keys', 'error')
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!addProvider || !addKey.trim()) return
    setAddLoading(true)
    try {
      const r = await fetch('/api/keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: addProvider, key: addKey.trim(), label: addLabel.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Failed to add key')
      showFlash(`Key added — status: ${data.status}`)
      setShowAdd(false)
      setAddProvider('')
      setAddKey('')
      setAddLabel('')
      await load()
    } catch (e) {
      showFlash(e.message, 'error')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRotate = async (provider) => {
    if (!rotateKey.trim()) return
    setRotateLoading(true)
    try {
      const r = await fetch('/api/keys/rotate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: rotateKey.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Failed to rotate key')
      showFlash(`Key rotated — status: ${data.status}`)
      setRotating(null)
      setRotateKey('')
      await load()
    } catch (e) {
      showFlash(e.message, 'error')
    } finally {
      setRotateLoading(false)
    }
  }

  const handleDelete = async (provider) => {
    setDeleteLoading(true)
    try {
      const r = await fetch(`/api/keys/${provider}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Failed to delete key')
      showFlash(`${provider} key removed`)
      setDeleting(null)
      await load()
    } catch (e) {
      showFlash(e.message, 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCheck = async (provider) => {
    setChecking(provider)
    try {
      const r = await fetch(`/api/keys/check/${provider}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Check failed')
      showFlash(`${provider}: ${data.status}`)
      await load()
    } catch (e) {
      showFlash(e.message, 'error')
    } finally {
      setChecking(null)
    }
  }

  const handleSaveCb = async () => {
    const limit = parseFloat(cbLimit)
    if (isNaN(limit) || limit < 0.5 || limit > 500) {
      setCbError('Daily limit must be $0.50–$500')
      return
    }
    setCbSaving(true)
    setCbError('')
    try {
      const r = await fetch('/api/circuit-breaker', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: cbEnabled, daily_limit_usd: limit, hard_stop: cbHardStop }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Failed to save')
      showFlash('Circuit breaker saved')
      setCb(data.circuit_breaker)
    } catch (e) {
      setCbError(e.message || 'Failed to save circuit breaker')
    } finally {
      setCbSaving(false)
    }
  }

  const configuredSet = new Set(keys.map(k => k.provider))
  const spendPct = cb
    ? Math.min(100, (cb.spend_today_usd / (cb.daily_limit_usd || 1)) * 100)
    : 0
  const spendColor = spendPct > 80 ? '#E05252' : spendPct > 50 ? '#E0A020' : '#4CAF50'

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Credentials & Keys</h1>
          <p className="text-sm mt-0.5" style={{ color: '#999' }}>
            API keys, health checks, and cost circuit breaker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
            style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}>
            <Plus size={12} />
            Add Key
          </button>
        </div>
      </div>

      <Flash msg={flash.msg} type={flash.type} />

      <div className="space-y-4">

        {/* ── Add Key form ── */}
        {showAdd && (
          <section className="p-4 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #E8472A50' }}>
            <div className="flex items-center gap-2 mb-3">
              <Key size={13} color="#E8472A" />
              <h2 className="text-sm font-semibold text-white">Add API Key</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <select value={addProvider} onChange={e => setAddProvider(e.target.value)}
                className="text-sm px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: addProvider ? '#fff' : '#666' }}>
                <option value="">Select provider…</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id} disabled={configuredSet.has(p.id)}>
                    {p.name}{configuredSet.has(p.id) ? ' (configured)' : ''}
                  </option>
                ))}
              </select>
              <input type="password" placeholder="API key" value={addKey} onChange={e => setAddKey(e.target.value)}
                className="text-sm px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }} />
              <input type="text" placeholder="Label (optional)" value={addLabel} onChange={e => setAddLabel(e.target.value)}
                className="text-sm px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!addProvider || !addKey.trim() || addLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
                style={{
                  background: '#E8472A', color: '#fff', border: '1px solid #E8472A',
                  opacity: (!addProvider || !addKey.trim()) ? 0.5 : 1,
                }}>
                <Check size={12} className={addLoading ? 'animate-pulse' : ''} />
                {addLoading ? 'Adding…' : 'Add Key'}
              </button>
              <button onClick={() => { setShowAdd(false); setAddProvider(''); setAddKey(''); setAddLabel('') }}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: '#666' }}>
                <X size={12} />
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* ── API Keys list ── */}
        <section className="p-4 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <div className="flex items-center gap-2 mb-3">
            <Key size={13} color="#E8472A" />
            <h2 className="text-sm font-semibold text-white">API Keys</h2>
            <span className="text-xs ml-auto" style={{ color: '#555' }}>
              {keys.length} configured
            </span>
          </div>

          {keys.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-sm" style={{ color: '#444' }}>
              No keys configured — click Add Key to get started
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.provider} className="rounded-md overflow-hidden"
                  style={{ background: '#111', border: '1px solid #222' }}>

                  {/* Key row */}
                  <div className="flex items-center gap-3 px-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{k.name}</span>
                        {k.label && (
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: '#E8472A15', color: '#E8472A', border: '1px solid #E8472A30' }}>
                            {k.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs font-mono" style={{ color: '#555' }}>{k.masked_key}</span>
                        {k.added_at && (
                          <span className="text-xs" style={{ color: '#444' }}>
                            Added {new Date(k.added_at).toLocaleDateString()}
                          </span>
                        )}
                        {k.rotated_from && (
                          <span className="text-xs" style={{ color: '#444' }}>
                            Rotated from {k.rotated_from}
                          </span>
                        )}
                      </div>
                    </div>

                    <StatusDot status={k.status} />

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleCheck(k.provider)} disabled={checking === k.provider}
                        title="Re-check health"
                        className="p-1.5 rounded"
                        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
                        <RefreshCw size={12} color="#666" className={checking === k.provider ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => { setRotating(r => r === k.provider ? null : k.provider); setRotateKey(''); setDeleting(null) }}
                        title="Rotate key"
                        className="p-1.5 rounded"
                        style={{ background: rotating === k.provider ? '#E8472A20' : '#1A1A1A', border: `1px solid ${rotating === k.provider ? '#E8472A40' : '#2A2A2A'}` }}>
                        <RotateCcw size={12} color={rotating === k.provider ? '#E8472A' : '#666'} />
                      </button>
                      <button
                        onClick={() => { setDeleting(d => d === k.provider ? null : k.provider); setRotating(null) }}
                        title="Delete key"
                        className="p-1.5 rounded"
                        style={{ background: deleting === k.provider ? '#E0525220' : '#1A1A1A', border: `1px solid ${deleting === k.provider ? '#E0525240' : '#2A2A2A'}` }}>
                        <Trash2 size={12} color="#E05252" />
                      </button>
                    </div>
                  </div>

                  {/* Rotate inline form */}
                  {rotating === k.provider && (
                    <div className="flex items-center gap-2 px-3 py-2.5 border-t"
                      style={{ borderColor: '#1E1E1E', background: '#0D0D0D' }}>
                      <input type="password" placeholder="New API key" value={rotateKey}
                        onChange={e => setRotateKey(e.target.value)}
                        className="flex-1 text-sm px-3 py-1.5 rounded-md"
                        style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }} />
                      <button onClick={() => handleRotate(k.provider)}
                        disabled={!rotateKey.trim() || rotateLoading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                        style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A', opacity: !rotateKey.trim() ? 0.5 : 1 }}>
                        <RotateCcw size={11} className={rotateLoading ? 'animate-spin' : ''} />
                        {rotateLoading ? 'Rotating…' : 'Rotate'}
                      </button>
                      <button onClick={() => { setRotating(null); setRotateKey('') }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}>
                        <X size={11} />
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Delete confirm */}
                  {deleting === k.provider && (
                    <div className="flex items-center gap-3 px-3 py-2.5 border-t"
                      style={{ borderColor: '#E0525220', background: '#E0525208' }}>
                      <span className="text-xs flex-1" style={{ color: '#E05252' }}>
                        Remove {k.name} key? This cannot be undone.
                      </span>
                      <button onClick={() => handleDelete(k.provider)} disabled={deleteLoading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                        style={{ background: '#E05252', color: '#fff', border: '1px solid #E05252' }}>
                        <Trash2 size={11} />
                        {deleteLoading ? 'Deleting…' : 'Delete'}
                      </button>
                      <button onClick={() => setDeleting(null)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}>
                        <X size={11} />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Cost Circuit Breaker ── */}
        <section className="p-4 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={13} color="#E8472A" />
            <h2 className="text-sm font-semibold text-white">Cost Circuit Breaker</h2>
          </div>

          {/* Spend progress bar */}
          {cb && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span style={{ color: '#666' }}>Today's spend</span>
                <span style={{ color: spendColor }}>
                  ${(cb.spend_today_usd || 0).toFixed(2)} / ${(cb.daily_limit_usd || 10).toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#111' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${spendPct}%`, background: spendColor }} />
              </div>
            </div>
          )}

          {/* Soft mode warning */}
          {cbEnabled && !cbHardStop && (
            <div className="mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded"
              style={{ background: '#E0A02015', border: '1px solid #E0A02040', color: '#E0A020' }}>
              <AlertTriangle size={12} />
              Soft mode — alerts only, spending will not be blocked at limit
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: '#DDD' }}>
              <input type="checkbox" checked={cbEnabled} onChange={e => setCbEnabled(e.target.checked)} />
              Enable circuit breaker
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: '#666' }}>Daily limit (USD)</label>
                <div className="flex items-center">
                  <span className="text-sm px-2.5 py-2 rounded-l-md"
                    style={{ background: '#0D0D0D', border: '1px solid #2A2A2A', borderRight: 'none', color: '#555' }}>
                    $
                  </span>
                  <input type="number" min="0.50" max="500" step="0.50" value={cbLimit}
                    onChange={e => setCbLimit(e.target.value)}
                    className="flex-1 text-sm px-3 py-2 rounded-r-md"
                    style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }} />
                </div>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: '#DDD' }}>
                  <input type="checkbox" checked={cbHardStop} onChange={e => setCbHardStop(e.target.checked)} />
                  Hard stop — block spending when limit is reached
                </label>
              </div>
            </div>

            {cbError && (
              <div className="text-xs px-3 py-2 rounded"
                style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}>
                {cbError}
              </div>
            )}

            <button onClick={handleSaveCb} disabled={cbSaving}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}>
              <ShieldCheck size={12} className={cbSaving ? 'animate-pulse' : ''} />
              {cbSaving ? 'Saving…' : 'Save Circuit Breaker'}
            </button>
          </div>
        </section>

        {/* ── Provider Overview ── */}
        <section className="p-4 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <h2 className="text-sm font-semibold text-white mb-3">Provider Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {providers.map(p => {
              const key = keys.find(k => k.provider === p.id)
              const isConfigured = Boolean(key)
              const dotColor = isConfigured
                ? (STATUS_CFG[key.status]?.color ?? '#4CAF50')
                : '#333'
              return (
                <div key={p.id} className="px-3 py-2.5 rounded-md flex items-center gap-2"
                  style={{ background: '#111', border: `1px solid ${isConfigured ? '#2A2A2A' : '#1A1A1A'}` }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: dotColor }} />
                  <div className="min-w-0">
                    <div className="text-xs truncate" style={{ color: isConfigured ? '#DDD' : '#444' }}>
                      {p.name}
                    </div>
                    <div className="text-xs" style={{ color: isConfigured ? dotColor : '#333' }}>
                      {isConfigured ? (STATUS_CFG[key.status]?.label ?? 'Unknown') : 'Not configured'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

      </div>
    </div>
  )
}
