import { Outlet, NavLink } from 'react-router-dom';
import { Monitor, TerminalSquare, MonitorPlay, LogOut, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const NAV_ITEMS = [
  { to: '/', icon: Monitor, label: 'Dashboard' },
  { to: '/terminal', icon: TerminalSquare, label: 'Terminal' },
  { to: '/rdp', icon: MonitorPlay, label: 'Remote Desktop' },
  // Phase 2
  // { to: '/users', icon: Users, label: 'Users' },
  // { to: '/shares', icon: HardDrive, label: 'Shares' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-screen bg-gb-bg0-hard">
      {/* ── Top Navbar ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 bg-gb-bg0 border-b-2 border-gb-bg2">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐧</span>
          <span className="text-lg font-black tracking-tight text-gb-fg0 uppercase">
            TuxPanel
          </span>
        </div>

        {/* Theme toggle + User + Logout */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 border-2 border-gb-bg3 bg-gb-bg1 text-gb-yellow hover:bg-gb-bg2 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 border-2 border-gb-bg3 bg-gb-bg1">
            <User size={14} className="text-gb-fg4" />
            <span className="text-sm text-gb-fg1 font-bold">
              {user?.username || '—'}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-gb-red-dim bg-gb-bg1 text-gb-red text-sm font-bold uppercase tracking-wide hover:bg-gb-bg2 transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="w-52 flex flex-col bg-gb-bg0 border-r-2 border-gb-bg2">
          {/* Nav links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors border-2 ${
                    isActive
                      ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                      : 'text-gb-fg4 border-transparent hover:text-gb-fg1 hover:bg-gb-bg1 hover:border-gb-bg3'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-4 py-3 border-t-2 border-gb-bg2 text-xs text-gb-bg4 font-mono">
            v0.1.0 · Fedora 43
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-auto bg-gb-bg0-hard p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
