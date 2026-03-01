import { useEffect, useRef, useCallback } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { useDebugStore } from '@/store/useDebugStore'
import { WS_BASE } from '@/config'

const BASE_DELAY  = 1000   // 1s
const MAX_DELAY   = 30000  // 30s cap
const MAX_RETRIES = 20

export function useWebSocket() {
  const wsRef           = useRef(null)
  const retryTimeoutRef = useRef(null)
  const retryCountRef   = useRef(0)
  const mountedRef      = useRef(true)

  const {
    setWsConnected, setWsRetryCount,
    setWsReconnecting, setWsGaveUp,
    applyWsUpdate,
  } = useWagzStore()

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const token = useWagzStore.getState().authToken
    const url   = `${WS_BASE}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        retryCountRef.current = 0
        setWsConnected(true)
        setWsRetryCount(0)
        setWsReconnecting(false)
        setWsGaveUp(false)
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

        if (retryCountRef.current < MAX_RETRIES) {
          // True exponential doubling: 1s, 2s, 4s, 8s … capped at 30s
          const delay    = Math.min(BASE_DELAY * Math.pow(2, retryCountRef.current), MAX_DELAY)
          const delaySec = (delay / 1000).toFixed(1).replace(/\.0$/, '')
          const attempt  = retryCountRef.current + 1

          useDebugStore.getState().addEntry(
            'warn', 'ws',
            `disconnected — retrying in ${delaySec}s (attempt ${attempt}/${MAX_RETRIES})`
          )

          setWsReconnecting(true)
          retryCountRef.current++
          setWsRetryCount(retryCountRef.current)
          retryTimeoutRef.current = setTimeout(connect, delay)
        } else {
          useDebugStore.getState().addEntry(
            'error', 'ws',
            `gave up after ${MAX_RETRIES} attempts — reload to reconnect`
          )
          setWsReconnecting(false)
          setWsGaveUp(true)
        }
      }
    } catch (e) {
      console.error('WS connect error:', e)
      useDebugStore.getState().addEntry('error', 'ws', 'connect error', e.message)
    }
  }, [setWsConnected, setWsRetryCount, setWsReconnecting, setWsGaveUp, applyWsUpdate])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      // Intentional disconnect (unmount / logout) — suppress all reconnect
      mountedRef.current = false
      clearTimeout(retryTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
      setWsReconnecting(false)
    }
  }, [connect, setWsReconnecting])
}
