import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Monitor, TerminalSquare, MonitorPlay, LogOut, User, Sun, Moon, Power, HardDrive, Cog, Box, Shield, ChevronDown, Wrench, Disc } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TerminalProvider } from '../contexts/TerminalContext';
import AIChatbot from './AIChatbot';
import api from '../lib/api';

const NAV_ITEMS = [
  { to: '/', icon: Monitor, label: 'Dashboard' },
  {
    to: '/disks', icon: HardDrive, label: 'Storage',
    children: [
      { tab: 'shares', label: 'Shares' },
      { tab: 'smb', label: 'SMB Config' },
      { tab: 'nfs', label: 'NFS Config' },
      { tab: 'ftp', label: 'FTP Config' },
      { tab: 'disks', label: 'Disks & Partitions' },
      { tab: 'subvolumes', label: 'Subvolumes' },
      { tab: 'snapshots', label: 'Snapshots' },
      { tab: 'mounts', label: 'Mounts' },
    ],
  },
  {
    to: '/containers', icon: Box, label: 'Containers',
    children: [
      { tab: 'containers', label: 'Docker Containers' },
      { tab: 'images', label: 'Images' },
    ],
  },
  {
    to: '/services', icon: Cog, label: 'Services',
    children: [
      { tab: 'services', label: 'Systemd Units' },
      { tab: 'processes', label: 'Processes' },
      { tab: 'ssh', label: 'SSH Config' },
    ],
  },
  {
    to: '/accounts', icon: Shield, label: 'Security',
    children: [
      { tab: 'users', label: 'Users' },
      { tab: 'groups', label: 'Groups' },
      { tab: 'firewall', label: 'Firewall' },
    ],
  },
  { to: '/terminal', icon: TerminalSquare, label: 'Terminal' },
  { to: '/rdp', icon: MonitorPlay, label: 'Remote Desktop' },
  {
    to: '/troubleshooting', icon: Wrench, label: 'Troubleshoot',
    children: [
      { tab: 'sysinfo', label: 'System Info' },
      { tab: 'logs', label: 'Logs' },
      { tab: 'diagnostics', label: 'Diagnostics' },
      { tab: 'reports', label: 'Reports' },
    ],
  },
];

/* ── Sidebar Navigation with collapsible dropdowns ─────────────── */

function SidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState({});

  // Auto-expand the dropdown for the current route
  useEffect(() => {
    NAV_ITEMS.forEach((item) => {
      if (item.children && location.pathname === item.to) {
        setExpanded((prev) => ({ ...prev, [item.to]: true }));
      }
    });
  }, [location.pathname]);

  function toggleExpand(path) {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const { to, icon: Icon, label, children } = item;
        const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
        const isOpen = expanded[to];

        // Simple nav item (no children)
        if (!children) {
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive: linkActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors border-2 ${
                  linkActive
                    ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                    : 'text-gb-fg4 border-transparent hover:text-gb-fg1 hover:bg-gb-bg1 hover:border-gb-bg3'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          );
        }

        // Dropdown nav item
        const currentTab = new URLSearchParams(location.search).get('tab');

        return (
          <div key={to}>
            {/* Parent button — click toggles expand + navigates */}
            <button
              onClick={() => {
                if (!isActive) {
                  navigate(to);
                  setExpanded((prev) => ({ ...prev, [to]: true }));
                } else {
                  toggleExpand(to);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors border-2 ${
                isActive
                  ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                  : 'text-gb-fg4 border-transparent hover:text-gb-fg1 hover:bg-gb-bg1 hover:border-gb-bg3'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{label}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Sub-items */}
            <div
              className={`overflow-hidden transition-all duration-200 ${
                isOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              {children.map((child) => {
                const isChildActive = isActive && (currentTab === child.tab || (!currentTab && child === children[0]));
                return (
                  <NavLink
                    key={child.tab}
                    to={`${to}?tab=${child.tab}`}
                    className={`flex items-center gap-2 pl-10 pr-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors border-l-2 ml-5 ${
                      isChildActive
                        ? 'text-gb-aqua border-gb-aqua'
                        : 'text-gb-fg4 border-gb-bg3 hover:text-gb-fg2 hover:border-gb-fg4'
                    }`}
                  >
                    {child.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // ── Power menu state ──────────────────────────────────────────
  const [powerOpen, setPowerOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'shutdown' | 'reboot' | null
  const powerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (powerRef.current && !powerRef.current.contains(e.target)) setPowerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function executePower(action) {
    try {
      await api.post(`/api/system/${action}`);
    } catch {
      /* server will drop the connection during shutdown/reboot */
    }
    setConfirmAction(null);
    setPowerOpen(false);
  }

  return (
    <TerminalProvider>
      <div className="flex flex-col h-screen wallpaper-bg">
      {/* ── Top Navbar ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 bg-gb-bg0 glass-panel border-b-2 border-gb-bg2">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐧</span>
          <span className="text-lg font-black tracking-tight text-gb-fg0 uppercase">
            TuxPanel
          </span>
        </div>

        {/* Theme toggle + Power + User + Logout */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 border-2 border-gb-bg3 bg-gb-bg1 text-gb-yellow hover:bg-gb-bg2 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Power button + dropdown */}
          <div className="relative" ref={powerRef}>
            <button
              onClick={() => setPowerOpen((p) => !p)}
              className={`flex items-center justify-center w-9 h-9 border-2 transition-colors ${
                powerOpen
                  ? 'bg-gb-bg2 text-gb-red border-gb-red-dim'
                  : 'bg-gb-bg1 text-gb-fg4 border-gb-bg3 hover:text-gb-red hover:border-gb-red-dim'
              }`}
              title="Power options"
            >
              <Power size={16} />
            </button>

            {powerOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-gb-bg0 border-2 border-gb-bg3 shadow-lg z-50">
                <button
                  onClick={() => { setConfirmAction('shutdown'); setPowerOpen(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-gb-fg1 hover:bg-gb-bg1 hover:text-gb-red transition-colors"
                >
                  <Power size={14} />
                  Shut Down
                </button>
                <button
                  onClick={() => { setConfirmAction('reboot'); setPowerOpen(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-gb-fg1 hover:bg-gb-bg1 hover:text-gb-orange transition-colors border-t-2 border-gb-bg2"
                >
                  <Power size={14} />
                  Reboot
                </button>
              </div>
            )}
          </div>

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

      {/* ── Confirmation Modal ─────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl">
            <h2 className="text-lg font-black text-gb-fg0 uppercase mb-2">
              {confirmAction === 'shutdown' ? 'Shut Down' : 'Reboot'}
            </h2>
            <p className="text-sm text-gb-fg2 mb-6">
              Are you sure you want to{' '}
              <span className="font-bold text-gb-red">
                {confirmAction === 'shutdown' ? 'shut down' : 'reboot'}
              </span>{' '}
              this system? All active sessions will be terminated.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executePower(confirmAction)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-red-dim bg-gb-red text-gb-bg0-hard hover:opacity-90 transition-colors"
              >
                Yes, {confirmAction === 'shutdown' ? 'Shut Down' : 'Reboot'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="w-52 flex flex-col bg-gb-bg0 glass-panel border-r-2 border-gb-bg2">
          {/* Nav links */}
          <SidebarNav />

          {/* Footer */}
          <div className="px-4 py-3 border-t-2 border-gb-bg2 text-xs text-gb-bg4 font-mono">
            v0.1.0 · Fedora 43
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-6 relative">
          <Outlet />
          <AIChatbot />
        </main>
      </div>
    </div>
    </TerminalProvider>
  );
}
