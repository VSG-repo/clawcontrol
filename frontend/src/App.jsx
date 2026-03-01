import { useEffect, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useWagzStore } from '@/store/useWagzStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Overview from '@/pages/Overview'
import Dashboard from '@/pages/Dashboard'
import Logs from '@/pages/Logs'
import Chat from '@/pages/Chat'
import Routing from '@/pages/Routing'
import Keys from '@/pages/Keys'
import Skills from '@/pages/Skills'
import Prompts from '@/pages/Prompts'
import Alerts from '@/pages/Alerts'
import AgentsPage from '@/pages/AgentsPage'
import { API_BASE } from '@/config'

class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('React ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', background: '#0D0D0D',
            color: '#E8E8E8', fontFamily: 'monospace', padding: '2rem', gap: '1.5rem',
          }}
        >
          <div
            style={{
              border: '1px solid #E8472A', borderRadius: '12px',
              padding: '2rem 2.5rem', maxWidth: '560px', width: '100%',
              background: '#1A0A0A', textAlign: 'center',
            }}
          >
            <p style={{ color: '#E8472A', fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem' }}>
              Something went wrong
            </p>
            <p style={{ color: '#999', fontSize: '0.8rem', marginBottom: '1.5rem', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#E8472A', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '0.5rem 1.5rem',
                fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ProtectedApp() {
  useWebSocket()
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/status" element={<Dashboard />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/routing" element={<Routing />} />
        <Route path="/keys" element={<Keys />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  const { isAuthenticated, setAuthenticated } = useWagzStore()

  // Restore session from localStorage, or auto-login on localhost
  useEffect(() => {
    const token = localStorage.getItem('wagz_token')
    if (token) {
      fetch(`${API_BASE}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) setAuthenticated(token)
          else {
            localStorage.removeItem('wagz_token')
            return tryAutoLogin()
          }
        })
        .catch(() => {
          localStorage.removeItem('wagz_token')
          tryAutoLogin()
        })
    } else {
      tryAutoLogin()
    }

    function tryAutoLogin() {
      fetch(`${API_BASE}/auth/auto`)
        .then((res) => {
          if (res.ok) return res.json()
          throw new Error('not localhost')
        })
        .then((data) => {
          if (data.token) {
            localStorage.setItem('wagz_token', data.token)
            setAuthenticated(data.token)
          }
        })
        .catch(() => {/* remote access — show login page */})
    }
  }, [setAuthenticated])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {isAuthenticated ? <ProtectedApp /> : <Login />}
      </BrowserRouter>
    </ErrorBoundary>
  )
}
