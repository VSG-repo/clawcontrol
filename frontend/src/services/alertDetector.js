/**
 * Alert detection — shared between Layout (badge count) and Alerts page (display).
 * All logic runs client-side against existing API endpoints.
 */

export async function detectAlerts(authToken) {
  const headers = { Authorization: `Bearer ${authToken}` }
  const now = Date.now()
  const alerts = []

  const [statusRes, logsRes, creditsRes] = await Promise.allSettled([
    fetch('/api/status',  { headers }),
    fetch('/api/logs?level=ERROR&limit=200', { headers }),
    fetch('/api/credits', { headers }),
  ])

  // ── /api/status ──────────────────────────────────────────────────────────
  if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
    const data = await statusRes.value.json()

    // Gateway offline
    const gw = data.gateway || data.openclaw || data.status
    const gwOk = gw?.status === 'ok' || gw?.status === 'running' || gw?.connected === true
    if (gw && !gwOk) {
      alerts.push({
        id:          'gateway_offline',
        severity:    'critical',
        title:       'Gateway Offline',
        description: 'OpenClaw gateway is not responding. Chat and model routing may be unavailable.',
        ts:          new Date().toISOString(),
      })
    }

    // Health probe failed
    const probe = data.health_probe || data.probe
    if (probe && probe.last_status && probe.last_status !== 'ok' && probe.last_status !== 'pass') {
      alerts.push({
        id:          'probe_failed',
        severity:    'warning',
        title:       'Health Probe Failed',
        description: `Last synthetic health probe returned status: ${probe.last_status}.`,
        ts:          probe.last_checked || new Date().toISOString(),
      })
    }

    // Model health degraded
    const models = data.models || []
    const degraded = models.filter(
      (m) => m.auth_status && m.auth_status !== 'connected' && m.auth_status !== 'ok'
    )
    if (degraded.length > 0) {
      alerts.push({
        id:          'model_health_degraded',
        severity:    'warning',
        title:       `Model Health Degraded (${degraded.length})`,
        description: `${degraded.map((m) => m.name || m.model_id).join(', ')} ${
          degraded.length === 1 ? 'is' : 'are'
        } reporting errors.`,
        ts:          new Date().toISOString(),
      })
    }
  }

  // ── /api/logs ─────────────────────────────────────────────────────────────
  if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
    const data = await logsRes.value.json()
    const entries = data.logs || data.entries || []

    // Error spike: >5 ERROR entries in the last hour
    const oneHourAgo = now - 3600 * 1000
    const recentErrors = entries.filter((e) => {
      const t = e.timestamp || e.ts || e.time
      return t && new Date(t).getTime() > oneHourAgo
    })
    if (recentErrors.length > 5) {
      alerts.push({
        id:          'error_spike',
        severity:    'warning',
        title:       'Error Spike Detected',
        description: `${recentErrors.length} ERROR-level log entries in the last hour.`,
        ts:          new Date().toISOString(),
      })
    }

    // Update available: scan for "update available" in any log message
    const updateLog = entries.find((e) => {
      const msg = (e.message || e.msg || '').toLowerCase()
      return msg.includes('update available') || msg.includes('new version')
    })
    if (updateLog) {
      alerts.push({
        id:          'update_available',
        severity:    'info',
        title:       'OpenClaw Update Available',
        description: updateLog.message || updateLog.msg || 'A new version of OpenClaw may be available.',
        ts:          updateLog.timestamp || updateLog.ts || new Date().toISOString(),
      })
    }
  }

  // ── /api/credits ──────────────────────────────────────────────────────────
  if (creditsRes.status === 'fulfilled' && creditsRes.value.ok) {
    const data = await creditsRes.value.json()
    const balance = data.balance ?? data.credits ?? data.remaining
    if (balance !== undefined && balance !== null && Number(balance) < 1.0) {
      alerts.push({
        id:          'credit_low',
        severity:    'critical',
        title:       'Credit Balance Low',
        description: `OpenRouter balance is $${Number(balance).toFixed(2)} — below the $1.00 threshold.`,
        ts:          new Date().toISOString(),
      })
    }
  }

  return alerts
}
