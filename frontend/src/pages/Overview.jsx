/**
 * Overview — Mission Control landing page (Phase 6).
 * Route: /
 *
 * Panels:
 *  - 4-stat row: Sessions, Tasks, Agents, Activity Today
 *  - Recent Activity feed (last 20 log entries)
 *  - System Quick Glance sidebar
 *  - Task Queue placeholder
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWagzStore } from '@/store/useWagzStore'
import { detectAlerts } from '@/services/alertDetector'
import {
import { API_BASE } from '@/config'
  RefreshCw, ArrowRight, Circle, Cpu, DollarSign,
  CheckCircle2, XCircle, Clock, Activity,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(sec) {
  if (sec == null) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTs(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniStat({ label, value, sub, accent = false, valueColor }) {
  const color = valueColor ?? (accent ? '#E8472A' : '#FFF')
  return (
    <div
      className="p-4 rounded-lg flex flex-col gap-1"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', minHeight: '90px' }}
    >
      <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#555' }}>
        {label}
      </span>
      <span
        className="font-bold"
        style={{ fontSize: '1.1rem', lineHeight: 1.2, color }}
      >
        {value ?? <span style={{ color: '#333' }}>—</span>}
      </span>
      {sub && <span className="text-sm" style={{ color: '#555' }}>{sub}</span>}
    </div>
  )
}

const LEVEL_CFG = {
  ERROR: { color: '#E05252', bg: '#E0525218' },
  WARN:  { color: '#E0A020', bg: '#E0A02018' },
  INFO:  { color: '#555',    bg: 'transparent' },
}

function LogEntry({ entry }) {
  const cfg = LEVEL_CFG[entry.level] ?? LEVEL_CFG.INFO
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 rounded-md"
      style={{ background: cfg.bg, borderBottom: '1px solid #141414' }}
    >
      <span
        className="flex-shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ color: cfg.color, background: `${cfg.color}18`, minWidth: '44px', textAlign: 'center' }}
      >
        {entry.level}
      </span>
      <span className="text-sm flex-shrink-0 mt-0.5 tabular-nums" style={{ color: '#444', minWidth: '68px' }}>
        {fmtTs(entry.ts)}
      </span>
      <span className="text-sm leading-relaxed break-all" style={{ color: '#999' }}>
        {entry.message}
      </span>
    </div>
  )
}

function QuickGlanceRow({ icon: Icon, label, value, valueColor }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid #1A1A1A' }}>
      <Icon size={13} color="#444" className="flex-shrink-0" />
      <span className="text-sm flex-1" style={{ color: '#555' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: valueColor ?? '#CCC' }}>{value ?? '—'}</span>
    </div>
  )
}

// ── Agents Summary Card ───────────────────────────────────────────────────────

function AgentsSummaryCard({ agentsData, recentOrders, loading, onNavigate }) {
  const primary     = agentsData?.primary
  const custom      = agentsData?.custom ?? []
  const customCount = custom.length
  const shown       = custom.slice(0, 3)
  const overflow    = customCount - shown.length

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
    >
      <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
        Agents
      </p>

      {!agentsData && loading ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <span className="text-sm" style={{ color: '#444' }}>Loading…</span>
        </div>
      ) : (
        <>
          {/* Primary agent */}
          {primary && (
            <div
              className="flex items-start gap-2.5 pb-2.5"
              style={{ borderBottom: '1px solid #1E1E1E' }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                style={{ background: '#4CAF50', boxShadow: '0 0 4px #4CAF5088' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{primary.name}</p>
                {primary.model?.primary && (
                  <p className="text-xs truncate font-mono" style={{ color: '#666' }}>
                    {primary.model.primary}
                  </p>
                )}
              </div>
              <span
                className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: '#E8472A15', border: '1px solid #E8472A30', color: '#E8472A' }}
              >
                Primary
              </span>
            </div>
          )}

          {/* Custom agents */}
          <div className="space-y-1.5">
            <p className="text-xs" style={{ color: '#888' }}>
              {customCount === 0
                ? 'No custom agents'
                : `${customCount} custom agent${customCount !== 1 ? 's' : ''}`}
            </p>
            {shown.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: agent.status === 'active' ? '#4CAF50' : '#444' }}
                />
                <span className="text-sm truncate" style={{ color: '#AAA' }}>{agent.name}</span>
              </div>
            ))}
            {overflow > 0 && (
              <p className="text-xs" style={{ color: '#555' }}>+ {overflow} more</p>
            )}
          </div>

          {/* Recent orders */}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: '#666' }}>Recent orders</span>
            <span className="text-sm font-medium" style={{ color: '#CCC' }}>
              {recentOrders.length}
            </span>
          </div>
        </>
      )}

      {/* Manage fleet link */}
      <div className="mt-auto pt-2" style={{ borderTop: '1px solid #222' }}>
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 text-sm transition-colors"
          style={{ color: '#E8472A' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FF6040')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#E8472A')}
        >
          Manage fleet
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}

// ── Alerts Summary Card ───────────────────────────────────────────────────────

function AlertsSummaryCard({ alerts, loading, onNavigate }) {
  const critical = alerts.filter((a) => a.severity === 'critical')
  const warning  = alerts.filter((a) => a.severity === 'warning')
  const info     = alerts.filter((a) => a.severity === 'info')
  const total    = alerts.length
  const hasCritical = critical.length > 0

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: hasCritical ? '#1F1414' : '#1A1A1A',
        border: `1px solid ${hasCritical ? '#E0525240' : '#2A2A2A'}`,
      }}
    >
      <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
        Alerts
      </p>

      {loading && total === 0 ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <span className="text-sm" style={{ color: '#444' }}>Loading…</span>
        </div>
      ) : total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2">
          <CheckCircle2 size={20} color="#4CAF50" />
          <p className="text-sm" style={{ color: '#4CAF50' }}>All clear</p>
        </div>
      ) : (
        <>
          {/* Total count */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-bold"
              style={{ fontSize: '2rem', lineHeight: 1, color: hasCritical ? '#E05252' : '#FFF' }}
            >
              {total}
            </span>
            <span className="text-sm" style={{ color: '#666' }}>
              {total === 1 ? 'alert' : 'alerts'}
            </span>
          </div>

          {/* Breakdown by severity */}
          <div className="space-y-1.5">
            {critical.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E05252', boxShadow: '0 0 4px #E0525288' }} />
                <span className="text-sm" style={{ color: '#E05252' }}>{critical.length} critical</span>
              </div>
            )}
            {warning.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E0A020' }} />
                <span className="text-sm" style={{ color: '#E0A020' }}>{warning.length} warning</span>
              </div>
            )}
            {info.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#555' }} />
                <span className="text-sm" style={{ color: '#888' }}>{info.length} info</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* View all link */}
      <div className="mt-auto pt-2" style={{ borderTop: '1px solid #222' }}>
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 text-sm transition-colors"
          style={{ color: '#E8472A' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FF6040')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#E8472A')}
        >
          View all alerts
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Overview() {
  const { authToken } = useWagzStore()
  const navigate = useNavigate()

  const [status, setStatus]   = useState(null)
  const [credits, setCredits] = useState(null)
  const [model, setModel]     = useState(null)
  const [probe, setProbe]     = useState(null)
  const [logs, setLogs]           = useState([])
  const [todayCount, setTodayCount] = useState(null)
  const [alerts, setAlerts]       = useState([])
  const [agentsData, setAgentsData] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading]     = useState(false)
  const [lastFetch, setLastFetch] = useState(null)

  const headers = { Authorization: `Bearer ${authToken}` }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, creditsRes, modelsRes, probeRes, logsRes, todayRes, agentsRes, ordersRes] = await Promise.allSettled([
        fetch(`${API_BASE}/status`,               { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/credits`,              { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/models`,               { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/health-probe`,         { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/logs?level=ALL&limit=5&sources=gateway,audit`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/logs?level=ALL&limit=1000&since=${encodeURIComponent(todayStart())}&sources=gateway,audit`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/agents`,               { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/orders?limit=5`,       { headers }).then((r) => r.json()),
      ])

      if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
      if (creditsRes.status === 'fulfilled') setCredits(creditsRes.value)
      if (modelsRes.status === 'fulfilled') setModel(modelsRes.value?.active ?? null)
      if (probeRes.status === 'fulfilled') setProbe(probeRes.value)
      if (logsRes.status === 'fulfilled') setLogs((logsRes.value?.logs ?? []).slice().reverse())
      if (todayRes.status === 'fulfilled') setTodayCount(todayRes.value?.total ?? 0)
      if (agentsRes.status === 'fulfilled') setAgentsData(agentsRes.value)
      if (ordersRes.status === 'fulfilled') setRecentOrders(ordersRes.value?.orders ?? [])

      const alertList = await detectAlerts(authToken).catch(() => [])
      setAlerts(alertList)

      setLastFetch(new Date())
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 30_000)
    return () => clearInterval(id)
  }, [fetchAll])

  const gatewayOnline = status?.status === 'online'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Mission Control</h1>
          <p className="text-sm mt-0.5" style={{ color: '#999' }}>
            ClawControl — system overview
            {lastFetch && (
              <span className="ml-2" style={{ color: '#333' }}>
                · updated {fmtTs(lastFetch.toISOString())}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A3A3A'; e.currentTarget.style.color = '#888' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.color = '#555' }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MiniStat
          label="Active Model"
          value={model?.name ?? null}
          sub="primary model"
        />
        <MiniStat
          label="Gateway Status"
          value={status ? (gatewayOnline ? 'Online' : 'Offline') : null}
          sub={gatewayOnline ? fmtUptime(status?.uptime) : '—'}
          valueColor={gatewayOnline ? '#4CAF50' : '#E05252'}
        />
        <MiniStat
          label="Credit Balance"
          value={credits?.balance != null ? `$${Number(credits.balance).toFixed(2)}` : null}
          sub={credits?.burn_24h != null ? `$${Number(credits.burn_24h).toFixed(2)}/day` : '—'}
        />
        <MiniStat
          label="Activity Today"
          value={todayCount != null ? todayCount.toLocaleString() : null}
          sub="log entries"
        />
      </div>

      {/* Row 1: Quick Glance | Agents | Alerts | Task Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

        {/* System Quick Glance */}
        <div
          className="rounded-lg p-4"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
        >
          <p className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
            System Quick Glance
          </p>

          {/* Gateway */}
          <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid #1A1A1A' }}>
            <Circle
              size={8}
              fill={gatewayOnline ? '#4CAF50' : '#E05252'}
              color={gatewayOnline ? '#4CAF50' : '#E05252'}
              className="flex-shrink-0"
            />
            <span className="text-sm flex-1" style={{ color: '#555' }}>Gateway</span>
            <span className="text-sm font-medium" style={{ color: gatewayOnline ? '#4CAF50' : '#E05252' }}>
              {status?.status ?? '—'}
            </span>
          </div>

          <QuickGlanceRow
            icon={Clock}
            label="Uptime"
            value={fmtUptime(status?.uptime)}
          />

          <QuickGlanceRow
            icon={Cpu}
            label="Active model"
            value={model?.name ?? '—'}
          />

          <QuickGlanceRow
            icon={DollarSign}
            label="Credit balance"
            value={credits?.balance != null ? `$${Number(credits.balance).toFixed(2)}` : '—'}
            valueColor={credits?.balance != null && credits.balance < 5 ? '#E05252' : '#CCC'}
          />

          <QuickGlanceRow
            icon={DollarSign}
            label="Burn rate 24h"
            value={credits?.burn_24h != null ? `$${Number(credits.burn_24h).toFixed(4)}` : '—'}
          />

          {/* Health probe */}
          <div className="flex items-center gap-3 pt-2.5">
            {probe?.result === 'ok'
              ? <CheckCircle2 size={13} color="#4CAF50" className="flex-shrink-0" />
              : probe?.result
                ? <XCircle size={13} color="#E05252" className="flex-shrink-0" />
                : <Activity size={13} color="#444" className="flex-shrink-0" />
            }
            <span className="text-sm flex-1" style={{ color: '#555' }}>Health probe</span>
            <span
              className="text-sm font-medium"
              style={{ color: probe?.result === 'ok' ? '#4CAF50' : probe?.result ? '#E05252' : '#444' }}
            >
              {probe?.result
                ? `${probe.result}${probe.latency_ms != null ? ` · ${probe.latency_ms}ms` : ''}`
                : 'no data'
              }
            </span>
          </div>
        </div>

        {/* Agents Summary */}
        <AgentsSummaryCard
          agentsData={agentsData}
          recentOrders={recentOrders}
          loading={loading}
          onNavigate={() => navigate('/agents')}
        />

        {/* Alerts Summary */}
        <AlertsSummaryCard
          alerts={alerts}
          loading={loading}
          onNavigate={() => navigate('/alerts')}
        />

        {/* Task Queue placeholder */}
        <div
          className="rounded-lg p-4"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
        >
          <p className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#666' }}>
            Task Queue
          </p>
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: '#141414', border: '1px solid #222' }}
            >
              <CheckCircle2 size={16} color="#2A2A2A" />
            </div>
            <p className="text-base" style={{ color: '#333' }}>No active tasks</p>
            <p className="text-sm text-center" style={{ color: '#2A2A2A' }}>
              Task queue integration coming soon
            </p>
          </div>
        </div>

      </div>

      {/* Row 2: Recent Activity feed — full width */}
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #222' }}
        >
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
            Recent Activity
          </span>
          <span className="text-sm" style={{ color: '#333' }}>last 5 entries</span>
        </div>

        <div>
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm" style={{ color: '#333' }}>
              {loading ? 'Loading…' : 'No log entries found'}
            </div>
          ) : (
            logs.map((entry) => <LogEntry key={entry.id} entry={entry} />)
          )}
        </div>

        <div
          className="px-4 py-2.5"
          style={{ borderTop: '1px solid #1E1E1E' }}
        >
          <button
            onClick={() => navigate('/logs')}
            className="flex items-center gap-1 text-sm transition-colors"
            style={{ color: '#E8472A' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FF6040')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#E8472A')}
          >
            View all logs
            <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}
