import { useEffect } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import StatusPanel from '@/components/StatusPanel'
import HealthProbe from '@/components/HealthProbe'
import ModelPanel from '@/components/ModelPanel'
import HardwarePanel from '@/components/HardwarePanel'
import CreditPanel from '@/components/CreditPanel'
import StatCard from '@/components/StatCard'

export default function Dashboard() {
  useWebSocket()

  const { hardware, credits, wsConnected, wsRetryCount } = useWagzStore()

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">System Status</h1>
          <p className="text-xs mt-0.5" style={{ color: '#666' }}>
            Phase 1 — Health Monitoring
          </p>
        </div>
        {!wsConnected && wsRetryCount > 0 && (
          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded"
            style={{ background: '#E0A02015', border: '1px solid #E0A02040', color: '#E0A020' }}
          >
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#E0A020' }} />
            Reconnecting (attempt {wsRetryCount})
          </div>
        )}
      </div>

      {/* Top stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard
          title="Credit Balance"
          value={credits.balance != null ? `$${Number(credits.balance).toFixed(2)}` : null}
          sub={credits.runway_days != null ? `${credits.runway_days.toFixed(1)}d runway` : null}
          trend={credits.runway_days < 7 ? 'up' : 'down'}
          sparkData={credits.burn_history_24h}
        />
        <StatCard
          title="CPU"
          value={hardware.cpu_percent != null ? `${hardware.cpu_percent.toFixed(0)}%` : null}
          sub={hardware.cpu_temp ? `${hardware.cpu_temp.toFixed(1)}°C` : null}
          trend={hardware.cpu_percent > 80 ? 'up' : 'neutral'}
          sparkData={[]}
          badge={hardware.cpu_throttled ? { label: 'THROTTLE', color: '#E05252' } : null}
        />
        <StatCard
          title="RAM"
          value={hardware.ram_percent != null ? `${hardware.ram_percent.toFixed(0)}%` : null}
          sub={hardware.ram_used_gb ? `${hardware.ram_used_gb.toFixed(1)}/${hardware.ram_total_gb?.toFixed(0)}GB` : null}
          trend={hardware.ram_percent > 85 ? 'up' : 'neutral'}
        />
        <StatCard
          title="Burn Rate 24h"
          value={credits.burn_24h != null ? `$${Number(credits.burn_24h).toFixed(4)}` : null}
          sub={credits.burn_1h != null ? `$${Number(credits.burn_1h).toFixed(4)} last 1h` : null}
          trend="neutral"
          sparkData={credits.burn_history_24h}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Row 1 */}
        <StatusPanel />
        <HealthProbe />
        <ModelPanel />

        {/* Row 2 */}
        <HardwarePanel />
        <div className="xl:col-span-2">
          <CreditPanel />
        </div>
      </div>
    </div>
  )
}
