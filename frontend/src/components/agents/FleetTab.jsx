import { useEffect, useState, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  Bot, Plus, RefreshCw, Pencil, Trash2, X, Save, Check,
} from 'lucide-react'

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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const color = status === 'active' ? '#4A9A4A' : status === 'idle' ? '#E0A020' : '#555'
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 5px ${color}88` }} />
      <span className="text-xs capitalize" style={{ color: '#888' }}>{status || 'idle'}</span>
    </span>
  )
}

// ── Modal backdrop ────────────────────────────────────────────────────────────

function Modal({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="relative w-full max-w-lg mx-4 rounded-lg p-6 space-y-4"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4"
          style={{ color: '#555' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#999')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: '#888' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  background: '#111', border: '1px solid #2A2A2A', color: '#fff',
  width: '100%', borderRadius: '6px', padding: '8px 12px', fontSize: '14px',
}
const textareaStyle = { ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }

// ── Primary Agent Card ────────────────────────────────────────────────────────

function PrimaryAgentCard({ agent, authToken, onUpdated, onToast }) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(agent.name || 'Primary Agent')
  const [saving, setSaving] = useState(false)

  const saveName = async () => {
    const trimmed = nameVal.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const r = await fetch('/api/agents/primary/name', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!r.ok) throw new Error()
      onToast('Primary agent name saved')
      setEditing(false)
      onUpdated()
    } catch {
      onToast('Failed to save name')
    } finally {
      setSaving(false)
    }
  }

  const model = agent.model || {}
  const subagents = agent.subagents || {}

  return (
    <div
      className="p-4 rounded-lg mb-6"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderLeft: '3px solid #E8472A' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Bot size={16} color="#E8472A" className="flex-shrink-0" />

          {editing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                className="flex-1 text-sm px-2 py-1 rounded"
                style={{ background: '#111', border: '1px solid #E8472A60', color: '#fff' }}
              />
              <button onClick={saveName} disabled={saving} style={{ color: '#4A9A4A' }} title="Save">
                <Check size={14} />
              </button>
              <button onClick={() => { setEditing(false); setNameVal(agent.name || 'Primary Agent') }} style={{ color: '#666' }} title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 group"
              title="Click to rename"
            >
              <span className="text-base font-semibold text-white">{agent.name || 'Primary Agent'}</span>
              <Pencil size={11} style={{ color: '#444' }} className="group-hover:text-[#888] transition-colors" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8472A20', border: '1px solid #E8472A50', color: '#E8472A' }}>
            Primary
          </span>
          <span className="w-2 h-2 rounded-full" style={{ background: '#4A9A4A', boxShadow: '0 0 5px #4A9A4A88' }} title="Active" />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs mb-0.5" style={{ color: '#555' }}>Primary Model</p>
          <p style={{ color: '#CCC' }}>{model.primary || <span style={{ color: '#444' }}>—</span>}</p>
        </div>
        {model.fallbacks?.length > 0 && (
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#555' }}>Fallbacks</p>
            <p style={{ color: '#CCC' }}>{model.fallbacks.join(', ')}</p>
          </div>
        )}
        {agent.workspace && (
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#555' }}>Workspace</p>
            <p className="truncate font-mono text-xs" style={{ color: '#888' }}>{agent.workspace}</p>
          </div>
        )}
        {agent.compaction != null && (
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#555' }}>Compaction</p>
            <p style={{ color: '#CCC' }}>{String(agent.compaction)}</p>
          </div>
        )}
        {agent.maxConcurrent != null && (
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#555' }}>Max Concurrent</p>
            <p style={{ color: '#CCC' }}>{agent.maxConcurrent}</p>
          </div>
        )}
        {subagents.maxConcurrent != null && (
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#555' }}>Subagents Max</p>
            <p style={{ color: '#CCC' }}>{subagents.maxConcurrent}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Custom Agent Card ─────────────────────────────────────────────────────────

function CustomAgentCard({ agent, authToken, onUpdated, onToast }) {
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edit form state — initialised when modal opens
  const [form, setForm] = useState({})

  const openEdit = () => {
    setForm({
      name:         agent.name || '',
      model:        agent.model || '',
      identity:     agent.identity || '',
      systemPrompt: agent.systemPrompt || '',
      skills:       (agent.skills || []).join(', '),
      status:       agent.status || 'idle',
    })
    setShowEdit(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         form.name.trim(),
          model:        form.model.trim(),
          identity:     form.identity,
          systemPrompt: form.systemPrompt,
          skills:       form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          status:       form.status,
        }),
      })
      if (!r.ok) throw new Error()
      onToast('Agent updated')
      setShowEdit(false)
      onUpdated()
    } catch {
      onToast('Failed to update agent')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      const r = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) throw new Error()
      onToast('Agent deleted')
      onUpdated()
    } catch {
      onToast('Failed to delete agent')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const skillCount = (agent.skills || []).length

  return (
    <>
      <div
        className="p-4 rounded-lg flex flex-col gap-3"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
      >
        {/* Card header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bot size={14} color="#888" className="flex-shrink-0" />
            <span className="text-sm font-semibold text-white truncate">{agent.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={openEdit}
              className="flex items-center justify-center rounded p-1"
              style={{ color: '#555' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#CCC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center rounded p-1"
              style={{ color: '#555' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#E05252')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Model */}
        <p className="text-xs font-mono truncate" style={{ color: '#888' }}>{agent.model || '—'}</p>

        {/* Identity */}
        {agent.identity && (
          <p className="text-xs line-clamp-2" style={{ color: '#666' }}>{agent.identity}</p>
        )}

        {/* System prompt preview */}
        {agent.systemPrompt && (
          <p className="text-xs line-clamp-2" style={{ color: '#555', fontStyle: 'italic' }}>
            {agent.systemPrompt}
          </p>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between mt-auto pt-1" style={{ borderTop: '1px solid #222' }}>
          <StatusDot status={agent.status} />
          {skillCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1E1E1E', color: '#666', border: '1px solid #222' }}>
              {skillCount} skill{skillCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <Modal onClose={() => setShowEdit(false)}>
          <h3 className="text-base font-semibold text-white pr-6">Edit Agent</h3>
          <div className="space-y-3">
            <Field label="Name *">
              <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Model *">
              <input style={inputStyle} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="e.g. claude-sonnet-4-6" />
            </Field>
            <Field label="Identity">
              <input style={inputStyle} value={form.identity} onChange={(e) => setForm((f) => ({ ...f, identity: e.target.value }))} placeholder="Short role description" />
            </Field>
            <Field label="System Prompt">
              <textarea style={textareaStyle} value={form.systemPrompt} onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))} />
            </Field>
            <Field label="Skills (comma-separated)">
              <input style={inputStyle} value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="skill-one, skill-two" />
            </Field>
            <Field label="Status">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="idle">idle</option>
                <option value="active">active</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveEdit}
              disabled={saving || !form.name?.trim() || !form.model?.trim()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
              style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
            >
              <Save size={12} /> Save
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <h3 className="text-base font-semibold text-white pr-6">Delete Agent?</h3>
          <p className="text-sm" style={{ color: '#888' }}>
            "{agent.name}" will be permanently removed. This cannot be undone.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={doDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
              style={{ background: '#E05252', color: '#fff', border: '1px solid #E05252' }}
            >
              <Trash2 size={12} /> Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── New Agent Modal ───────────────────────────────────────────────────────────

function NewAgentModal({ authToken, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', model: '', identity: '', systemPrompt: '', skills: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.name.trim() || !form.model.trim()) {
      setError('Name and Model are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/agents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         form.name.trim(),
          model:        form.model.trim(),
          identity:     form.identity,
          systemPrompt: form.systemPrompt,
          skills:       form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Failed') }
      onCreated()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to create agent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-base font-semibold text-white pr-6">New Agent</h3>
      <div className="space-y-3">
        <Field label="Name *">
          <input autoFocus style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Research Agent" />
        </Field>
        <Field label="Model *">
          <input style={inputStyle} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="e.g. claude-sonnet-4-6" />
        </Field>
        <Field label="Identity">
          <input style={inputStyle} value={form.identity} onChange={(e) => setForm((f) => ({ ...f, identity: e.target.value }))} placeholder="Short role description" />
        </Field>
        <Field label="System Prompt">
          <textarea style={textareaStyle} value={form.systemPrompt} onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))} />
        </Field>
        <Field label="Skills (comma-separated)">
          <input style={inputStyle} value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="skill-one, skill-two" />
        </Field>
      </div>
      {error && (
        <p className="text-xs px-3 py-2 rounded" style={{ background: '#E0525215', border: '1px solid #E0525240', color: '#E05252' }}>
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
          style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
        >
          <Plus size={12} /> Create Agent
        </button>
        <button
          onClick={onClose}
          className="text-sm px-3 py-2 rounded-md"
          style={{ background: '#111', border: '1px solid #2A2A2A', color: '#666' }}
        >
          Cancel
        </button>
      </div>
    </Modal>
  )
}

// ── Fleet Tab ─────────────────────────────────────────────────────────────────

export default function FleetTab() {
  const { authToken } = useWagzStore()
  const [primary, setPrimary] = useState(null)
  const [custom, setCustom] = useState([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  const toast = (msg) => setToastMsg(msg)

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const r = await fetch('/api/agents', { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r.ok) return
      const data = await r.json()
      setPrimary(data.primary || null)
      setCustom(data.custom || [])
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: '#555' }}>
          {custom.length} custom agent{custom.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
            style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
          >
            <Plus size={13} /> New Agent
          </button>
        </div>
      </div>

      {/* Primary agent */}
      {primary && (
        <PrimaryAgentCard
          agent={primary}
          authToken={authToken}
          onUpdated={load}
          onToast={toast}
        />
      )}

      {/* Custom agents grid */}
      {custom.length === 0 ? (
        <div className="py-16 text-center" style={{ color: '#444' }}>
          <Bot size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No custom agents yet — create one to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {custom.map((agent) => (
            <CustomAgentCard
              key={agent.id}
              agent={agent}
              authToken={authToken}
              onUpdated={load}
              onToast={toast}
            />
          ))}
        </div>
      )}

      {/* New Agent modal */}
      {showNew && (
        <NewAgentModal
          authToken={authToken}
          onClose={() => setShowNew(false)}
          onCreated={() => { load(); toast('Agent created') }}
        />
      )}

      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
