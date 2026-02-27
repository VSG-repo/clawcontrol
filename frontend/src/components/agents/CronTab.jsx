import { useEffect, useState, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  Clock, Plus, Pencil, Trash2, X, Save, Lock,
  ToggleLeft, ToggleRight, RefreshCw,
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

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="relative w-full max-w-lg mx-4 rounded-lg p-6 space-y-4 overflow-y-auto"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', maxHeight: '90vh' }}
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

// ── Field ─────────────────────────────────────────────────────────────────────

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

// ── Schedule presets ───────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Every hour',        value: '0 * * * *'   },
  { label: 'Every 6 hours',     value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *'   },
  { label: 'Daily at 9am',      value: '0 9 * * *'   },
  { label: 'Weekly Monday 9am', value: '0 9 * * 1'   },
  { label: 'Custom',            value: '__custom__'   },
]

const PRESET_MAP = Object.fromEntries(
  PRESETS.filter((p) => p.value !== '__custom__').map((p) => [p.value, p.label])
)

// ── Agent badge ───────────────────────────────────────────────────────────────

function AgentBadge({ name }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: '#E8472A15', border: '1px solid #E8472A30', color: '#E8472A' }}
    >
      {name || 'Unknown agent'}
    </span>
  )
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return '—'
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000
  if (diff < 60)        return `${Math.round(diff)}s ago`
  if (diff < 3600)      return `${Math.round(diff / 60)}m ago`
  if (diff < 86400)     return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Schedule field (shared) ───────────────────────────────────────────────────

function ScheduleField({ value, onChange }) {
  const knownPreset = PRESET_MAP[value] !== undefined
  const selectVal   = knownPreset ? value : '__custom__'

  const handlePresetChange = (v) => {
    if (v === '__custom__') {
      // If switching from a known preset → clear so user types fresh
      // If already custom → keep current expression
      onChange(knownPreset ? '' : value)
    } else {
      onChange(v)
    }
  }

  return (
    <div className="space-y-2">
      <select
        style={{ ...inputStyle, cursor: 'pointer' }}
        value={selectVal}
        onChange={(e) => handlePresetChange(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {!knownPreset && (
        <div className="space-y-1">
          <input
            style={inputStyle}
            placeholder="e.g. 0 9 * * 1-5"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-xs" style={{ color: '#888' }}>
            minute hour day month weekday — e.g. 0 9 * * 1-5 (weekdays at 9am)
          </p>
        </div>
      )}
    </div>
  )
}

// ── System Job Row ────────────────────────────────────────────────────────────

function SystemJobRow({ job }) {
  return (
    <div
      className="px-4 py-3 rounded-md flex items-start gap-3"
      style={{ background: '#141414', border: '1px solid #1E1E1E' }}
    >
      <Clock size={13} color="#444" className="flex-shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: '#888' }}>
            {job.name || 'Unnamed job'}
          </span>
          {job.description && (
            <span className="text-xs" style={{ color: '#888' }}>{job.description}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs font-mono" style={{ color: '#888' }}>{job.schedule}</span>
          {PRESET_MAP[job.schedule] && (
            <span className="text-xs" style={{ color: '#777' }}>({PRESET_MAP[job.schedule]})</span>
          )}
        </div>
      </div>

      <span
        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#777' }}
      >
        <Lock size={9} /> System
      </span>
    </div>
  )
}

// ── Edit Cron Modal ───────────────────────────────────────────────────────────

function EditCronModal({ job, agents, authToken, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:        job.name        || '',
    description: job.description || '',
    agentId:     job.agentId     || '',
    schedule:    job.schedule    || '',
    directive:   job.directive   || '',
    enabled:     job.enabled !== false,
  })
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')

  const submit = async () => {
    if (!form.name.trim() || !form.agentId || !form.schedule.trim() || !form.directive.trim()) {
      setError('Name, agent, schedule, and directive are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await fetch(`/api/cron/${job.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description,
          agentId:     form.agentId,
          schedule:    form.schedule.trim(),
          directive:   form.directive.trim(),
          enabled:     form.enabled,
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Failed') }
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to update job')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-base font-semibold text-white pr-6">Edit Cron Job</h3>
      <div className="space-y-3">
        <Field label="Name *">
          <input
            autoFocus
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Description">
          <input
            style={inputStyle}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <Field label="Agent *">
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.agentId}
            onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
          >
            <option value="">Select agent…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Schedule *">
          <ScheduleField
            value={form.schedule}
            onChange={(v) => setForm((f) => ({ ...f, schedule: v }))}
          />
        </Field>
        <Field label="Directive *">
          <textarea
            style={textareaStyle}
            value={form.directive}
            onChange={(e) => setForm((f) => ({ ...f, directive: e.target.value }))}
          />
        </Field>
        <Field label="Enabled">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            className="flex items-center gap-2 text-sm"
            style={{ color: form.enabled ? '#4A9A4A' : '#666' }}
          >
            {form.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {form.enabled ? 'Enabled' : 'Disabled'}
          </button>
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
          <Save size={12} /> Save
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

// ── Cron Job Card ─────────────────────────────────────────────────────────────

function CronJobCard({ job, agentName, agents, authToken, onUpdated, onToast }) {
  const [toggling,       setToggling]       = useState(false)
  const [showEdit,       setShowEdit]       = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  const enabled = job.enabled !== false

  const toggle = async () => {
    setToggling(true)
    try {
      const r = await fetch(`/api/cron/${job.id}/toggle`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) throw new Error()
      onToast(enabled ? 'Job disabled' : 'Job enabled')
      onUpdated()
    } catch {
      onToast('Failed to toggle job')
    } finally {
      setToggling(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      const r = await fetch(`/api/cron/${job.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!r.ok) throw new Error()
      onToast('Job deleted')
      onUpdated()
    } catch {
      onToast('Failed to delete job')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div
        className="p-4 rounded-lg flex flex-col gap-3"
        style={{
          background: '#1A1A1A',
          border: `1px solid ${enabled ? '#2A2A2A' : '#1E1E1E'}`,
          opacity: enabled ? 1 : 0.65,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock size={13} color={enabled ? '#E8472A' : '#555'} className="flex-shrink-0" />
            <span className="text-sm font-semibold text-white truncate">{job.name}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggle}
              disabled={toggling}
              title={enabled ? 'Disable job' : 'Enable job'}
              style={{ color: enabled ? '#4A9A4A' : '#555' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = enabled ? '#E05252' : '#4A9A4A')}
              onMouseLeave={(e) => (e.currentTarget.style.color = enabled ? '#4A9A4A' : '#555')}
            >
              {enabled ? <ToggleRight size={19} /> : <ToggleLeft size={19} />}
            </button>
            <button
              onClick={() => setShowEdit(true)}
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

        {/* Description */}
        {job.description && (
          <p className="text-sm" style={{ color: '#999' }}>{job.description}</p>
        )}

        {/* Agent + schedule */}
        <div className="flex items-center gap-2 flex-wrap">
          <AgentBadge name={agentName} />
          <span className="text-xs font-mono" style={{ color: '#AAA' }}>{job.schedule}</span>
          {PRESET_MAP[job.schedule] && (
            <span className="text-xs" style={{ color: '#888' }}>({PRESET_MAP[job.schedule]})</span>
          )}
        </div>

        {/* Directive preview */}
        {job.directive && (
          <p className="text-sm line-clamp-2" style={{ color: '#888', fontStyle: 'italic' }}>
            {job.directive}
          </p>
        )}

        {/* Footer: last / next run */}
        <div className="flex items-center gap-4 pt-1" style={{ borderTop: '1px solid #222' }}>
          <div>
            <span className="text-xs" style={{ color: '#777' }}>Last run: </span>
            <span className="text-xs" style={{ color: '#999' }}>{timeAgo(job.lastRun)}</span>
          </div>
          {job.nextRun && (
            <div>
              <span className="text-xs" style={{ color: '#777' }}>Next: </span>
              <span className="text-xs" style={{ color: '#999' }}>{timeAgo(job.nextRun)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditCronModal
          job={job}
          agents={agents}
          authToken={authToken}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onUpdated(); onToast('Job updated') }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <h3 className="text-base font-semibold text-white pr-6">Delete Job?</h3>
          <p className="text-sm" style={{ color: '#888' }}>
            "{job.name}" will be permanently removed. This cannot be undone.
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

// ── New Cron Modal ────────────────────────────────────────────────────────────

function NewCronModal({ agents, authToken, onClose, onCreated }) {
  const [form, setForm] = useState({
    name:        '',
    description: '',
    agentId:     agents.length > 0 ? agents[0].id : '',
    schedule:    '0 9 * * *',
    directive:   '',
    enabled:     true,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const submit = async () => {
    if (!form.name.trim() || !form.agentId || !form.schedule.trim() || !form.directive.trim()) {
      setError('Name, agent, schedule, and directive are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/cron', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description,
          agentId:     form.agentId,
          schedule:    form.schedule.trim(),
          directive:   form.directive.trim(),
          enabled:     form.enabled,
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Failed') }
      onCreated()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to create job')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-base font-semibold text-white pr-6">New Cron Job</h3>
      <div className="space-y-3">
        <Field label="Name *">
          <input
            autoFocus
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Daily briefing"
          />
        </Field>
        <Field label="Description">
          <input
            style={inputStyle}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional note"
          />
        </Field>
        <Field label="Agent *">
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.agentId}
            onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
          >
            <option value="">Select agent…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Schedule *">
          <ScheduleField
            value={form.schedule}
            onChange={(v) => setForm((f) => ({ ...f, schedule: v }))}
          />
        </Field>
        <Field label="Directive *">
          <textarea
            style={textareaStyle}
            value={form.directive}
            onChange={(e) => setForm((f) => ({ ...f, directive: e.target.value }))}
            placeholder="What should the agent do at this time?"
          />
        </Field>
        <Field label="Enabled">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            className="flex items-center gap-2 text-sm"
            style={{ color: form.enabled ? '#4A9A4A' : '#666' }}
          >
            {form.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {form.enabled ? 'Enabled' : 'Disabled'}
          </button>
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
          <Plus size={12} /> Create Job
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

// ── Cron Tab ──────────────────────────────────────────────────────────────────

export default function CronTab() {
  const { authToken } = useWagzStore()

  const [systemJobs,  setSystemJobs]  = useState([])
  const [customJobs,  setCustomJobs]  = useState([])
  const [agents,      setAgents]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [toastMsg,    setToastMsg]    = useState(null)

  const toast = (msg) => setToastMsg(msg)

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const [cronRes, agentsRes] = await Promise.all([
        fetch('/api/cron',   { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/agents', { headers: { Authorization: `Bearer ${authToken}` } }),
      ])
      if (cronRes.ok) {
        const d = await cronRes.json()
        setSystemJobs(d.system || [])
        setCustomJobs(d.custom || [])
      }
      if (agentsRes.ok) {
        const d = await agentsRes.json()
        const primary = d.primary ? [{ id: 'primary', name: d.primary.name || 'Primary Agent' }] : []
        const custom  = (d.custom || []).map((a) => ({ id: a.id, name: a.name }))
        setAgents([...primary, ...custom])
      }
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => { load() }, [load])

  // agentId → name lookup
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]))

  return (
    <div className="space-y-8">

      {/* ── System Jobs ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Lock size={13} color="#555" />
          <h2 className="text-base font-semibold text-white">System Jobs</h2>
          {systemJobs.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555' }}
            >
              {systemJobs.length}
            </span>
          )}
        </div>

        {systemJobs.length === 0 ? (
          <div className="py-8 text-center" style={{ color: '#444' }}>
            <p className="text-base" style={{ color: '#999' }}>No system cron jobs configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {systemJobs.map((job) => (
              <SystemJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      {/* ── Scheduled Jobs ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={13} color="#E8472A" />
            <h2 className="text-base font-semibold text-white">Scheduled Jobs</h2>
            {customJobs.length > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555' }}
              >
                {customJobs.length}
              </span>
            )}
          </div>
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
              <Plus size={13} /> New Job
            </button>
          </div>
        </div>

        {customJobs.length === 0 ? (
          <div className="py-16 text-center" style={{ color: '#444' }}>
            <Clock size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-base" style={{ color: '#999' }}>No scheduled jobs yet — create one to automate your agents</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customJobs.map((job) => (
              <CronJobCard
                key={job.id}
                job={job}
                agentName={agentMap[job.agentId] || job.agentId}
                agents={agents}
                authToken={authToken}
                onUpdated={load}
                onToast={toast}
              />
            ))}
          </div>
        )}
      </section>

      {/* New job modal */}
      {showNew && (
        <NewCronModal
          agents={agents}
          authToken={authToken}
          onClose={() => setShowNew(false)}
          onCreated={() => { load(); toast('Job created') }}
        />
      )}

      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
