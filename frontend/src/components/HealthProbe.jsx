import { useState } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { CheckCircle, XCircle, Play, AlertTriangle } from 'lucide-react'
import { API_BASE } from '@/config'

function formatTs(ts) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

export default function HealthProbe() {
  const { lastProbe, authToken } = useWagzStore()
  const [running, setRunning] = useState(false)

  const runProbe = async () => {
    setRunning(true)
    try {
      await fetch(`${API_BASE}/probe/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    } catch (e) {
      console.error('Probe trigger failed:', e)
    } finally {
      setTimeout(() => setRunning(false), 3000)
    }
  }

  const isPass = lastProbe?.result === 'PASS'
  const isFail = lastProbe?.result === 'FAIL'
  const failures = lastProbe?.consecutive_failures ?? 0
  const alertActive = failures >= 2

  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }} className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Synthetic Health Probe</h2>
        <button
          onClick={runProbe}
          disabled={running}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all"
          style={{
            background: running ? '#3A1A10' : '#E8472A15',
            border: '1px solid #E8472A40',
            color: running ? '#E8472A80' : '#E8472A',
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          <Play size={11} />
          {running ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {alertActive && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-md mb-3 text-xs"
          style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}
        >
          <AlertTriangle size={13} />
          <span>ALERT: Probe failed {failures}x consecutive</span>
        </div>
      )}

      {/* Result */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full"
          style={{
            background: isPass ? '#E8472A15' : isFail ? '#E0525215' : '#22222280',
            border: `1px solid ${isPass ? '#E8472A40' : isFail ? '#E0525240' : '#333'}`,
          }}
        >
          {isPass ? <CheckCircle size={18} color="#E8472A" /> : isFail ? <XCircle size={18} color="#E05252" /> : <div className="w-4 h-4 rounded-full" style={{ background: '#333' }} />}
        </div>
        <div>
          <div
            className="text-lg font-bold"
            style={{ color: isPass ? '#E8472A' : isFail ? '#E05252' : '#666' }}
          >
            {lastProbe?.result ?? 'No data'}
          </div>
          <div className="text-xs" style={{ color: '#666' }}>Every 5 minutes</div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="text-xs mb-0.5" style={{ color: '#666' }}>Last Check</div>
          <div className="text-xs font-medium text-white">{formatTs(lastProbe?.timestamp)}</div>
        </div>
        <div className="p-2.5 rounded-md" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="text-xs mb-0.5" style={{ color: '#666' }}>Latency</div>
          <div className="text-xs font-medium text-white">
            {lastProbe?.latency_ms != null ? `${lastProbe.latency_ms}ms` : '—'}
          </div>
        </div>
        <div className="p-2.5 rounded-md col-span-2" style={{ background: '#111', border: '1px solid #222' }}>
          <div className="text-xs mb-0.5" style={{ color: '#666' }}>Consecutive Failures</div>
          <div className="text-xs font-medium" style={{ color: failures > 0 ? '#E0A020' : '#FFFFFF' }}>
            {failures} {failures === 0 ? '— all clear' : failures >= 2 ? '— ALERT' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
