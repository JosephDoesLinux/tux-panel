import { Outlet, NavLink } from 'react-router-dom';
import { Monitor, TerminalSquare, HardDrive, Users, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: Monitor, label: 'Dashboard' },
  { to: '/terminal', icon: TerminalSquare, label: 'Terminal' },
  // Phase 2
  // { to: '/users', icon: Users, label: 'Users' },
  // { to: '/shares', icon: HardDrive, label: 'Shares' },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col bg-gray-900 border-r border-gray-800">
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <span className="text-2xl">🐧</span>
          <span className="text-lg font-bold tracking-tight text-white">
            TuxPanel
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-500">
          v0.1.0 · Fedora 43
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-gray-950 p-6">
        <Outlet />
      </main>
    </div>
  );
}
