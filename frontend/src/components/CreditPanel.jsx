import { useWagzStore } from '@/store/useWagzStore'
import { DollarSign, TrendingDown, Clock, Shield, AlertTriangle } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis } from 'recharts'

function fmt(n, decimals = 4) {
  if (n === null || n === undefined) return '—'
  return `$${Number(n).toFixed(decimals)}`
}

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: '#999' }}>
        {fmt(payload[0].value)}
      </div>
    )
  }
  return null
}

export default function CreditPanel() {
  const { credits } = useWagzStore()

  const burnHistory = credits.burn_history_24h?.map((v, i) => ({ h: `${23 - i}h`, v })) ?? []
  const runwayDays = credits.runway_days

  const runwayColor = runwayDays === null ? '#666'
    : runwayDays < 3 ? '#E05252'
    : runwayDays < 7 ? '#E0A020'
    : '#E8472A'

  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }} className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={14} color="#E8472A" />
        <h2 className="text-sm font-semibold text-white">Cost & Credits</h2>
        {credits.circuit_breaker_active && (
          <div className="flex items-center gap-1 ml-auto px-2 py-0.5 rounded text-xs" style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}>
            <Shield size={10} />
            Circuit Breaker Active
          </div>
        )}
      </div>

      {/* Balance + runway */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="text-xs mb-1" style={{ color: '#666' }}>Balance</div>
          <div className="text-xl font-bold text-white">{fmt(credits.balance, 2)}</div>
          <div className="text-xs mt-0.5" style={{ color: '#666' }}>OpenRouter</div>
        </div>
        <div className="p-3 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="text-xs mb-1" style={{ color: '#666' }}>Runway</div>
          <div className="text-xl font-bold" style={{ color: runwayColor }}>
            {runwayDays != null ? `${runwayDays.toFixed(1)}d` : '—'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#666' }}>at 24h burn</div>
        </div>
      </div>

      {/* Burn rates */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2.5 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Burn 1h</span>
          </div>
          <div className="text-sm font-semibold text-white">{fmt(credits.burn_1h)}</div>
        </div>
        <div className="p-2.5 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown size={11} color="#666" />
            <span className="text-xs" style={{ color: '#666' }}>Burn 24h</span>
          </div>
          <div className="text-sm font-semibold text-white">{fmt(credits.burn_24h)}</div>
        </div>
      </div>

      {/* 24h sparkline */}
      {burnHistory.length > 1 && (
        <div className="mb-4">
          <div className="text-xs mb-1.5" style={{ color: '#555' }}>24h burn history</div>
          <div style={{ height: '60px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burnHistory} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8472A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8472A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="h" hide />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="v" stroke="#E8472A" strokeWidth={1.5} fill="url(#burnGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Token + error breakdown */}
      <div className="border-t pt-3" style={{ borderColor: '#222' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs" style={{ color: '#666' }}>Tokens today</span>
          <span className="text-xs font-medium text-white">
            {credits.token_usage_today?.toLocaleString() ?? '—'}
          </span>
        </div>

        {/* Error codes */}
        <div className="flex gap-3">
          {Object.entries(credits.errors ?? {}).map(([code, count]) => (
            <div key={code} className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#666' }}>{code}:</span>
              <span className="text-xs font-medium" style={{ color: count > 0 ? '#E05252' : '#444' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-model cost */}
      {Object.keys(credits.cost_per_model ?? {}).length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: '#222' }}>
          <div className="text-xs mb-2" style={{ color: '#555' }}>Cost per model (today)</div>
          <div className="space-y-1">
            {Object.entries(credits.cost_per_model).map(([model, cost]) => (
              <div key={model} className="flex justify-between">
                <span className="text-xs truncate" style={{ color: '#999', maxWidth: '60%' }}>{model}</span>
                <span className="text-xs font-medium text-white">{fmt(cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
