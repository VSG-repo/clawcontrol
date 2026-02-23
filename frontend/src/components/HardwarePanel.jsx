import { useWagzStore } from '@/store/useWagzStore'
import { Thermometer, HardDrive, Wifi, AlertTriangle } from 'lucide-react'

function ProgressBar({ value, label, sublabel, color, warn = false }) {
  const pct = Math.min(Math.max(value || 0, 0), 100)
  const barColor = warn ? '#E0A020' : (pct > 85 ? '#E05252' : pct > 65 ? '#E0A020' : color)
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: '#999' }}>{label}</span>
        <div className="flex items-center gap-1.5">
          {warn && <AlertTriangle size={10} color="#E0A020" />}
          <span className="text-xs font-medium" style={{ color: barColor }}>{sublabel}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: '#222' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

function TempGauge({ temp, throttled }) {
  const pct = Math.min((temp / 100) * 100, 100)
  const color = throttled ? '#E05252' : temp > 80 ? '#E0A020' : temp > 65 ? '#E0A020' : '#E8472A'
  return (
    <div className="p-3 rounded-md flex items-center gap-3" style={{ background: '#111', border: '1px solid #222' }}>
      <Thermometer size={16} color={color} />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-xs" style={{ color: '#666' }}>CPU Temp</span>
          <div className="flex items-center gap-1">
            {throttled && <span className="text-xs px-1 rounded" style={{ background: '#E0525220', color: '#E05252' }}>THROTTLE</span>}
            <span className="text-xs font-semibold" style={{ color }}>{temp ? `${temp.toFixed(1)}°C` : '—'}</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: '#222' }}>
          <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}

export default function HardwarePanel() {
  const { hardware } = useWagzStore()

  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }} className="p-4">
      <h2 className="text-sm font-semibold text-white mb-4">Hardware</h2>

      <div className="space-y-3">
        {/* CPU */}
        <ProgressBar
          value={hardware.cpu_percent}
          label="CPU"
          sublabel={`${hardware.cpu_percent?.toFixed(1) ?? 0}%`}
          color="#E8472A"
        />

        {/* CPU Temp */}
        <TempGauge temp={hardware.cpu_temp} throttled={hardware.cpu_throttled} />

        {/* RAM */}
        <ProgressBar
          value={hardware.ram_percent}
          label="RAM"
          sublabel={`${hardware.ram_used_gb?.toFixed(1) ?? 0} / ${hardware.ram_total_gb?.toFixed(1) ?? 0} GB`}
          color="#E8472A"
        />

        {/* Disk */}
        <ProgressBar
          value={hardware.disk_percent}
          label="Disk"
          sublabel={`${hardware.disk_percent?.toFixed(1) ?? 0}%`}
          color="#E8472A"
          warn={hardware.disk_inode_warning}
        />

        {/* Network */}
        <div className="pt-1 border-t" style={{ borderColor: '#222' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={13} color={hardware.openrouter_reachable ? '#E8472A' : '#E05252'} />
              <span className="text-xs" style={{ color: '#666' }}>Network</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span style={{ color: '#999' }}>
                ↑ {hardware.net_outbound_mbps?.toFixed(2) ?? '0.00'} Mbps
              </span>
              {hardware.net_packet_loss > 0 && (
                <span style={{ color: '#E0A020' }}>
                  {hardware.net_packet_loss?.toFixed(1)}% loss
                </span>
              )}
              <span style={{ color: hardware.openrouter_reachable ? '#E8472A' : '#E05252' }}>
                OpenRouter {hardware.openrouter_reachable ? '✓' : '✗'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
