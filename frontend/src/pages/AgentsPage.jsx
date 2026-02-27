import { useState } from 'react'
import { Bot } from 'lucide-react'
import FleetTab from '@/components/agents/FleetTab'
import OrdersTab from '@/components/agents/OrdersTab'
import CronTab from '@/components/agents/CronTab'

const TABS = [
  { id: 'fleet',  label: 'Fleet'  },
  { id: 'orders', label: 'Orders' },
  { id: 'cron',   label: 'Cron'   },
]

export default function AgentsPage() {
  const [tab, setTab] = useState('fleet')

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Agents Factory</h1>
        <p className="text-sm mt-0.5" style={{ color: '#999' }}>
          Create, manage, and orchestrate your agent fleet
        </p>
      </div>

      {/* Sub-tab pills */}
      <div className="flex gap-1 mb-6 p-1 rounded-md w-fit" style={{ background: '#111', border: '1px solid #1E1E1E' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm px-4 py-1.5 rounded transition-colors"
            style={{
              background: tab === t.id ? '#1A1A1A' : 'transparent',
              color:      tab === t.id ? '#fff'    : '#666',
              border:     tab === t.id ? '1px solid #E8472A40' : '1px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'fleet'  && <FleetTab  />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'cron'   && <CronTab   />}
    </div>
  )
}
