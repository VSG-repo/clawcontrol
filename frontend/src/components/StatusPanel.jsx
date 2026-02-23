import { useWagzStore } from '@/store/useWagzStore'
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Hash, RotateCcw } from 'lucide-react'

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTs(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch { return ts }
}

const STATUS_CONFIG = {
  online: { color: '#E8472A', icon: CheckCircle, label: 'Online' },
  offline: { color: '#E05252', icon: XCircle, label: 'Offline' },
  restarting: { color: '#E0A020', icon: RefreshCw, label: 'Restarting' },
  unknown: { color: '#666666', icon: AlertCircle, label: 'Unknown' },
}

export default function StatusPanel() {
  const {
    gatewayStatus,
    gatewayUptime,
    gatewayRestartCount,
    gatewayLastRestart,
    gatewayConfigHash,
    wsConnected,
  } = useWagzStore()

  const cfg = STATUS_CONFIG[gatewayStatus] ?? STATUS_CONFIG.unknown
  const Icon = cfg.icon

  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }} className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Gateway Status</h2>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: wsConnected ? '#E8472A' : '#444',
              boxShadow: wsConnected ? '0 0 6px #E8472A80' : 'none',
            }}
          />
          <span className="text-xs" style={{ color: '#666' }}>
            {wsConnected ? 'Live' : 'Polling'}
          </span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full"
          style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}40` }}
        >
          <Icon size={18} color={cfg.color} />
        </div>
        <div>
          <div className="text-lg font-bold text-white">{cfg.label}</div>
          <div className="text-xs" style={{ color: '#666' }}>OpenClaw · port 18789</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Uptime</span>
          </div>
          <div className="text-sm font-semibold text-white">{formatUptime(gatewayUptime)}</div>
        </div>

        <div className="p-3 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Restarts</span>
          </div>
          <div className="text-sm font-semibold" style={{ color: gatewayRestartCount > 0 ? '#E0A020' : '#FFFFFF' }}>
            {gatewayRestartCount ?? '—'}
          </div>
        </div>

        <div className="p-3 rounded-md col-span-2" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Last Restart</span>
          </div>
          <div className="text-sm font-semibold text-white">{formatTs(gatewayLastRestart)}</div>
        </div>

        <div className="p-3 rounded-md col-span-2" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Hash size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Config Hash</span>
          </div>
          <div className="text-sm font-mono" style={{ color: '#E8472A', wordBreak: 'break-all' }}>
            {gatewayConfigHash ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
