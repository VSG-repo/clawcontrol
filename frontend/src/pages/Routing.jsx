import { useEffect, useMemo, useState } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { Cpu, Save, RotateCcw, Activity } from 'lucide-react'
import { API_BASE } from '@/config'

function modelLabel(modelId, models) {
  const m = models.find((x) => x.model_id === modelId)
  if (!m) return modelId
  return `${m.name} (${m.model_id})`
}

function normalizeFallbacks(ids, primaryId) {
  const seen = new Set()
  const out = []
  for (const id of ids || []) {
    if (!id || id === primaryId || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function healthColor(status) {
  if (status === 'connected') return '#E8472A'
  if (status === 'rate_limited') return '#E0A020'
  return '#E05252'
}

export default function Routing() {
  const { authToken } = useWagzStore()

  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const [primaryModelId, setPrimaryModelId] = useState('')
  const [fallbackModelIds, setFallbackModelIds] = useState([])
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideModelId, setOverrideModelId] = useState('')
  const [overrideRequests, setOverrideRequests] = useState(0)

  const [modelHealth, setModelHealth] = useState([])
  const [healthCheckedAt, setHealthCheckedAt] = useState('')

  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false)
  const [heartbeatInterval, setHeartbeatInterval] = useState(300)
  const [heartbeatSaving, setHeartbeatSaving] = useState(false)
  const [heartbeatError, setHeartbeatError] = useState('')

  const load = async () => {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${API_BASE}/routing`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) throw new Error('Failed to load routing config')
      const data = await r.json()

      const routing = data.routing || {}
      const manual = routing.manual_override || {}

      setModels(data.models || [])
      setPrimaryModelId(routing.primary_model_id || '')
      setFallbackModelIds(normalizeFallbacks(routing.fallback_model_ids || [], routing.primary_model_id || ''))
      setOverrideEnabled(Boolean(manual.enabled))
      setOverrideModelId(manual.model_id || '')
      setOverrideRequests(Number(manual.requests_remaining || 0))
    } catch (e) {
      setError(e.message || 'Unable to load routing config')
    } finally {
      setLoading(false)
    }
  }

  const loadHeartbeat = async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/heartbeat`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) return
      const data = await r.json()
      setHeartbeatEnabled(Boolean(data.enabled))
      setHeartbeatInterval(Number(data.interval_seconds) || 300)
    } catch {
      // no-op, keep defaults
    }
  }

  const loadModelHealth = async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) return
      const data = await r.json()
      setModelHealth(data.models || [])
      setHealthCheckedAt(new Date().toISOString())
    } catch {
      // no-op, keep previous health snapshot
    }
  }

  useEffect(() => {
    load()
    loadModelHealth()
    loadHeartbeat()
  }, [authToken]) // eslint-disable-line

  useEffect(() => {
    if (!authToken) return
    const id = setInterval(() => {
      loadModelHealth()
    }, 30000)
    return () => clearInterval(id)
  }, [authToken]) // eslint-disable-line

  useEffect(() => {
    setFallbackModelIds((prev) => normalizeFallbacks(prev, primaryModelId))
  }, [primaryModelId])

  const save = async () => {
    if (!authToken) return
    setSaving(true)
    setError('')
    try {
      const body = {
        primary_model_id: primaryModelId || null,
        fallback_model_ids: normalizeFallbacks(fallbackModelIds, primaryModelId),
        manual_override: {
          enabled: overrideEnabled,
          model_id: overrideModelId || null,
          requests_remaining: Number(overrideRequests) || 0,
        },
      }

      const r = await fetch(`${API_BASE}/routing`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!r.ok) throw new Error('Failed to save routing config')
      setSavedAt(new Date().toISOString())
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      await load()
    } catch (e) {
      setError(e.message || 'Unable to save routing config')
    } finally {
      setSaving(false)
    }
  }

  const saveHeartbeat = async () => {
    if (!authToken) return
    const interval = Number(heartbeatInterval)
    if (!Number.isInteger(interval) || interval < 30 || interval > 1800) {
      setHeartbeatError('Interval must be between 30 and 1800 seconds')
      return
    }

    setHeartbeatSaving(true)
    setHeartbeatError('')
    try {
      const r = await fetch(`${API_BASE}/heartbeat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: heartbeatEnabled, interval_seconds: interval }),
      })
      if (!r.ok) throw new Error('Failed to save heartbeat config')
      setSavedAt(new Date().toISOString())
    } catch (e) {
      setHeartbeatError(e.message || 'Unable to save heartbeat config')
    } finally {
      setHeartbeatSaving(false)
    }
  }

  const orderedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [models])

  const fallbackOptions = useMemo(() => {
    return orderedModels.filter((m) => m.model_id !== primaryModelId)
  }, [orderedModels, primaryModelId])

  const toggleFallback = (modelId) => {
    if (modelId === primaryModelId) return
    setFallbackModelIds((prev) => {
      const next = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
      return normalizeFallbacks(next, primaryModelId)
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Routing Controls</h1>
          <p className="text-sm mt-0.5" style={{ color: '#999' }}>
            Primary, fallback chain, and manual override
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading || saving}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
          >
            <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={save}
            disabled={loading || saving}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md transition-colors"
            style={{
              background: justSaved ? '#22C55E' : '#E8472A',
              color: '#fff',
              border: `1px solid ${justSaved ? '#22C55E' : '#E8472A'}`,
            }}
          >
            <Save size={12} className={saving ? 'animate-pulse' : ''} />
            {justSaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs px-3 py-2 rounded" style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}>
          {error}
        </div>
      )}

      {savedAt && (
        <div className="mb-4 text-xs" style={{ color: '#555' }}>
          Saved at {new Date(savedAt).toLocaleTimeString()}
        </div>
      )}

      <div className="space-y-4">

        {/* Row 1: Primary Model + Fallback Models */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="p-4 rounded-md h-full" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={13} color="#E8472A" />
              <h2 className="text-sm font-semibold text-white">Primary Model</h2>
            </div>

            <select
              value={primaryModelId}
              onChange={(e) => setPrimaryModelId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
            >
              <option value="">Select primary model</option>
              {orderedModels.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {modelLabel(m.model_id, orderedModels)}
                </option>
              ))}
            </select>
          </section>

          <section className="p-4 rounded-md h-full" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
            <h2 className="text-sm font-semibold text-white mb-3">Fallback Models</h2>
            <div className="space-y-2">
              {fallbackOptions.map((m) => {
                const checked = fallbackModelIds.includes(m.model_id)
                return (
                  <label
                    key={m.model_id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md cursor-pointer"
                    style={{ background: '#111', border: '1px solid #222' }}
                  >
                    <span className="text-xs" style={{ color: '#DDD' }}>{modelLabel(m.model_id, orderedModels)}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFallback(m.model_id)}
                    />
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        {/* Row 2: Manual Override + Heartbeat / Cron Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="p-4 rounded-md h-full" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
            <h2 className="text-sm font-semibold text-white mb-3">Manual Override</h2>

            <label className="flex items-center gap-2 mb-3 text-xs" style={{ color: '#DDD' }}>
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(e) => setOverrideEnabled(e.target.checked)}
              />
              Enable manual override
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={overrideModelId}
                onChange={(e) => setOverrideModelId(e.target.value)}
                className="text-sm px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
              >
                <option value="">Select override model</option>
                {orderedModels.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {modelLabel(m.model_id, orderedModels)}
                  </option>
                ))}
              </select>

              <div>
                <input
                  type="number"
                  min="0"
                  value={overrideRequests}
                  onChange={(e) => setOverrideRequests(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md"
                  style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                  placeholder="Requests remaining"
                />
                <p className="mt-1.5 text-xs leading-snug" style={{ color: '#666' }}>
                  Weight controls how often this model is selected. 0 = disabled, higher = more traffic routed to this model.
                </p>
              </div>
            </div>
          </section>

          <section className="p-4 rounded-md h-full" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
            <h2 className="text-sm font-semibold text-white mb-3">Heartbeat / Cron Config</h2>

            <label className="flex items-center gap-2 mb-3 text-xs" style={{ color: '#DDD' }}>
              <input
                type="checkbox"
                checked={heartbeatEnabled}
                onChange={(e) => setHeartbeatEnabled(e.target.checked)}
              />
              Heartbeat enabled
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input
                type="number"
                min="30"
                max="1800"
                value={heartbeatInterval}
                onChange={(e) => setHeartbeatInterval(e.target.value)}
                className="text-sm px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                placeholder="Interval seconds"
              />

              <button
                onClick={saveHeartbeat}
                disabled={heartbeatSaving}
                className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md"
                style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
              >
                <Save size={12} className={heartbeatSaving ? 'animate-pulse' : ''} />
                Save Heartbeat
              </button>
            </div>

            {heartbeatError && (
              <div className="text-xs px-3 py-2 rounded" style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}>
                {heartbeatError}
              </div>
            )}
          </section>
        </div>

        {/* Row 3: Model Health Indicators — full width */}
        <section className="p-4 rounded-md" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} color="#E8472A" />
            <h2 className="text-sm font-semibold text-white">Model Health Indicators</h2>
          </div>

          <div className="space-y-2">
            {modelHealth.map((m) => (
              <div
                key={m.model_id}
                className="flex items-center justify-between px-3 py-2 rounded-md"
                style={{ background: '#111', border: '1px solid #222' }}
              >
                <span className="text-xs" style={{ color: '#DDD' }}>{modelLabel(m.model_id, modelHealth)}</span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: healthColor(m.auth_status), boxShadow: `0 0 6px ${healthColor(m.auth_status)}66` }}
                  />
                  <span className="text-xs" style={{ color: '#666' }}>{m.auth_status || 'unknown'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs mt-3" style={{ color: '#555' }}>
            Last checked: {healthCheckedAt ? new Date(healthCheckedAt).toLocaleTimeString() : '—'}
          </div>
        </section>

      </div>
    </div>
  )
}
