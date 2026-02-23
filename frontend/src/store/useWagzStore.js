import { create } from 'zustand'

export const useWagzStore = create((set, get) => ({
  // WebSocket state
  wsConnected: false,
  wsRetryCount: 0,

  // Gateway status
  gatewayStatus: 'unknown', // 'online' | 'offline' | 'restarting' | 'unknown'
  gatewayUptime: null,
  gatewayRestartCount: null,
  gatewayLastRestart: null,
  gatewayConfigHash: null,

  // Health probe
  lastProbe: null, // { result: 'PASS'|'FAIL', timestamp, latency_ms, consecutive_failures }

  // Active model
  activeModel: null, // { tier, name, latency_p50, latency_p95, queue_depth, tps }
  modelTiers: [],

  // Hardware metrics
  hardware: {
    cpu_percent: 0,
    cpu_temp: 0,
    cpu_throttled: false,
    ram_used_gb: 0,
    ram_total_gb: 0,
    ram_percent: 0,
    disk_percent: 0,
    disk_inode_warning: false,
    net_outbound_mbps: 0,
    net_packet_loss: 0,
    openrouter_reachable: true,
  },

  // Credits
  credits: {
    balance: null,
    burn_1h: null,
    burn_24h: null,
    runway_days: null,
    burn_history_24h: [],
    burn_history_7d: [],
    token_usage_today: 0,
    cost_per_model: {},
    errors: { '401': 0, '429': 0, '5xx': 0 },
    circuit_breaker_active: false,
  },

  // Notifications
  notificationCount: 0,

  // Auth
  isAuthenticated: false,
  authToken: null,

  // Actions
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsRetryCount: (count) => set({ wsRetryCount: count }),
  setAuthenticated: (token) => set({ isAuthenticated: true, authToken: token }),
  clearAuth: () => set({ isAuthenticated: false, authToken: null }),

  applyWsUpdate: (data) => {
    const update = {}
    if (data.gateway) update.gatewayStatus = data.gateway.status
    if (data.gateway?.uptime !== undefined) update.gatewayUptime = data.gateway.uptime
    if (data.gateway?.restart_count !== undefined) update.gatewayRestartCount = data.gateway.restart_count
    if (data.gateway?.last_restart !== undefined) update.gatewayLastRestart = data.gateway.last_restart
    if (data.gateway?.config_hash !== undefined) update.gatewayConfigHash = data.gateway.config_hash
    if (data.probe) update.lastProbe = data.probe
    if (data.model) update.activeModel = data.model
    if (data.tiers) update.modelTiers = data.tiers
    if (data.hardware) update.hardware = { ...get().hardware, ...data.hardware }
    if (data.credits) update.credits = { ...get().credits, ...data.credits }
    if (data.notification_count !== undefined) update.notificationCount = data.notification_count
    set(update)
  },
}))
