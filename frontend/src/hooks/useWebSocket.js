import { useEffect, useRef, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { useDebugStore } from '@/store/useDebugStore'
import { WS_BASE } from '@/config'

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
    const url = `${WS_BASE}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        retryCountRef.current = 0
        setWsConnected(true)
        setWsRetryCount(0)
        useDebugStore.getState().addEntry('success', 'ws', 'connected')
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(event.data)
          applyWsUpdate(data)
        } catch (e) {
          console.warn('WS parse error:', e)
          useDebugStore.getState().addEntry('warn', 'ws', 'parse error', e.message)
        }
      }

      ws.onerror = () => {
        useDebugStore.getState().addEntry('error', 'ws', 'socket error')
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setWsConnected(false)
        useDebugStore.getState().addEntry('warn', 'ws', `disconnected (retry ${retryCountRef.current + 1}/${MAX_RETRIES})`)
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(1.5, retryCountRef.current), MAX_DELAY)
          retryCountRef.current++
          setWsRetryCount(retryCountRef.current)
          retryTimeoutRef.current = setTimeout(connect, delay)
        }
      }
    } catch (e) {
      console.error('WS connect error:', e)
      useDebugStore.getState().addEntry('error', 'ws', 'connect error', e.message)
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
