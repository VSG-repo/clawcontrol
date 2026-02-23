import { useState, useEffect, useRef } from 'react'
import { Bell, X, CheckCheck, AlertCircle, AlertTriangle, Info, Settings, ChevronDown } from 'lucide-react'
import { useWagzStore } from '@/store/useWagzStore'

const LEVEL_CONFIG = {
  error: { icon: AlertCircle, color: '#E05252', bg: '#E0525215', border: '#E0525240' },
  warn:  { icon: AlertTriangle, color: '#E0A020', bg: '#E0A02015', border: '#E0A02040' },
  info:  { icon: Info, color: '#999999', bg: '#99999915', border: '#99999940' },
}

function NotifItem({ n, onDismiss }) {
  const cfg = LEVEL_CONFIG[n.level] ?? LEVEL_CONFIG.info
  const Icon = cfg.icon
  const ts = new Date(n.ts)
  const ago = formatAgo(ts)

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon size={14} color={cfg.color} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white">{n.title}</div>
        <div className="text-xs mt-0.5" style={{ color: '#999' }}>{n.message}</div>
        <div className="text-xs mt-1" style={{ color: '#555' }}>{ago}</div>
      </div>
      <button
        onClick={() => onDismiss(n.id)}
        className="flex-shrink-0 mt-0.5 opacity-40 hover:opacity-100 transition-opacity"
      >
        <X size={12} color="#999" />
      </button>
    </div>
  )
}

function formatAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function SettingsPanel({ token, onClose }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/notifications/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSettings).catch(() => {})
  }, [token])

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
    } finally {
      setSaving(false)
      onClose()
    }
  }

  if (!settings) return <div className="p-4 text-xs" style={{ color: '#666' }}>Loading…</div>

  const field = (label, key, step = 0.5, unit = '') => (
    <div className="mb-3">
      <label className="block text-xs mb-1" style={{ color: '#666' }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={settings[key] ?? ''}
          onChange={e => setSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
          style={{
            background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: '6px',
            color: '#fff', padding: '5px 8px', width: '90px', fontSize: '12px', outline: 'none',
          }}
        />
        {unit && <span className="text-xs" style={{ color: '#666' }}>{unit}</span>}
      </div>
    </div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-white">Alert Thresholds</span>
        <button onClick={onClose}><X size={13} color="#666" /></button>
      </div>
      {field('Credit Floor', 'credit_floor', 0.5, '$')}
      {field('24h Burn Ceiling', 'burn_ceiling_24h', 1, '$')}
      {field('CPU Temp Threshold', 'cpu_temp_threshold', 1, '°C')}
      {field('Probe Failure Count', 'probe_failures', 1, 'consecutive')}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-1.5 rounded text-xs font-semibold mt-1"
        style={{ background: '#E8472A', color: '#fff', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

export default function NotificationPanel({ collapsed = false }) {
  const { notificationCount, authToken } = useWagzStore()
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notifications, setNotifications] = useState([])
  const panelRef = useRef(null)

  // Fetch notifications when panel opens
  useEffect(() => {
    if (!open || !authToken) return
    const load = () => {
      fetch('/api/notifications', { headers: { Authorization: `Bearer ${authToken}` } })
        .then(r => r.json())
        .then(d => setNotifications(d.notifications || []))
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [open, authToken])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const dismiss = async (id) => {
    await fetch(`/api/notifications/dismiss/${id}`, {
      method: 'POST', headers: { Authorization: `Bearer ${authToken}` },
    })
    setNotifications(ns => ns.filter(n => n.id !== id))
  }

  const dismissAll = async () => {
    await fetch('/api/notifications/dismiss-all', {
      method: 'POST', headers: { Authorization: `Bearer ${authToken}` },
    })
    setNotifications([])
  }

  const hasError = notifications.some(n => n.level === 'error')
  const bellColor = notificationCount === 0 ? '#444' : hasError ? '#E05252' : '#E0A020'

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); setShowSettings(false) }}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md w-full"
        style={{ color: '#666666', justifyContent: collapsed ? 'center' : 'flex-start' }}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = '#666666'}
        title="Alerts"
      >
        <div className="relative flex-shrink-0">
          <Bell size={16} color={bellColor} />
          {notificationCount > 0 && (
            <span
              className="absolute -top-1 -right-1 text-white rounded-full flex items-center justify-center font-bold"
              style={{
                background: hasError ? '#E05252' : '#E0A020',
                fontSize: '8px',
                minWidth: '13px',
                height: '13px',
                padding: '0 3px',
              }}
            >
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </div>
        {!collapsed && <span className="text-sm">Alerts</span>}
        {open && !collapsed && <ChevronDown size={12} className="ml-auto" />}
      </button>

      {open && (
        <div
          className="absolute left-full ml-2 bottom-0 z-50 w-80"
          style={{
            background: '#1A1A1A',
            border: '1px solid #2A2A2A',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            maxHeight: '420px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {showSettings ? (
            <SettingsPanel token={authToken} onClose={() => setShowSettings(false)} />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: '#2A2A2A' }}>
                <span className="text-xs font-semibold text-white">
                  Alerts {notificationCount > 0 ? `(${notificationCount})` : ''}
                </span>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button onClick={dismissAll} title="Dismiss all" className="opacity-60 hover:opacity-100">
                      <CheckCheck size={13} color="#999" />
                    </button>
                  )}
                  <button onClick={() => setShowSettings(true)} title="Threshold settings" className="opacity-60 hover:opacity-100">
                    <Settings size={13} color="#999" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto p-2 space-y-2 flex-1">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs" style={{ color: '#444' }}>
                    No active alerts
                  </div>
                ) : (
                  notifications.map(n => (
                    <NotifItem key={n.id} n={n} onDismiss={dismiss} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
