import { useEffect, useState, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { Send, Trash2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { API_BASE } from '@/config'

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div
      className="fixed bottom-6 right-6 z-50 text-sm px-4 py-2.5 rounded-md"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#CCC', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
    >
      {msg}
    </div>
  )
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000
  if (diff < 60)         return `${Math.round(diff)}s ago`
  if (diff < 3600)       return `${Math.round(diff / 60)}m ago`
  if (diff < 86400)      return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7)  return `${Math.round(diff / 86400)}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function absTime(isoString) {
  return new Date(isoString).toLocaleString()
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = {
    sent:    { bg: '#1A2A1A', border: '#2A4A2A', text: '#4A9A4A' },
    pending: { bg: '#2A2A1A', border: '#4A4A2A', text: '#9A9A3A' },
    failed:  { bg: '#2A1A1A', border: '#4A2A2A', text: '#CE6A3A' },
  }
  const c = colors[status] || colors.sent
  return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {status || 'sent'}
    </span>
  )
}

// ── Agent name badge ──────────────────────────────────────────────────────────

function AgentBadge({ name }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#E8472A15', border: '1px solid #E8472A30', color: '#E8472A' }}>
      {name}
    </span>
  )
}

// ── Order row ─────────────────────────────────────────────────────────────────

function OrderRow({ order, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = (order.directive || '').length > 100

  return (
    <div
      className="px-4 py-3 rounded-md"
      style={{ background: '#1A1A1A', border: '1px solid #222' }}
    >
      <div className="flex items-start gap-3">
        {/* Left: timestamp + agent */}
        <div className="flex flex-col gap-1 flex-shrink-0" style={{ minWidth: '90px' }}>
          <span
            className="text-xs cursor-default"
            style={{ color: '#555' }}
            title={absTime(order.timestamp)}
          >
            {timeAgo(order.timestamp)}
          </span>
          <AgentBadge name={order.agentName} />
        </div>

        {/* Center: directive */}
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: '#CCC', wordBreak: 'break-word' }}>
            {expanded || !isLong
              ? order.directive
              : `${order.directive.slice(0, 100)}…`}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-0.5 text-xs mt-1"
              style={{ color: '#555' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Right: status + delete */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={order.status} />
          <button
            onClick={() => onDelete(order.id)}
            className="flex items-center justify-center rounded p-1"
            style={{ color: '#444' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#E05252')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
            title="Delete order"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

export default function OrdersTab() {
  const { authToken } = useWagzStore()

  // Agent list for dropdown
  const [agents, setAgents] = useState([])
  // Order history
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Send form
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [directive, setDirective] = useState('')
  const [sending, setSending] = useState(false)

  // Confirm clear all
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const [toastMsg, setToastMsg] = useState(null)
  const toast = (msg) => setToastMsg(msg)

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r.ok) return
      const data = await r.json()
      const primary = data.primary ? [{ id: 'primary', name: data.primary.name || 'Primary Agent' }] : []
      const custom  = (data.custom || []).map((a) => ({ id: a.id, name: a.name }))
      const all = [...primary, ...custom]
      setAgents(all)
      if (all.length > 0 && !selectedAgentId) setSelectedAgentId(all[0].id)
    } catch { /* silent */ }
  }, [authToken, selectedAgentId])

  const loadOrders = useCallback(async () => {
    if (!authToken) return
    setLoadingOrders(true)
    try {
      const r = await fetch(`${API_BASE}/orders?limit=100`, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r.ok) return
      const data = await r.json()
      setOrders(data.orders || [])
    } finally {
      setLoadingOrders(false)
    }
  }, [authToken])

  useEffect(() => {
    loadAgents()
    loadOrders()
  }, [authToken]) // eslint-disable-line

  // ── Send directive ─────────────────────────────────────────────────────────

  const send = async () => {
    const text = directive.trim()
    if (!text || !selectedAgentId) return
    const agentName = agents.find((a) => a.id === selectedAgentId)?.name || selectedAgentId
    setSending(true)
    try {
      const r = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, agentName, directive: text }),
      })
      if (!r.ok) throw new Error('Failed to send order')

      // Dispatch to chat system
      window.dispatchEvent(new CustomEvent('clawcontrol:send-prompt', {
        detail: { message: text, agentId: selectedAgentId },
      }))

      toast('Directive sent')
      setDirective('')
      await loadOrders()
    } catch (e) {
      toast(e.message || 'Failed to send directive')
    } finally {
      setSending(false)
    }
  }

  // ── Delete single ──────────────────────────────────────────────────────────

  const deleteOrder = async (id) => {
    try {
      await fetch(`${API_BASE}/orders/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      setOrders((prev) => prev.filter((o) => o.id !== id))
    } catch {
      toast('Failed to delete order')
    }
  }

  // ── Clear all ──────────────────────────────────────────────────────────────

  const clearAll = async () => {
    setClearing(true)
    try {
      await fetch(`${API_BASE}/orders`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      setOrders([])
      toast('Order history cleared')
    } catch {
      toast('Failed to clear history')
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Send Directive ── */}
      <section className="p-4 rounded-lg space-y-3" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <h2 className="text-base font-semibold text-white">Send Directive</h2>

        {/* Agent selector */}
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-md"
          style={{ background: '#111', border: '1px solid #2A2A2A', color: agents.length ? '#fff' : '#555' }}
        >
          {agents.length === 0
            ? <option value="">Loading agents…</option>
            : agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))
          }
        </select>

        {/* Directive textarea */}
        <textarea
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          placeholder="Enter directive for agent…"
          className="w-full text-sm px-3 py-2 rounded-md"
          style={{
            background: '#111', border: '1px solid #2A2A2A', color: '#fff',
            minHeight: '90px', resize: 'vertical',
          }}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: '#999' }}>Cmd/Ctrl+Enter to send</p>
          <button
            onClick={send}
            disabled={sending || !directive.trim() || !selectedAgentId}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
            style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A', opacity: (!directive.trim() || !selectedAgentId) ? 0.5 : 1 }}
          >
            <Send size={13} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </section>

      {/* ── Order History ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={13} color="#E8472A" />
            <h2 className="text-base font-semibold text-white">Order History</h2>
            {orders.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555' }}>
                {orders.length}
              </span>
            )}
          </div>

          {orders.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#888' }}>Clear all?</span>
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: '#E05252', color: '#fff', border: '1px solid #E05252' }}
                >
                  {clearing ? 'Clearing…' : 'Yes, clear'}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#E05252'; e.currentTarget.style.borderColor = '#E0525240' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#2A2A2A' }}
              >
                <Trash2 size={11} /> Clear All
              </button>
            )
          )}
        </div>

        {loadingOrders ? (
          <div className="py-10 text-center text-sm" style={{ color: '#444' }}>Loading…</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center" style={{ color: '#444' }}>
            <Clock size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-base" style={{ color: '#999' }}>No orders sent yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} onDelete={deleteOrder} />
            ))}
          </div>
        )}
      </section>

      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
