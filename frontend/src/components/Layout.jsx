import { useState, useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useWagzStore } from '@/store/useWagzStore'
import { useDebugStore } from '@/store/useDebugStore'
import { detectAlerts } from '@/services/alertDetector'
import {
  Activity, MessageSquare, Cpu, Key, Puzzle,
  BookOpen, ScrollText, LogOut, Wifi, WifiOff, Menu,
  Pin, ChevronDown, MoreHorizontal, Pencil, Trash2, LayoutDashboard, Bell, Bot, Bug,
} from 'lucide-react'
import NotificationPanel from '@/components/NotificationPanel'
import ClawControlLogo from '@/components/ClawControlLogo'
import DebugPanel from '@/components/DebugPanel'
import { useSessionStore } from '@/store/useSessionStore'

function formatAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000
  if (diff < 60)         return 'just now'
  if (diff < 3600)       return `${Math.round(diff / 60)}m ago`
  if (diff < 86400)      return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7)  return `${Math.round(diff / 86400)}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/status', label: 'Status', icon: Activity },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/routing', label: 'Routing', icon: Cpu },
  { to: '/keys', label: 'Keys', icon: Key },
  { to: '/skills', label: 'Skills', icon: Puzzle },
  { to: '/prompts', label: 'Prompts', icon: BookOpen },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/alerts', label: 'Alerts', icon: Bell },
]

const DISMISSED_KEY = 'clawcontrol_dismissed_alerts'
function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) }
  catch { return new Set() }
}

export default function Layout({ children }) {
  const { wsConnected, wsReconnecting, wsGaveUp, clearAuth, authToken } = useWagzStore()
  const toggleDebug = useDebugStore((s) => s.toggle)
  const debugOpen = useDebugStore((s) => s.open)
  const location = useLocation()
  const isChatRoute = location.pathname === '/chat'

  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const togglePin = useSessionStore((s) => s.togglePin)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const updateSession = useSessionStore((s) => s.updateSession)

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const [chatsOpen, setChatsOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [renamingId, setRenamingId] = useState(null)
  const [alertCount, setAlertCount] = useState(0)
  const [renameValue, setRenameValue] = useState('')

  const refreshAlertCount = useCallback(async () => {
    if (!authToken) return
    try {
      const alerts = await detectAlerts(authToken)
      const dismissed = loadDismissed()
      setAlertCount(alerts.filter((a) => !dismissed.has(a.id)).length)
    } catch { /* silent — badge just stays at previous value */ }
  }, [authToken])

  useEffect(() => {
    refreshAlertCount()
    const id = setInterval(refreshAlertCount, 60000)
    return () => clearInterval(id)
  }, [refreshAlertCount])

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed)
  }, [collapsed])

  const handleLogout = () => {
    localStorage.removeItem('wagz_token')
    clearAuth()
  }

  const toggle = () => setCollapsed((v) => !v)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0D0D0D' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0"
        style={{
          width: collapsed ? '56px' : '180px',
          transition: 'width 0.18s ease',
          background: '#111111',
          borderRight: '1px solid #1E1E1E',
          overflow: 'hidden',
        }}
      >
        {/* Header / toggle row */}
        <div
          className="flex items-center border-b flex-shrink-0"
          style={{
            borderColor: '#1E1E1E',
            padding: collapsed ? '11px 0' : '11px 8px 11px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : '7px',
            minHeight: '46px',
          }}
        >
          {!collapsed && (
            <span
              className="font-bold truncate"
              style={{ minWidth: 0, fontSize: '16px', letterSpacing: '-0.01em', color: '#E8472A' }}
            >
              ClawControl
            </span>
          )}

          {/* Collapse toggle — always visible */}
          <button
            onClick={toggle}
            className="flex-shrink-0 flex items-center justify-center rounded-md transition-colors"
            style={{
              color: '#444',
              marginLeft: collapsed ? 0 : 'auto',
              width: '22px',
              height: '22px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = '#1A1A1A' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#444'; e.currentTarget.style.background = 'transparent' }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 overflow-hidden flex flex-col" aria-label="Main navigation">
          <div className="space-y-0.5">
            {NAV.map(({ to, label, icon: Icon, disabled }) => {
              if (disabled) {
                return (
                  <div
                    key={to}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-md cursor-not-allowed"
                    style={{ color: '#444444', justifyContent: collapsed ? 'center' : 'flex-start' }}
                    title={label}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    {!collapsed && <span className="text-base truncate">{label}</span>}
                  </div>
                )
              }

              // Chat item: NavLink + inline expand arrow (when sidebar expanded)
              if (to === '/chat') {
                return (
                  <div key={to}>
                    <div
                      className="flex items-center rounded-md"
                      style={{ background: isChatRoute ? '#1A1A1A' : 'transparent' }}
                    >
                      <NavLink
                        to={to}
                        className="flex items-center gap-2.5 px-2 py-2 text-base flex-1 min-w-0"
                        style={{ color: isChatRoute ? '#FFFFFF' : '#999999', fontWeight: isChatRoute ? 500 : 400 }}
                        title={label}
                        onMouseEnter={(e) => { if (!isChatRoute) e.currentTarget.style.color = '#CCCCCC' }}
                        onMouseLeave={(e) => { if (!isChatRoute) e.currentTarget.style.color = '#999999' }}
                      >
                        <Icon size={16} className="flex-shrink-0" />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </NavLink>

                      {!collapsed && (
                        <button
                          onClick={() => setChatsOpen((v) => !v)}
                          className="flex-shrink-0 flex items-center justify-center"
                          style={{ width: '28px', height: '32px', color: isChatRoute ? '#FFFFFF' : '#999999' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = isChatRoute ? '#FFFFFF' : '#CCCCCC')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = isChatRoute ? '#FFFFFF' : '#999999')}
                          title={chatsOpen ? 'Collapse sessions' : 'Expand sessions'}
                        >
                          <ChevronDown
                            size={13}
                            style={{
                              transform: chatsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                              transition: 'transform 0.15s ease',
                            }}
                          />
                        </button>
                      )}
                    </div>

                    {/* Session list — inline below Chat, no label */}
                    {!collapsed && chatsOpen && (
                      <>
                        <div className="overflow-y-auto" style={{ maxHeight: '240px', marginLeft: '8px' }}>
                          {sessions.length === 0 ? (
                            <p className="px-2 py-2 text-xs" style={{ color: '#2A2A2A' }}>
                              No sessions yet
                            </p>
                          ) : (
                            sessions.map((session) => {
                              const isActive = session.id === activeId
                              const isMenuOpen = menuOpenId === session.id
                              const isRenaming = renamingId === session.id
                              const showDots = (hoveredId === session.id || isMenuOpen) && !isRenaming

                              return (
                                <div
                                  key={session.id}
                                  className="rounded flex items-center"
                                  style={{
                                    background: isActive ? '#E8472A0D' : 'transparent',
                                    borderLeft: `2px solid ${isActive ? '#E8472A' : 'transparent'}`,
                                  }}
                                  onMouseEnter={() => setHoveredId(session.id)}
                                  onMouseLeave={() => setHoveredId(null)}
                                >
                                  {/* Clickable title area */}
                                  <button
                                    onClick={() => {
                                      if (isRenaming) return
                                      window.dispatchEvent(
                                        new CustomEvent('clawcontrol:load-session', { detail: session })
                                      )
                                    }}
                                    className="flex-1 min-w-0 text-left"
                                    style={{ padding: '5px 4px 5px', paddingLeft: isActive ? '6px' : '6px' }}
                                  >
                                    {isRenaming ? (
                                      <input
                                        autoFocus
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => {
                                          const title = renameValue.trim()
                                          if (title) updateSession(session.id, { title })
                                          setRenamingId(null)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const title = renameValue.trim()
                                            if (title) updateSession(session.id, { title })
                                            setRenamingId(null)
                                          } else if (e.key === 'Escape') {
                                            setRenamingId(null)
                                          }
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent text-xs outline-none"
                                        style={{ color: '#CCC', borderBottom: '1px solid #444' }}
                                      />
                                    ) : (
                                      <p
                                        className="text-xs leading-snug"
                                        style={{
                                          color: isActive ? '#CCC' : '#666',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        {session.title || 'New conversation'}
                                      </p>
                                    )}
                                    {!isRenaming && (
                                      <p className="text-xs mt-0.5" style={{ color: '#333' }}>
                                        {formatAgo(session.ts)}
                                      </p>
                                    )}
                                  </button>

                                  {/* Pin indicator (no menu open) */}
                                  {session.pinned && !showDots && (
                                    <Pin size={9} color="#E8472A" fill="#E8472A" style={{ flexShrink: 0, marginRight: '5px' }} />
                                  )}

                                  {/* 3-dot menu trigger */}
                                  {showDots && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (isMenuOpen) {
                                          setMenuOpenId(null)
                                          return
                                        }
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        setMenuPos({ top: rect.bottom + 4, left: rect.left - 80 })
                                        setMenuOpenId(session.id)
                                      }}
                                      className="flex-shrink-0 flex items-center justify-center rounded"
                                      style={{ width: '20px', height: '20px', color: isMenuOpen ? '#CCC' : '#555', marginRight: '3px' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.color = '#CCC')}
                                      onMouseLeave={(e) => (e.currentTarget.style.color = isMenuOpen ? '#CCC' : '#555')}
                                      title="More options"
                                    >
                                      <MoreHorizontal size={12} />
                                    </button>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>

                        {/* 3-dot dropdown — fixed to avoid overflow clipping */}
                        {menuOpenId && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                            <div
                              style={{
                                position: 'fixed',
                                top: menuPos.top,
                                left: menuPos.left,
                                zIndex: 50,
                                background: '#1A1A1A',
                                border: '1px solid #2A2A2A',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                                minWidth: '130px',
                              }}
                            >
                              {/* Rename */}
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ color: '#888' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#CCC' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
                                onClick={() => {
                                  const s = sessions.find((s) => s.id === menuOpenId)
                                  if (s) { setRenameValue(s.title || ''); setRenamingId(s.id) }
                                  setMenuOpenId(null)
                                }}
                              >
                                <Pencil size={11} />
                                Rename
                              </button>

                              {/* Pin / Unpin */}
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ color: '#888' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#CCC' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
                                onClick={() => { togglePin(menuOpenId); setMenuOpenId(null) }}
                              >
                                <Pin size={11} />
                                {sessions.find((s) => s.id === menuOpenId)?.pinned ? 'Unpin chat' : 'Pin chat'}
                              </button>

                              {/* Delete */}
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ color: '#E05252' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#E0525215' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                onClick={() => { deleteSession(menuOpenId); setMenuOpenId(null) }}
                              >
                                <Trash2 size={11} />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )
              }

              // All other enabled nav items
              const badge = to === '/alerts' && alertCount > 0 ? alertCount : null
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-2 rounded-md text-base transition-colors ${
                      isActive ? 'text-white font-medium' : ''
                    }`
                  }
                  style={({ isActive }) => ({
                    background: isActive ? '#1A1A1A' : 'transparent',
                    color: isActive ? '#FFFFFF' : '#999999',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  })}
                  title={label}
                  onMouseEnter={(e) => { if (e.currentTarget.style.color !== 'rgb(255, 255, 255)') e.currentTarget.style.color = '#CCCCCC' }}
                  onMouseLeave={(e) => { if (e.currentTarget.style.color !== 'rgb(255, 255, 255)') e.currentTarget.style.color = '#999999' }}
                >
                  <div className="relative flex-shrink-0">
                    <Icon size={16} />
                    {badge && collapsed && (
                      <span
                        className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white"
                        style={{ background: '#E05252', fontSize: '9px', minWidth: '14px', height: '14px', padding: '0 3px' }}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                  {!collapsed && <span className="truncate flex-1">{label}</span>}
                  {!collapsed && badge && (
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full text-white ml-auto"
                      style={{ background: '#E05252', fontSize: '10px', minWidth: '18px', height: '18px', padding: '0 4px' }}
                    >
                      {badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>

          {/* ClawControl icon — fills remaining nav space */}
          <div className="flex-1 flex items-center justify-center" style={{ marginBottom: '25px' }}>
            <img
              src="/clawcontrol-icon.png"
              alt="ClawControl"
              style={{
                width:        collapsed ? '40px' : '100px',
                height:       collapsed ? '40px' : '100px',
                objectFit:    'cover',
                borderRadius: '50%',
                transition:   'width 0.18s ease, height 0.18s ease',
                flexShrink:   0,
              }}
            />
          </div>
        </nav>

        {/* Footer */}
        <div className="p-2 border-t flex-shrink-0" style={{ borderColor: '#1E1E1E' }}>
          {/* WS status */}
          <div
            className="flex items-center gap-2 px-2 py-1.5"
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            title={wsConnected ? 'WebSocket live' : wsReconnecting ? 'WebSocket reconnecting…' : 'WebSocket disconnected'}
            aria-live="polite"
            aria-atomic="true"
            aria-label={wsConnected ? 'WebSocket live' : wsReconnecting ? 'WebSocket reconnecting' : 'WebSocket disconnected'}
          >
            {wsConnected
              ? <Wifi size={13} color="#E8472A" />
              : <WifiOff size={13} color={wsReconnecting ? '#E0A020' : '#E05252'} />}
            {!collapsed && (
              <span className="text-xs" style={{ color: wsConnected ? '#E8472A' : wsReconnecting ? '#E0A020' : '#E05252' }}>
                {wsConnected ? 'Live' : wsReconnecting ? 'Reconnecting…' : 'Disconnected'}
              </span>
            )}
          </div>

          {/* Debug toggle */}
          <button
            onClick={toggleDebug}
            className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors"
            style={{
              color: debugOpen ? '#E8472A' : '#555555',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#E8472A' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = debugOpen ? '#E8472A' : '#555555' }}
            title="Toggle debug console"
            aria-label="Toggle debug console"
            aria-pressed={debugOpen}
          >
            <Bug size={14} className="flex-shrink-0" />
            {!collapsed && <span className="text-xs">Debug</span>}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-sm transition-colors"
            style={{
              color: '#666666',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#E05252' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#666666' }}
            title="Logout"
            aria-label="Log out"
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0" style={{ background: '#0D0D0D' }}>
        {children}
      </main>

      {/* Debug panel — fixed overlay, manages its own open state */}
      <DebugPanel />

      {/* WS gave-up toast */}
      {wsGaveUp && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm"
          style={{ background: '#1A0A0A', border: '1px solid #E0525250', color: '#E05252', boxShadow: '0 4px 24px rgba(0,0,0,0.7)' }}
        >
          WebSocket disconnected. Reload to reconnect.
          <button
            onClick={() => window.location.reload()}
            className="px-2.5 py-1 rounded text-xs font-medium"
            style={{ background: '#E0525225', border: '1px solid #E0525240' }}
          >
            Reload
          </button>
        </div>
      )}
    </div>
  )
}
