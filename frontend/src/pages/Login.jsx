import { useState } from 'react'
import { useWagzStore } from '@/store/useWagzStore'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuthenticated = useWagzStore((s) => s.setAuthenticated)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const data = await res.json()
        setAuthenticated(data.token)
        localStorage.setItem('wagz_token', data.token)
      } else {
        setError('Invalid password')
      }
    } catch {
      setError('Cannot reach backend')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D0D0D' }}>
      <div
        className="w-full max-w-sm p-8"
        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
      >
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src="/icon-192.png" alt="ClawControl" style={{ width: 54, height: 54, borderRadius: '12px' }} />
          <div className="text-center">
            <div
              className="font-bold text-white tracking-tight"
              style={{ fontSize: '20px', letterSpacing: '-0.01em' }}
            >
              ClawControl
            </div>
            <div className="text-xs mt-1" style={{ color: '#555' }}>
              Authentication Required
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#999999' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{
                background: '#0D0D0D',
                border: '1px solid #2A2A2A',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '8px 12px',
                width: '100%',
                fontSize: '14px',
                outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#E8472A' }}
              onBlur={(e) => { e.target.style.borderColor = '#2A2A2A' }}
            />
          </div>

          {error && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: '#E0525220', color: '#E05252', border: '1px solid #E0525240' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '9px',
              borderRadius: '6px',
              background: loading || !password ? '#3A1A10' : '#E8472A',
              color: loading || !password ? '#E8472A80' : '#FFFFFF',
              fontWeight: '600',
              fontSize: '14px',
              border: 'none',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Authenticating...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
