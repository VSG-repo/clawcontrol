/**
 * useChat — manages chat session state and SSE streaming.
 *
 * Each SSE event from /api/chat/send:
 *   {type: "start",  id, request_id, model_id, model, requested_model_id, failover, failover_from}
 *   {type: "chunk",  id, delta}
 *   {type: "done",   id, request_id, model_id, failover, failover_from, finish_reason,
 *                    token_estimate, prompt_tokens, completion_tokens, cost_estimate_usd, latency_ms}
 *   {type: "error",  message, detail?}
 */
import { useState, useCallback, useRef } from 'react'
import { useWagzStore } from '@/store/useWagzStore'
import { useDebugStore } from '@/store/useDebugStore'

function makeUserMsg(text, attachments = []) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    attachments,
    ts: new Date().toISOString(),
    status: 'done',
  }
}

function makeAssistantMsg(requestId) {
  return {
    id: requestId,
    role: 'assistant',
    content: '',
    ts: new Date().toISOString(),
    status: 'streaming',
    model: null,
    model_id: null,
    tier: null,
    requested_model_id: null,
    failover: false,
    failover_from: null,
    latency_ms: null,
    token_estimate: null,
    prompt_tokens: null,
    completion_tokens: null,
    cost_estimate: null,
    finish_reason: null,
    request_id: requestId,
  }
}

export function useChat() {
  const { authToken } = useWagzStore()

  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionCost, setSessionCost] = useState(0)
  const [sessionTokens, setSessionTokens] = useState(0)
  const [contextId, setContextId] = useState(null)
  const [selectedModel, setSelectedModel] = useState(null)

  const abortRef = useRef(null)

  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
  }, [])

  /**
   * Send a message. Generates contextId synchronously if none exists.
   * Returns the contextId used (for session tracking in the caller).
   */
  const send = useCallback(
    async (text, opts = {}) => {
      if ((!text.trim() && (!opts.attachments || opts.attachments.length === 0)) || isStreaming) return null

      // Generate contextId synchronously so session can be created before response
      const effectiveContextId = (opts.newThread || !contextId)
        ? crypto.randomUUID()
        : contextId

      if (effectiveContextId !== contextId) {
        setContextId(effectiveContextId)
      }

      const userMsg = makeUserMsg(text, opts.attachments ?? [])
      const requestId = crypto.randomUUID()
      const assistantMsg = makeAssistantMsg(requestId)

      setMessages((prev) => [
        ...(opts.newThread ? [] : prev),
        userMsg,
        assistantMsg,
      ])
      setIsStreaming(true)

      const body = {
        message: text,
        context_id: effectiveContextId,
        model_id: selectedModel,
        new_thread: opts.newThread ?? false,
        attachments: opts.attachments ?? [],
      }

      abortRef.current = new AbortController()
      try {
        const resp = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        })

        if (!resp.ok) {
          const errText = await resp.text()
          patchMessage(requestId, { status: 'error', content: `HTTP ${resp.status}: ${errText}` })
          setIsStreaming(false)
          return effectiveContextId
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue
            try {
              const event = JSON.parse(raw)
              handleEvent(event, requestId)
            } catch (parseErr) {
              console.error('Stream chunk error:', parseErr)
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // Keep partial content, mark as done
          patchMessage(requestId, { status: 'done' })
        } else {
          console.error('Stream error:', err)
          patchMessage(requestId, {
            status: 'error',
            content: `Stream error: ${err.message}`,
          })
        }
      } finally {
        setIsStreaming(false)
      }

      return effectiveContextId
    },
    [authToken, contextId, isStreaming, selectedModel, patchMessage]
  )

  function handleEvent(event, requestId) {
    const dbg = useDebugStore.getState()
    switch (event.type) {
      case 'start':
        dbg.addEntry('info', 'sse', `start → model: ${event.model ?? '?'}${event.failover ? ` (failover from ${event.failover_from})` : ''}${event.auto_switched ? ` (auto-switched from ${event.auto_switched_from})` : ''}`)
        patchMessage(requestId, {
          id: event.id || requestId,
          model: event.model,
          model_id: event.model_id,
          requested_model_id: event.requested_model_id,
          failover: event.failover,
          failover_from: event.failover_from,
          status: 'streaming',
        })
        if (event.id && event.id !== requestId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === requestId ? { ...m, id: event.id } : m))
          )
        }
        break

      case 'chunk':
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === (event.id || requestId)) {
              return { ...m, content: m.content + event.delta }
            }
            return m
          })
        )
        break

      case 'done':
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === (event.id || requestId)) {
              return {
                ...m,
                status: 'done',
                model_id: event.model_id,
                failover: event.failover,
                failover_from: event.failover_from,
                finish_reason: event.finish_reason,
                latency_ms: event.latency_ms,
                token_estimate: event.token_estimate,
                prompt_tokens: event.prompt_tokens,
                completion_tokens: event.completion_tokens,
                cost_estimate: event.cost_estimate_usd,
                request_id: event.request_id,
              }
            }
            return m
          })
        )
        setSessionCost((c) => c + (event.cost_estimate_usd ?? 0))
        setSessionTokens((t) => t + (event.token_estimate ?? 0))
        dbg.addEntry('success', 'sse', `done — ${event.token_estimate ?? 0} tok, $${(event.cost_estimate_usd ?? 0).toFixed(6)}, ${event.latency_ms ?? 0}ms`)
        break

      case 'error':
        dbg.addEntry('error', 'sse', `error: ${event.message}`, event.detail ?? null)
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === requestId) {
              return { ...m, status: 'error', content: event.message }
            }
            return m
          })
        )
        break

      default:
        break
    }
  }

  /** Load a saved session into the active chat state. */
  const loadSession = useCallback((sessionMessages, sessionContextId) => {
    setMessages(sessionMessages ?? [])
    setContextId(sessionContextId ?? null)
    setSessionCost(0)
    setSessionTokens(0)
  }, [])

  const newThread = useCallback(() => {
    setMessages([])
    setContextId(null)
    setSessionCost(0)
    setSessionTokens(0)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    messages,
    isStreaming,
    sessionCost,
    sessionTokens,
    contextId,
    selectedModel,
    setSelectedModel,
    send,
    stop,
    newThread,
    loadSession,
  }
}
