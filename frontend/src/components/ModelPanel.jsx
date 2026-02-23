import { useWagzStore } from '@/store/useWagzStore'
import { Cpu, CheckCircle, XCircle, AlertCircle, Star } from 'lucide-react'

const TIER_COLORS = {
  T1: '#E8472A',
  T2: '#7C6FCD',
  T3: '#E0A020',
  T4: '#E05252',
}

function roleLabel(role) {
  if (!role) return ''
  if (role === 'primary') return 'Primary'
  if (role.startsWith('fallback-')) return `Fallback ${role.split('-')[1]}`
  return role
}

function GaugeBar({ value, max = 2000, color = '#E8472A', label }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ color: '#999' }}>{value != null ? `${value}ms` : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: '#222' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

function AuthIcon({ status }) {
  if (status === 'connected')   return <CheckCircle size={12} color="#E8472A" />
  if (status === 'missing_key') return <XCircle size={12} color="#E05252" />
  if (status === 'rate_limited') return <AlertCircle size={12} color="#E0A020" />
  return <div className="w-3 h-3 rounded-full" style={{ background: '#333' }} />
}

export default function ModelPanel() {
  const { activeModel, modelTiers } = useWagzStore()

  const tierColor = (tier) => TIER_COLORS[tier] ?? '#666'

  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }} className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Cpu size={14} color="#E8472A" />
        <h2 className="text-sm font-semibold text-white">Active Model</h2>
      </div>

      {/* Active / primary model */}
      {activeModel?.name ? (
        <div className="mb-4 p-3 rounded-md" style={{ background: '#111', border: '1px solid #E8472A30' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {activeModel.tier && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${tierColor(activeModel.tier)}20`, color: tierColor(activeModel.tier) }}
                >
                  {activeModel.tier}
                </span>
              )}
              <span className="text-xs flex items-center gap-1" style={{ color: '#E8472A' }}>
                <Star size={10} fill="#E8472A" /> Primary
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: '#666' }}>
              <span>Queue: <span className="text-white font-medium">{activeModel.queue_depth ?? 0}</span></span>
              <span>TPS: <span className="text-white font-medium">{activeModel.tps ?? '—'}</span></span>
            </div>
          </div>
          <div className="font-semibold text-white mb-0.5" style={{ fontSize: '0.9rem' }}>
            {activeModel.name}
          </div>
          {activeModel.model_id && (
            <div className="text-xs font-mono mb-3 truncate" style={{ color: '#555' }} title={activeModel.model_id}>
              {activeModel.model_id}
            </div>
          )}
          <div className="space-y-2">
            <GaugeBar value={activeModel.latency_p50} label="p50 latency" max={3000} color="#E8472A" />
            <GaugeBar value={activeModel.latency_p95} label="p95 latency" max={5000} color="#E0A020" />
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-md text-center text-xs" style={{ background: '#111', border: '1px solid #222', color: '#444' }}>
          No active model data
        </div>
      )}

      {/* Full model stack */}
      {modelTiers.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: '#444' }}>Model Stack</div>
          <div className="space-y-1">
            {modelTiers.map((m) => (
              <div
                key={m.model_id ?? m.name}
                className="flex items-center justify-between px-2.5 py-2 rounded-md"
                style={{
                  background: m.is_primary ? '#E8472A08' : '#111',
                  border: `1px solid ${m.is_primary ? '#E8472A25' : '#1E1E1E'}`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Tier badge */}
                  {m.tier && (
                    <span
                      className="text-xs font-bold flex-shrink-0"
                      style={{ color: tierColor(m.tier), minWidth: '20px' }}
                    >
                      {m.tier}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs text-white truncate" title={m.model_id}>{m.name}</div>
                    <div className="text-xs" style={{ color: '#555' }}>{roleLabel(m.role)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <AuthIcon status={m.auth_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
