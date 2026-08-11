import type { PageKey } from '../types'

interface SidebarProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
}

const items: Array<{ key: PageKey; label: string }> = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'new-job', label: 'New Job' },
  { key: 'settings', label: 'Settings' },
]

export function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">SubForge</div>
      <nav>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${page === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
