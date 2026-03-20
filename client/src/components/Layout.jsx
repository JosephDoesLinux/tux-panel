import { useState, useRef, useEffect, useCallback } from 'react';

/* ── Mobile breakpoint hook ────────────────────────────────────── */
function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return mobile;
}
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Monitor, TerminalSquare, MonitorPlay, LogOut, User, Sun, Moon, Power, HardDrive, Cog, Box, Shield, ChevronDown, Wrench, Disc, PanelLeft, Bell, HelpCircle, ExternalLink, X, Github, Trash2, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TerminalProvider } from '../contexts/TerminalContext';
import AIChatbot from './AIChatbot';
import api from '../lib/api';

const GITHUB_REPO = 'https://github.com/JosephDoesLinux/tux-panel';

const NAV_ITEMS = [
  { to: '/', icon: Monitor, label: 'Dashboard' },
  {
    to: '/disks', icon: HardDrive, label: 'Storage',
    children: [
      { tab: 'drives', label: 'Drives' },
      { tab: 'structure', label: 'Structure' },
      { tab: 'mounts', label: 'Mounts' },
      { tab: 'sharing', label: 'Sharing' },
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

function SidebarNav({ onNavigate }) {
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
              onClick={onNavigate}
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
                    onClick={onNavigate}
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

  // ── Responsive: auto-collapse sidebar on mobile ───────────────
  const isMobile = useIsMobile();

  // ── Sidebar toggle state ──────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Close sidebar when switching to mobile
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // ── Host info (fetched once on mount) ─────────────────────────
  const [hostInfo, setHostInfo] = useState(null);
  useEffect(() => {
    api.get('/api/health').then((r) => setHostInfo(r.data)).catch(() => {});
  }, []);

  // ── Notification panel state ──────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('tuxpanel-notifs') || '[]');
    } catch { return []; }
  });
  const notifRef = useRef(null);

  // Persist notifications across navigations
  useEffect(() => {
    sessionStorage.setItem('tuxpanel-notifs', JSON.stringify(notifications));
  }, [notifications]);

  // Push a notification
  const pushNotification = useCallback((type, message) => {
    setNotifications((prev) => [
      { id: Date.now(), type, message, time: new Date().toLocaleTimeString(), read: false },
      ...prev,
    ].slice(0, 50));
  }, []);

  // Add login notification once
  const loginNotifSent = useRef(false);
  useEffect(() => {
    if (user && !loginNotifSent.current) {
      loginNotifSent.current = true;
      pushNotification('success', `Session started as ${user.username}`);
    }
  }, [user, pushNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function clearNotifications() {
    setNotifications([]);
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  // ── Help dropdown state ───────────────────────────────────────
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);

  // ── About dialog state ────────────────────────────────────────
  const [aboutOpen, setAboutOpen] = useState(false);

  // ── Power menu state ──────────────────────────────────────────
  const [powerOpen, setPowerOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'shutdown' | 'reboot' | null
  const powerRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e) {
      if (powerRef.current && !powerRef.current.contains(e.target)) setPowerOpen(false);
      if (helpRef.current && !helpRef.current.contains(e.target)) setHelpOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
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
      <header className="relative z-20 flex items-center justify-between px-3 sm:px-5 py-2 sm:py-3 bg-gb-bg0 glass-panel border-b-2 border-gb-bg2">
        {/* Brand + Sidebar Toggle + System Info */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl sm:text-2xl shrink-0">🐧</span>
          <span className="text-base sm:text-lg font-black tracking-tight text-gb-fg0 uppercase hidden sm:inline shrink-0">
            TuxPanel
          </span>
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="flex items-center justify-center w-9 h-9 shrink-0 border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <PanelLeft size={16} />
          </button>
          {hostInfo && (
            <div className="hidden md:flex items-center gap-2 ml-1 px-3 py-1 bg-gb-bg1/60 border border-gb-bg3 font-mono text-[11px] text-gb-fg4 truncate select-all">
              <span className="text-gb-aqua font-bold">{hostInfo.hostname}</span>
              <span className="text-gb-bg4">·</span>
              <span>{hostInfo.ip}</span>
              <span className="text-gb-bg4">·</span>
              <span className="text-gb-fg4/60 truncate">{hostInfo.kernel}</span>
            </div>
          )}
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen((p) => !p); if (!notifOpen) markAllRead(); }}
              className={`relative flex items-center justify-center w-9 h-9 border-2 transition-colors ${
                notifOpen
                  ? 'bg-gb-bg2 text-gb-aqua border-gb-aqua-dim'
                  : 'bg-gb-bg1 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg2'
              }`}
              title="Notifications"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-gb-red text-gb-bg0-hard text-[10px] font-black flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Help / About */}
          <div className="relative" ref={helpRef}>
            <button
              onClick={() => setHelpOpen((p) => !p)}
              className={`flex items-center justify-center w-9 h-9 border-2 transition-colors ${
                helpOpen
                  ? 'bg-gb-bg2 text-gb-purple border-gb-purple-dim'
                  : 'bg-gb-bg1 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg2'
              }`}
              title="Help & Info"
            >
              <HelpCircle size={16} />
            </button>

            {helpOpen && (
              <div className="absolute right-0 top-full w-48 bg-gb-bg0 border-2 border-gb-bg3 shadow-lg z-50">
                <a
                  href={`${GITHUB_REPO}/blob/main/docs/DOCUMENTATION.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-gb-fg1 hover:bg-gb-bg1 hover:text-gb-aqua transition-colors"
                >
                  <ExternalLink size={14} />
                  Documentation
                </a>
                <button
                  onClick={() => { setAboutOpen(true); setHelpOpen(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-gb-fg1 hover:bg-gb-bg1 hover:text-gb-purple transition-colors border-t-2 border-gb-bg2"
                >
                  <HelpCircle size={14} />
                  About TuxPanel
                </button>
              </div>
            )}
          </div>

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
              <div className="absolute right-0 top-full w-44 bg-gb-bg0 border-2 border-gb-bg3 shadow-lg z-50">
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

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border-2 border-gb-bg3 bg-gb-bg1">
            <User size={14} className="text-gb-fg4" />
            <span className="text-sm text-gb-fg1 font-bold">
              {user?.username || '—'}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 border-2 border-gb-red-dim bg-gb-bg1 text-gb-red text-xs sm:text-sm font-bold uppercase tracking-wide hover:bg-gb-bg2 transition-colors"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
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

      {/* ── About Dialog ──────────────────────────────────── */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl relative">
            <button
              onClick={() => setAboutOpen(false)}
              className="absolute top-3 right-3 text-gb-fg4 hover:text-gb-fg1 transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🐧</span>
              <h2 className="text-lg font-black text-gb-fg0 uppercase">TuxPanel</h2>
            </div>
            <p className="text-sm text-gb-fg2 mb-1">Version 1.0.3</p>
            <p className="text-sm text-gb-fg2 mb-4">
              A modern Linux server management panel with a neobrutalist Gruvbox aesthetic.
            </p>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-gb-aqua hover:text-gb-green transition-colors mb-4"
            >
              <Github size={16} />
              {GITHUB_REPO.replace('https://', '')}
            </a>
            <div className="border-t-2 border-gb-bg2 pt-4">
              <p className="text-xs text-gb-fg4 font-bold uppercase tracking-wide mb-1">Created by</p>
              <p className="text-sm text-gb-fg2 mb-3">Joseph Abou Antoun, Merheb Merheb</p>
              <p className="text-xs text-gb-fg4 font-bold uppercase tracking-wide mb-1">Open Source</p>
              <p className="text-sm text-gb-fg2">Licensed under MIT. Contributions welcome.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Mobile sidebar overlay ────────────────────────────── */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside
          className={`flex flex-col bg-gb-bg0 glass-panel border-r-2 border-gb-bg2 transition-all duration-200 overflow-hidden shrink-0 ${
            isMobile
              ? `fixed top-0 left-0 bottom-0 z-40 w-52 transform transition-transform duration-200 ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : sidebarOpen ? 'w-52' : 'w-0 border-r-0'
          }`}
        >
          <SidebarNav onNavigate={() => { if (isMobile) setSidebarOpen(false); }} />
          <div className="px-4 py-3 border-t-2 border-gb-bg2 text-xs text-gb-bg4 font-mono whitespace-nowrap">
            v1.0.3{hostInfo ? ` · ${hostInfo.hostname}` : ''}
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-3 sm:p-6 relative">
          <Outlet />
          {hostInfo?.aiEnabled && <AIChatbot />}
        </main>

        {/* ── Notification Sidebar ─────────────────────────────── */}
        <aside
          className={`absolute top-4 right-4 flex flex-col bg-gb-bg0 glass-panel border-2 border-gb-bg2 shadow-2xl transition-all duration-300 z-50 overflow-hidden ${
            notifOpen
              ? 'w-72 sm:w-80 opacity-100 max-h-[85vh] translate-y-0 translate-x-0'
              : 'w-72 sm:w-80 opacity-0 max-h-[85vh] -translate-y-4 translate-x-4 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2 shrink-0 bg-gb-bg1/50 backdrop-blur-sm">
            <h2 className="text-sm font-black text-gb-fg0 uppercase tracking-wide">Events</h2>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="text-gb-fg4 hover:text-gb-red transition-colors p-1"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setNotifOpen(false)}
                className="text-gb-fg4 hover:text-gb-fg1 transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Bell size={24} className="text-gb-bg3 mb-2" />
                <p className="text-sm text-gb-fg4">No events yet</p>
                <p className="text-xs text-gb-bg4 mt-1">System events will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-gb-bg2">
                {notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 text-xs ${n.read ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-2">
                      {n.type === 'success' && <CheckCircle2 size={13} className="text-gb-green mt-0.5 shrink-0" />}
                      {n.type === 'error' && <AlertTriangle size={13} className="text-gb-red mt-0.5 shrink-0" />}
                      {n.type === 'warning' && <AlertTriangle size={13} className="text-gb-yellow mt-0.5 shrink-0" />}
                      {n.type === 'info' && <Info size={13} className="text-gb-blue mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-gb-fg2 leading-snug wrap-break-word">{n.message}</p>
                        <p className="text-gb-bg4 mt-0.5 font-mono">{n.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </TerminalProvider>
  );
}
