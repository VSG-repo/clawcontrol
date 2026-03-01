/**
 * Skills Manager — Phase 6
 * Route: /skills
 *
 * Browse workspace skills installed in ~/.openclaw/workspace/skills/
 * and surface links to discover new ones.
 */
import { useState, useEffect, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import {
import { API_BASE } from '@/config'
  Puzzle, ExternalLink, FolderOpen, FileText, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'

const CLAWHUB_URL = 'https://clawhub.com'
const GITHUB_URL  = 'https://github.com/openclaw-skills'
const MISSION_CONTROL_SKILLS = 'http://127.0.0.1:18789/#skills'

// ── Skill card ────────────────────────────────────────────────────────────────

function SkillCard({ skill, authToken }) {
  const [open, setOpen]       = useState(false)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (!open && content === null && skill.has_readme) {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(skill.name)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        const data = await res.json()
        setContent(data.content ?? '')
      } catch {
        setContent('')
      } finally {
        setLoading(false)
      }
    }
    setOpen((v) => !v)
  }, [open, content, skill.name, skill.has_readme, authToken])

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
    >
      {/* Card header — always visible, clickable */}
      <button
        onClick={toggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#1E1E1E')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Puzzle size={16} color="#E8472A" className="flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-semibold text-white">{skill.name}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#E8472A18', color: '#E8472A', border: '1px solid #E8472A30' }}
            >
              {skill.files.length} file{skill.files.length !== 1 ? 's' : ''}
            </span>
            {skill.has_readme && (
              <FileText size={11} color="#555" />
            )}
          </div>
          <p className="text-sm mb-1" style={{ color: '#888' }}>{skill.description}</p>
          <p className="text-xs font-mono" style={{ color: '#444' }}>{skill.path}</p>
        </div>

        <div className="flex-shrink-0 mt-0.5" style={{ color: '#444' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Expanded: SKILL.md content */}
      {open && (
        <div style={{ borderTop: '1px solid #222' }}>
          {loading ? (
            <div className="px-4 py-4 text-sm" style={{ color: '#555' }}>Loading…</div>
          ) : content ? (
            <pre
              className="px-4 py-4 text-sm overflow-x-auto"
              style={{
                color: '#999',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {content}
            </pre>
          ) : (
            <div className="px-4 py-4">
              {/* File list fallback when no SKILL.md */}
              <p className="text-sm mb-2" style={{ color: '#555' }}>No SKILL.md found. Files in this skill:</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.files.map((f) => (
                  <span
                    key={f}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: '#141414', border: '1px solid #2A2A2A', color: '#666', fontFamily: 'monospace' }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Skills() {
  const { authToken } = useWagzStore()

  const [skills, setSkills]   = useState([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/skills`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      setSkills(data.skills ?? [])
      setFetched(true)
    } catch {
      setFetched(true)
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills Manager</h1>
          <p className="text-sm mt-0.5" style={{ color: '#999' }}>
            Browse loaded skills and find new ones
          </p>
        </div>
        <button
          onClick={fetchSkills}
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

      {/* Quick links bar */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg mb-6"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
      >
        <a
          href={CLAWHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{ border: '1px solid #E8472A60', color: '#E8472A', background: '#E8472A0D' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#E8472A1A')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#E8472A0D')}
        >
          <Puzzle size={11} />
          Browse ClawHub
          <ExternalLink size={10} />
        </a>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{ border: '1px solid #2A2A2A', color: '#888', background: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A3A3A'; e.currentTarget.style.color = '#CCC' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.color = '#888' }}
        >
          GitHub Skills
          <ExternalLink size={10} />
        </a>

        <span className="text-sm ml-1" style={{ color: '#333' }}>
          Download skills and place them in{' '}
          <span className="font-mono" style={{ color: '#444' }}>~/.openclaw/workspace/skills/</span>
        </span>
      </div>

      {/* Workspace Skills */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen size={14} color="#E8472A" />
          <h2 className="text-base font-semibold text-white">Workspace Skills</h2>
          {fetched && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555' }}
            >
              {skills.length}
            </span>
          )}
        </div>

        {!fetched && loading ? (
          <div className="text-sm py-6 text-center" style={{ color: '#444' }}>Loading…</div>
        ) : skills.length === 0 ? (
          <div
            className="rounded-lg px-5 py-8 text-center"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
          >
            <Puzzle size={28} color="#2A2A2A" className="mx-auto mb-3" />
            <p className="text-base mb-1" style={{ color: '#444' }}>No workspace skills installed</p>
            <p className="text-sm" style={{ color: '#333' }}>
              Browse ClawHub or GitHub to find skills, then place them in{' '}
              <span className="font-mono">~/.openclaw/workspace/skills/</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {skills.map((skill) => (
              <SkillCard key={skill.name} skill={skill} authToken={authToken} />
            ))}
          </div>
        )}
      </section>

      {/* Built-in Skills */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Puzzle size={14} color="#555" />
          <h2 className="text-base font-semibold" style={{ color: '#888' }}>Built-in Skills</h2>
        </div>

        <div
          className="rounded-lg px-5 py-4"
          style={{ background: '#141414', border: '1px solid #222' }}
        >
          <p className="text-sm mb-3" style={{ color: '#666', lineHeight: '1.6' }}>
            OpenClaw includes <span className="text-white font-semibold">51 built-in skills</span>. These are compiled
            into the gateway and managed via the OpenClaw Mission Control UI.
          </p>
          <a
            href={MISSION_CONTROL_SKILLS}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#888' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3A3A3A'; e.currentTarget.style.color = '#CCC' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.color = '#888' }}
          >
            Open Mission Control
            <ExternalLink size={10} />
          </a>
        </div>
      </section>

    </div>
  )
}
