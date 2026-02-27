import { useEffect, useState, useRef } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
  FileText, Send, Download, Tag, Plus, Trash2, Save,
  Braces, RotateCcw, ChevronDown, X, FolderOpen, Code,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVars(content) {
  const seen = new Set()
  const out = []
  for (const m of (content || '').matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]) }
  }
  return out
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const CATEGORIES = ['all', 'coding', 'research', 'media', 'contracts', 'marketing', 'custom']

const CAT_COLORS = {
  coding:    { bg: '#1A2A1A', border: '#2A4A2A', text: '#4A9A4A' },
  research:  { bg: '#1A1A2A', border: '#2A2A4A', text: '#6A6ACE' },
  media:     { bg: '#2A1A2A', border: '#4A2A4A', text: '#9A4A9A' },
  contracts: { bg: '#2A2A1A', border: '#4A4A2A', text: '#9A9A3A' },
  marketing: { bg: '#2A1A1A', border: '#4A2A2A', text: '#CE6A3A' },
  custom:    { bg: '#1A1A1A', border: '#2A2A2A', text: '#666666' },
}

function CatBadge({ cat }) {
  const c = CAT_COLORS[cat] || CAT_COLORS.custom
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {cat}
    </span>
  )
}

function TypeBadge({ type }) {
  const colors = { skill: '#E8472A', readme: '#6A6ACE', system_prompt: '#4A9A4A', custom: '#666' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1A1A1A', border: `1px solid #2A2A2A`, color: colors[type] || '#666' }}>
      {type}
    </span>
  )
}

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

// ── Help Box ──────────────────────────────────────────────────────────────────

const HELP_CONTENT = {
  prompts: {
    heading: '📋 Prompts',
    intro: 'Save reusable prompts you send to your agent regularly.',
    bullets: [
      "Click '+ New Prompt' to create one",
      "Use {{variable_name}} for dynamic parts (e.g. 'Research {{topic}} in {{format}} format')",
      'Variables auto-detect and show as orange pills',
      "'Fill & Send' lets you fill in variables then sends to Chat",
      "'Send Raw' sends the prompt as-is with the {{brackets}} included",
      'Use categories to organize: Coding, Research, Media, etc.',
    ],
  },
  templates: {
    heading: '📄 Templates',
    intro: 'Create and export .md files like SKILL.md, README.md, or system prompts.',
    bullets: [
      "Click 'From Starter' to begin with a pre-built template",
      'Edit the content, then Export to save directly to your OpenClaw workspace',
      'Or Download as a .md file to your computer',
      'Great for creating skills, documentation, and agent configs',
    ],
  },
}

function HelpBox({ tab }) {
  const content = HELP_CONTENT[tab] || HELP_CONTENT.prompts
  return (
    <div
      className="mb-5 rounded-md px-4 py-3"
      style={{ background: '#141414', border: '1px solid #252525' }}
    >
      <p className="text-sm font-semibold mb-1" style={{ color: '#CCC' }}>{content.heading}</p>
      <p className="text-base mb-2" style={{ color: '#BBB' }}>{content.intro}</p>
      <ul className="space-y-1">
        {content.bullets.map((b, i) => (
          <li key={i} className="text-base flex gap-2" style={{ color: '#BBB' }}>
            <span style={{ color: '#666', flexShrink: 0 }}>•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Prompts Tab ───────────────────────────────────────────────────────────────

function PromptsTab({ authToken, toast }) {
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(false)
  const [catFilter, setCatFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [showNew, setShowNew] = useState(false)

  // expanded prompt edit state
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editCat, setEditCat] = useState('custom')
  const [saving, setSaving] = useState(false)

  // fill & send state
  const [showFill, setShowFill] = useState(false)
  const [fillVars, setFillVars] = useState({})

  // new prompt state
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCat, setNewCat] = useState('custom')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const r = await fetch('/api/prompts', { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r.ok) return
      const data = await r.json()
      setPrompts(data.prompts || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [authToken]) // eslint-disable-line

  const expand = (p) => {
    if (expandedId === p.id) { setExpandedId(null); setShowFill(false); return }
    setExpandedId(p.id)
    setEditTitle(p.title)
    setEditContent(p.content)
    setEditCat(p.category || 'custom')
    setShowFill(false)
    setFillVars({})
  }

  const save = async (p) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/prompts/${p.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent, category: editCat }),
      })
      if (!r.ok) return
      toast('Prompt saved')
      await load()
    } finally {
      setSaving(false) }
  }

  const del = async (id) => {
    await fetch(`/api/prompts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    toast('Prompt deleted')
    setExpandedId(null)
    await load()
  }

  const sendRaw = (content) => {
    window.dispatchEvent(new CustomEvent('clawcontrol:send-prompt', { detail: { message: content } }))
    toast('Sent to Chat')
  }

  const sendFilled = async (p) => {
    const r = await fetch(`/api/prompts/${p.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: fillVars }),
    })
    if (!r.ok) return
    const data = await r.json()
    window.dispatchEvent(new CustomEvent('clawcontrol:send-prompt', { detail: { message: data.resolved } }))
    toast('Sent to Chat')
    setShowFill(false)
  }

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/prompts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent, category: newCat }),
      })
      if (!r.ok) return
      toast('Prompt created')
      setShowNew(false)
      setNewTitle(''); setNewContent(''); setNewCat('custom')
      await load()
    } finally {
      setCreating(false)
    }
  }

  const filtered = catFilter === 'all' ? prompts : prompts.filter((p) => p.category === catFilter)

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className="text-sm px-3 py-1 rounded-full transition-colors capitalize"
            style={{
              background: catFilter === c ? '#E8472A' : '#1A1A1A',
              border: `1px solid ${catFilter === c ? '#E8472A' : '#2A2A2A'}`,
              color: catFilter === c ? '#fff' : '#888',
            }}
          >
            {c}
          </button>
        ))}
        <button
          onClick={() => setShowNew((v) => !v)}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1 rounded-md"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
        >
          <Plus size={13} /> New Prompt
        </button>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-md"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
        >
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* New Prompt form */}
      {showNew && (
        <div className="p-4 rounded-md space-y-3" style={{ background: '#1A1A1A', border: '1px solid #E8472A40' }}>
          <h3 className="text-sm font-semibold text-white">New Prompt</h3>
          <input
            className="w-full text-sm px-3 py-2 rounded-md"
            style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="w-full text-sm px-3 py-2 rounded-md font-mono"
            style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff', minHeight: '100px', resize: 'vertical' }}
            placeholder="Prompt content — use {{variable}} for placeholders"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          {/* Live variable preview */}
          {extractVars(newContent).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {extractVars(newContent).map((v) => (
                <span key={v} className="text-xs px-2 py-0.5 rounded" style={{ background: '#E8472A20', border: '1px solid #E8472A40', color: '#E8472A' }}>
                  <Braces size={10} className="inline mr-1" />{v}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <select
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            >
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
            <button
              onClick={create}
              disabled={creating || !newTitle.trim()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
              style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
            >
              <Save size={12} /> Save
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Prompt list */}
      {filtered.length === 0 && !showNew && (
        <div className="py-16 text-center" style={{ color: '#444' }}>
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No prompts yet — create one above</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => {
          const isOpen = expandedId === p.id
          const vars = p.variables || []
          return (
            <div
              key={p.id}
              className="rounded-md overflow-hidden"
              style={{ background: '#1A1A1A', border: `1px solid ${isOpen ? '#E8472A40' : '#2A2A2A'}` }}
            >
              {/* Card header */}
              <button
                onClick={() => expand(p)}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
              >
                <FileText size={14} color="#E8472A" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{p.title}</span>
                    <CatBadge cat={p.category || 'custom'} />
                    {vars.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8472A15', border: '1px solid #E8472A30', color: '#E8472A' }}>
                        <Braces size={9} className="inline mr-1" />{vars.length} var{vars.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 line-clamp-2" style={{ color: '#666' }}>
                    {p.content?.split('\n').slice(0, 2).join(' ')}
                  </p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>{fmtDate(p.created_at)}</span>
                <ChevronDown
                  size={13}
                  style={{ color: '#555', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                />
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid #222' }}>
                  {/* Variable pills */}
                  {extractVars(editContent).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-3">
                      {extractVars(editContent).map((v) => (
                        <span key={v} className="text-xs px-2 py-0.5 rounded" style={{ background: '#E8472A20', border: '1px solid #E8472A40', color: '#E8472A' }}>
                          <Braces size={10} className="inline mr-1" />{v}
                        </span>
                      ))}
                    </div>
                  )}

                  <input
                    className="w-full text-sm px-3 py-2 rounded-md"
                    style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                  />

                  <textarea
                    className="w-full text-sm px-3 py-2 rounded-md font-mono"
                    style={{ background: '#111', border: '1px solid #2A2A2A', color: '#DDD', minHeight: '120px', resize: 'vertical' }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />

                  {/* Fill & Send form */}
                  {showFill && extractVars(editContent).length > 0 && (
                    <div className="p-3 rounded-md space-y-2" style={{ background: '#111', border: '1px solid #E8472A30' }}>
                      <p className="text-xs font-medium" style={{ color: '#E8472A' }}>Fill variables</p>
                      {extractVars(editContent).map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <span className="text-xs w-28 flex-shrink-0" style={{ color: '#888' }}>{`{{${v}}}`}</span>
                          <input
                            className="flex-1 text-sm px-2 py-1.5 rounded"
                            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#fff' }}
                            placeholder={v}
                            value={fillVars[v] || ''}
                            onChange={(e) => setFillVars((prev) => ({ ...prev, [v]: e.target.value }))}
                          />
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => sendFilled(p)}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                          style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
                        >
                          <Send size={11} /> Send Filled
                        </button>
                        <button
                          onClick={() => setShowFill(false)}
                          className="text-sm px-3 py-1.5 rounded-md"
                          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                      value={editCat}
                      onChange={(e) => setEditCat(e.target.value)}
                    >
                      {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                        <option key={c} value={c} className="capitalize">{c}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => save(p)}
                      disabled={saving}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                    >
                      <Save size={11} /> Save
                    </button>

                    {extractVars(editContent).length > 0 ? (
                      <button
                        onClick={() => setShowFill((v) => !v)}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                        style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
                      >
                        <Braces size={11} /> Fill &amp; Send
                      </button>
                    ) : null}

                    <button
                      onClick={() => sendRaw(editContent)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                    >
                      <Send size={11} /> Send Raw
                    </button>

                    <button
                      onClick={() => del(p.id)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md ml-auto"
                      style={{ background: '#1A1A1A', border: '1px solid #E0525240', color: '#E05252' }}
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Templates Tab ─────────────────────────────────────────────────────────────

function TemplatesTab({ authToken, toast }) {
  const [templates, setTemplates] = useState([])
  const [starters, setStarters] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showStarterMenu, setShowStarterMenu] = useState(false)
  const starterRef = useRef(null)

  // expanded edit state
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editType, setEditType] = useState('custom')
  const [saving, setSaving] = useState(false)

  // export state
  const [showExport, setShowExport] = useState(false)
  const [exportPath, setExportPath] = useState('')
  const [exporting, setExporting] = useState(false)

  // new template state
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('custom')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const [tr, sr] = await Promise.allSettled([
        fetch('/api/templates', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/templates/starters', { headers: { Authorization: `Bearer ${authToken}` } }),
      ])
      if (tr.status === 'fulfilled' && tr.value.ok) {
        const d = await tr.value.json()
        setTemplates(d.templates || [])
      }
      if (sr.status === 'fulfilled' && sr.value.ok) {
        const d = await sr.value.json()
        setStarters(d.starters || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [authToken]) // eslint-disable-line

  // Close starter dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (starterRef.current && !starterRef.current.contains(e.target)) setShowStarterMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const expand = (t) => {
    if (expandedId === t.id) { setExpandedId(null); return }
    setExpandedId(t.id)
    setEditTitle(t.title)
    setEditContent(t.content)
    setEditType(t.template_type || 'custom')
    setShowExport(false)
    const defPath = t.template_type === 'skill'
      ? `~/.openclaw/workspace/skills/${t.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}/SKILL.md`
      : `~/.openclaw/workspace/${t.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.md`
    setExportPath(defPath)
  }

  const save = async (t) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/templates/${t.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent, template_type: editType }),
      })
      if (!r.ok) return
      toast('Template saved')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const del = async (id) => {
    await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    toast('Template deleted')
    setExpandedId(null)
    await load()
  }

  const doExport = async (t) => {
    setExporting(true)
    try {
      const r = await fetch(`/api/templates/${t.id}/export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: exportPath }),
      })
      if (!r.ok) { const d = await r.json(); toast(`Export failed: ${d.detail}`); return }
      const d = await r.json()
      toast(`Exported to ${d.path}`)
      setShowExport(false)
    } finally {
      setExporting(false)
    }
  }

  const download = (t) => {
    const blob = new Blob([editContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = editTitle.endsWith('.md') ? editTitle : `${editTitle}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fromStarter = (starter) => {
    setNewTitle(starter.title)
    setNewContent(starter.content)
    setNewType(starter.template_type)
    setShowNew(true)
    setShowStarterMenu(false)
  }

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent, template_type: newType }),
      })
      if (!r.ok) return
      toast('Template created')
      setShowNew(false)
      setNewTitle(''); setNewContent(''); setNewType('custom')
      await load()
    } finally {
      setCreating(false)
    }
  }

  const TEMPLATE_TYPES = ['skill', 'readme', 'system_prompt', 'custom']

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowNew((v) => !v)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
        >
          <Plus size={13} /> New Template
        </button>

        {/* From Starter dropdown */}
        <div className="relative" ref={starterRef}>
          <button
            onClick={() => setShowStarterMenu((v) => !v)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
            style={{ background: '#1A1A1A', border: '1px solid #E8472A60', color: '#E8472A' }}
          >
            <Code size={13} /> From Starter <ChevronDown size={11} />
          </button>
          {showStarterMenu && (
            <div
              className="absolute left-0 mt-1 z-20 rounded-md overflow-hidden"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', minWidth: '180px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
            >
              {starters.map((s) => (
                <button
                  key={s.key}
                  onClick={() => fromStarter(s)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm"
                  style={{ color: '#CCC' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#222' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileText size={12} color="#E8472A" />
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
        >
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* New Template form */}
      {showNew && (
        <div className="p-4 rounded-md space-y-3" style={{ background: '#1A1A1A', border: '1px solid #E8472A40' }}>
          <h3 className="text-sm font-semibold text-white">New Template</h3>
          <div className="flex gap-3">
            <input
              className="flex-1 text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
              placeholder="Title (e.g. SKILL.md)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <select
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              {TEMPLATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea
            className="w-full text-sm px-3 py-2 rounded-md font-mono"
            style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff', minHeight: '160px', resize: 'vertical' }}
            placeholder="Markdown content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={creating || !newTitle.trim()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md"
              style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
            >
              <Save size={12} /> Save
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="text-sm px-3 py-2 rounded-md"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#666' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {templates.length === 0 && !showNew && (
        <div className="py-16 text-center" style={{ color: '#444' }}>
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No templates yet — use "From Starter" to begin</p>
        </div>
      )}

      {/* Template cards */}
      <div className="space-y-2">
        {templates.map((t) => {
          const isOpen = expandedId === t.id
          return (
            <div
              key={t.id}
              className="rounded-md overflow-hidden"
              style={{ background: '#1A1A1A', border: `1px solid ${isOpen ? '#E8472A40' : '#2A2A2A'}` }}
            >
              {/* Card header */}
              <button
                onClick={() => expand(t)}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
              >
                <FileText size={14} color="#E8472A" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{t.title}</span>
                    <TypeBadge type={t.template_type || 'custom'} />
                  </div>
                  <p className="text-sm mt-0.5 line-clamp-1" style={{ color: '#666' }}>
                    {t.content?.split('\n').find((l) => l.trim()) || '—'}
                  </p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>{fmtDate(t.created_at)}</span>
                <ChevronDown
                  size={13}
                  style={{ color: '#555', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                />
              </button>

              {/* Expanded body — split editor / preview */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid #222' }}>
                  <div className="flex gap-3 pt-3">
                    <input
                      className="flex-1 text-sm px-3 py-2 rounded-md"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title"
                    />
                    <select
                      className="text-sm px-3 py-2 rounded-md"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                    >
                      {TEMPLATE_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                    </select>
                  </div>

                  {/* Split: editor left, preview right */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <textarea
                      className="text-sm px-3 py-2 rounded-md font-mono"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#DDD', minHeight: '260px', resize: 'vertical' }}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div
                      className="rounded-md px-3 py-2 overflow-auto"
                      style={{ background: '#0D0D0D', border: '1px solid #1E1E1E', minHeight: '260px', maxHeight: '400px' }}
                    >
                      <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: '#AAA', fontFamily: 'inherit', margin: 0 }}>
                        {editContent || <span style={{ color: '#333' }}>Preview will appear here…</span>}
                      </pre>
                    </div>
                  </div>

                  {/* Export form */}
                  {showExport && (
                    <div className="flex gap-2 items-center p-3 rounded-md" style={{ background: '#111', border: '1px solid #2A2A2A' }}>
                      <FolderOpen size={13} color="#888" className="flex-shrink-0" />
                      <input
                        className="flex-1 text-sm px-2 py-1.5 rounded"
                        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#CCC' }}
                        value={exportPath}
                        onChange={(e) => setExportPath(e.target.value)}
                        placeholder="~/.openclaw/workspace/..."
                      />
                      <button
                        onClick={() => doExport(t)}
                        disabled={exporting}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md flex-shrink-0"
                        style={{ background: '#E8472A', color: '#fff', border: '1px solid #E8472A' }}
                      >
                        <FolderOpen size={11} /> Export
                      </button>
                      <button
                        onClick={() => setShowExport(false)}
                        className="flex-shrink-0"
                        style={{ color: '#555' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => save(t)}
                      disabled={saving}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                    >
                      <Save size={11} /> Save
                    </button>
                    <button
                      onClick={() => setShowExport((v) => !v)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                    >
                      <FolderOpen size={11} /> Export to File
                    </button>
                    <button
                      onClick={() => download(t)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
                      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#999' }}
                    >
                      <Download size={11} /> Download
                    </button>
                    <button
                      onClick={() => del(t.id)}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md ml-auto"
                      style={{ background: '#1A1A1A', border: '1px solid #E0525240', color: '#E05252' }}
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Prompts() {
  const { authToken } = useWagzStore()
  const [tab, setTab] = useState('prompts')
  const [toastMsg, setToastMsg] = useState(null)
  const toast = (msg) => setToastMsg(msg)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Prompts &amp; Templates</h1>
        <p className="text-sm mt-0.5" style={{ color: '#999' }}>
          Reusable prompts and markdown templates
        </p>
      </div>

      <HelpBox tab={tab} />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 p-1 rounded-md w-fit" style={{ background: '#111', border: '1px solid #1E1E1E' }}>
        {['prompts', 'templates'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded capitalize transition-colors"
            style={{
              background: tab === t ? '#1A1A1A' : 'transparent',
              color: tab === t ? '#fff' : '#666',
              border: tab === t ? '1px solid #2A2A2A' : '1px solid transparent',
            }}
          >
            {t === 'prompts' ? <Braces size={13} /> : <FileText size={13} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'prompts' && <PromptsTab authToken={authToken} toast={toast} />}
      {tab === 'templates' && <TemplatesTab authToken={authToken} toast={toast} />}

      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
