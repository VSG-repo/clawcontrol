import { useEffect } from 'react'
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  const { isAuthenticated, setAuthenticated } = useWagzStore()

  // Restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('wagz_token')
    if (token) {
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) setAuthenticated(token)
          else localStorage.removeItem('wagz_token')
        })
        .catch(() => localStorage.removeItem('wagz_token'))
    }
  }, [setAuthenticated])

  return (
    <BrowserRouter>
      {isAuthenticated ? <ProtectedApp /> : <Login />}
    </BrowserRouter>
  )
}
