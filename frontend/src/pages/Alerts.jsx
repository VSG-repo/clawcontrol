import { useEffect, useState, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  AlertTriangle, AlertCircle, Info, CheckCircle, RotateCcw, X,
} from 'lucide-react'
import { detectAlerts } from '@/services/alertDetector'

// ── Severity config ───────────────────────────────────────────────────────────

const SEV = {
  critical: { icon: AlertCircle, color: '#E05252', bg: '#E0525210', border: '#E0525230', label: 'Critical' },
  warning:  { icon: AlertTriangle, color: '#E0A020', bg: '#E0A02010', border: '#E0A02030', label: 'Warning'  },
  info:     { icon: Info,          color: '#6A9ACE', bg: '#6A9ACE10', border: '#6A9ACE30', label: 'Info'     },
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss }) {
  const { icon: Icon, color, bg, border } = SEV[alert.severity] || SEV.info
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-md"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <Icon size={16} color={color} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{alert.title}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: color + '20', color }}>
            {(SEV[alert.severity] || SEV.info).label}
          </span>
        </div>
        <p className="text-sm mt-0.5" style={{ color: '#AAA' }}>{alert.description}</p>
        {alert.ts && (
          <p className="text-xs mt-1" style={{ color: '#555' }}>
            {new Date(alert.ts).toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="flex-shrink-0 flex items-center justify-center rounded"
        style={{ width: '22px', height: '22px', color: '#444' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DISMISSED_KEY = 'clawcontrol_dismissed_alerts'

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) }
  catch { return new Set() }
}

function saveDismissed(set) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
}

export default function Alerts() {
  const { authToken } = useWagzStore()
  const [allAlerts, setAllAlerts] = useState([])
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [loading, setLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState(null)

  const refresh = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const alerts = await detectAlerts(authToken)
      setAllAlerts(alerts)
      setLastChecked(new Date())
    } catch {
      // keep previous state on error
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [refresh])

  const active = allAlerts.filter((a) => !dismissed.has(a.id))

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  const dismissAll = () => {
    const next = new Set(allAlerts.map((a) => a.id))
    saveDismissed(next)
    setDismissed(next)
  }

  const clearDismissed = () => {
    saveDismissed(new Set())
    setDismissed(new Set())
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: '#999' }}>System notifications and warnings</p>
        </div>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button
              onClick={dismissAll}
              className="text-sm px-3 py-1.5 rounded-md"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Dismiss all
            </button>
          )}
          {dismissed.size > 0 && (
            <button
              onClick={clearDismissed}
              className="text-sm px-3 py-1.5 rounded-md"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Show dismissed
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
          >
            <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Last checked */}
      {lastChecked && (
        <p className="text-xs mb-4" style={{ color: '#444' }}>
          Last checked: {lastChecked.toLocaleTimeString()} · auto-refreshes every 60s
        </p>
      )}

      {/* Alert list */}
      {active.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3" style={{ color: '#444' }}>
          <CheckCircle size={36} color="#4A9A4A" />
          <p className="text-base font-medium" style={{ color: '#4A9A4A' }}>All clear</p>
          <p className="text-sm" style={{ color: '#444' }}>No active alerts detected</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  )
}
