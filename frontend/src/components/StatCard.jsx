import { ResponsiveContainer, AreaChart, Area } from 'recharts'

/**
 * Perplexity-style stat card:
 * Large number top-left, sparkline bottom-right
 */
export default function StatCard({
  title,
  value,
  sub,
  trend,       // 'up' | 'down' | 'neutral'
  sparkData,   // array of numbers for sparkline
  badge,       // { label, color }
  className = '',
}) {
  const trendColor = trend === 'up' ? '#E05252' : trend === 'down' ? '#E8472A' : '#999999'
  const sparkColor = trend === 'up' ? '#E05252' : '#E8472A'

  const chartData = sparkData ? sparkData.map((v, i) => ({ v, i })) : []

  return (
    <div
      className={`relative overflow-hidden p-4 ${className}`}
      style={{
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
        borderRadius: '8px',
        minHeight: '100px',
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#666666' }}>
          {title}
        </span>
        {badge && (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: `${badge.color}20`, color: badge.color, border: `1px solid ${badge.color}40` }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Main value */}
      <div className="font-bold text-white" style={{ fontSize: '1.6rem', lineHeight: 1.1, marginBottom: '2px' }}>
        {value ?? <span style={{ color: '#444' }}>—</span>}
      </div>

      {/* Sub */}
      {sub && (
        <div className="text-xs" style={{ color: trendColor }}>
          {sub}
        </div>
      )}

      {/* Sparkline */}
      {chartData.length > 1 && (
        <div className="absolute bottom-0 right-0 w-24 h-12 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparkColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                fill={`url(#spark-${title})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
