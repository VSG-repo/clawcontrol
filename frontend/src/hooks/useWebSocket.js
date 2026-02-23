import { useEffect, useRef, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'

const BASE_DELAY = 1000
const MAX_DELAY = 30000
const MAX_RETRIES = 20

export function useWebSocket() {
  const wsRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const retryCountRef = useRef(0)
  const mountedRef = useRef(true)

  const { setWsConnected, setWsRetryCount, applyWsUpdate, authToken } = useWagzStore()

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const token = useWagzStore.getState().authToken
    const url = `ws://localhost:8000/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        retryCountRef.current = 0
        setWsConnected(true)
        setWsRetryCount(0)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(event.data)
          applyWsUpdate(data)
        } catch (e) {
          console.warn('WS parse error:', e)
        }
      }

      ws.onerror = () => {
        // onclose will handle retry
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setWsConnected(false)
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(1.5, retryCountRef.current), MAX_DELAY)
          retryCountRef.current++
          setWsRetryCount(retryCountRef.current)
          retryTimeoutRef.current = setTimeout(connect, delay)
        }
      }
    } catch (e) {
      console.error('WS connect error:', e)
    }
  }, [setWsConnected, setWsRetryCount, applyWsUpdate])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(retryTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])
}
