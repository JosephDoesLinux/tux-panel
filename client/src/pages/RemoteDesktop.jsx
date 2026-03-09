import { useEffect, useRef, useState, useCallback } from 'react';
import KeyTable from '@novnc/novnc/core/input/keysym';
import {
  MonitorPlay,
  Maximize,
  Minimize,
  Clipboard,
  Keyboard,
  Settings,
  Power,
  Loader2,
  AlertCircle,
  RefreshCw,
  Monitor,
  Network,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  Scaling,
  MousePointerClick,
  Zap,
  Plus,
  Play,
  Square,
  Server,
  Container,
  User,
  Wifi,
} from 'lucide-react';
import api from '../lib/api';
import useRemoteDesktop, { CONN } from '../hooks/useRemoteDesktop';

/* ═══════════════════════════════════════════════════════════════════
   Remote Desktop Orchestrator
   ═══════════════════════════════════════════════════════════════════ */

const POLL_INTERVAL = 12_000;
const RESOLUTIONS = ['1920x1080', '1600x900', '1440x900', '1280x1024', '1280x720', '1024x768'];

export default function RemoteDesktop() {
  /* ── Discovery state ─────────────────────────────────────────── */
  const [discovery, setDiscovery] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState(null);
  const pollRef = useRef(null);

  /* ── Managed sessions ────────────────────────────────────────── */
  const [managedSessions, setManagedSessions] = useState([]);

  /* ── Spawn modal ─────────────────────────────────────────────── */
  const [showSpawnModal, setShowSpawnModal] = useState(false);

  /* ── Password prompt ─────────────────────────────────────────── */
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [activeBridgeId, setActiveBridgeId] = useState(null);

  /* ── Connection hook ─────────────────────────────────────────── */
  const rd = useRemoteDesktop();
  const displayRef = useRef(null);
  const containerRef = useRef(null);

  /* ── Toolbar overlay ─────────────────────────────────────────── */
  const [openDropdown, setOpenDropdown] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef(null);

  /* ── Clipboard local ─────────────────────────────────────────── */
  const [clipboardText, setClipboardText] = useState('');

  /* ═══════════════════════════════════════════════════════════════
     Discovery polling
     ═══════════════════════════════════════════════════════════════ */

  const fetchDiscovery = useCallback(async () => {
    try {
      const [discRes, sessRes] = await Promise.all([
        api.get('/api/rdp/discover'),
        api.get('/api/rdp/vnc/sessions'),
      ]);
      setDiscovery(discRes.data);
      setManagedSessions(sessRes.data.sessions || []);
      setDiscoveryError(null);
    } catch (err) {
      setDiscoveryError(err.response?.data?.error || err.message);
    } finally {
      setDiscoveryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiscovery();
    pollRef.current = setInterval(fetchDiscovery, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchDiscovery]);

  /* ── Sync clipboard from hook ────────────────────────────────── */
  useEffect(() => {
    if (rd.clipboardText) setClipboardText(rd.clipboardText);
  }, [rd.clipboardText]);

  /* ── Fullscreen ──────────────────────────────────────────────── */
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) setToolbarVisible(true);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ── Fullscreen auto-hide ────────────────────────────────────── */
  useEffect(() => {
    if (!isFullscreen || rd.connState !== CONN.CONNECTED) return;
    const el = containerRef.current;
    if (!el) return;

    const show = () => {
      setToolbarVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (document.fullscreenElement && !openDropdown) setToolbarVisible(false);
      }, 2500);
    };

    el.addEventListener('mousemove', show);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 2500);
    return () => {
      el.removeEventListener('mousemove', show);
      clearTimeout(hideTimerRef.current);
    };
  }, [isFullscreen, rd.connState, openDropdown]);

  /* ── Close dropdown on outside click ─────────────────────────── */
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (!e.target.closest('[data-dropdown]')) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  /* ── ResizeObserver for canvas ───────────────────────────────── */
  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rfb = rd.rfbRef.current;
      if (rfb && rfb._display) rfb.scaleViewport = rfb.scaleViewport;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rd.rfbRef]);

  /* ═══════════════════════════════════════════════════════════════
     Actions
     ═══════════════════════════════════════════════════════════════ */

  function handleConnect(host, port, proto, name) {
    setShowPasswordPrompt(true);
    setUsernameInput('');
    setPasswordInput('');
    setPendingTarget({ host, port, name, protocol: proto });
  }

  async function confirmConnect() {
    if (!pendingTarget) return;
    setShowPasswordPrompt(false);

    if (pendingTarget.protocol === 'rdp') {
      // RDP → backend creates an xfreerdp+Xvnc bridge, returns local VNC port
      try {
        const res = await api.post('/api/rdp/rdp/connect', {
          host: pendingTarget.host,
          port: pendingTarget.port,
          username: usernameInput,
          password: passwordInput,
        });
        const { vncPort, bridgeId } = res.data;
        setActiveBridgeId(bridgeId);
        rd.connectVnc(displayRef.current, {
          host: '127.0.0.1',
          port: vncPort,
          pwd: '',
          name: pendingTarget.name,
        });
      } catch (err) {
        rd.disconnect();
        alert(err.response?.data?.error || err.message);
      }
    } else {
      rd.connectVnc(displayRef.current, {
        host: pendingTarget.host,
        port: pendingTarget.port,
        pwd: passwordInput,
        name: pendingTarget.name,
      });
    }
    setPasswordInput('');
    setUsernameInput('');
    setPendingTarget(null);
  }

  function quickConnect(host, port, proto, name) {
    if (proto === 'rdp') {
      // RDP always needs credentials — open the full prompt
      handleConnect(host, port, proto, name);
      return;
    }
    rd.connectVnc(displayRef.current, { host, port, pwd: '', name });
  }

  async function handleStopSession(display) {
    try {
      await api.post('/api/rdp/vnc/stop', { display });
      fetchDiscovery();
    } catch {}
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try { await containerRef.current?.requestFullscreen(); } catch {}
    } else {
      await document.exitFullscreen();
    }
  };

  function sendKey(keySym, code) { rd.rfbRef.current?.sendKey(keySym, code); }
  function sendTab() { sendKey(KeyTable.XK_Tab, 'Tab'); }
  function sendEscape() { sendKey(KeyTable.XK_Escape, 'Escape'); }
  function sendCombo(modKeySym, modCode, charKeySym, charCode) {
    const rfb = rd.rfbRef.current;
    if (!rfb) return;
    rfb.sendKey(modKeySym, modCode, true);
    rfb.sendKey(charKeySym, charCode, true);
    rfb.sendKey(charKeySym, charCode, false);
    rfb.sendKey(modKeySym, modCode, false);
  }
  function sendCtrlC() { sendCombo(KeyTable.XK_Control_L, 'ControlLeft', KeyTable.XK_c, 'KeyC'); }
  function sendCtrlV() { sendCombo(KeyTable.XK_Control_L, 'ControlLeft', KeyTable.XK_v, 'KeyV'); }

  function toggleDropdown(name) { setOpenDropdown((p) => (p === name ? null : name)); }

  async function handleDisconnect() {
    rd.disconnect();
    // Clean up RDP bridge session if active
    if (activeBridgeId) {
      try { await api.post('/api/rdp/rdp/disconnect', { bridgeId: activeBridgeId }); } catch {}
      setActiveBridgeId(null);
    }
  }

  const isConnected = rd.connState === CONN.CONNECTED;
  const isConnecting = rd.connState === CONN.CONNECTING;

  /* ═══════════════════════════════════════════════════════════════
     Derived: build card list from discovery
     ═══════════════════════════════════════════════════════════════ */
  const cards = buildCards(discovery, managedSessions);

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div ref={containerRef} className="flex flex-col h-full select-none overflow-hidden">
      {/* ── Control overlay (when connected) ─────────────────────── */}
      {isConnected && (
        <ControlOverlay
          rd={rd}
          onDisconnect={handleDisconnect}
          isFullscreen={isFullscreen}
          toolbarVisible={toolbarVisible}
          openDropdown={openDropdown}
          toggleDropdown={toggleDropdown}
          setOpenDropdown={setOpenDropdown}
          toggleFullscreen={toggleFullscreen}
          clipboardText={clipboardText}
          setClipboardText={setClipboardText}
          sendTab={sendTab}
          sendEscape={sendEscape}
          sendCtrlC={sendCtrlC}
          sendCtrlV={sendCtrlV}
        />
      )}

      {/* ── Main two-column layout ───────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Connection Manager  (hidden in fullscreen when connected) ── */}
        {(!isConnected || !isFullscreen) && (
          <div className="w-75 shrink-0 flex flex-col border-r-2 border-gb-bg2 bg-gb-bg0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b-2 border-gb-bg2">
              <div className="flex items-center gap-2">
                <Network size={15} className="text-gb-aqua" />
                <h2 className="text-xs font-black uppercase tracking-tight text-gb-fg1">
                  Connection Manager
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={fetchDiscovery}
                  disabled={discoveryLoading}
                  title="Refresh"
                  className="p-1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1 transition-colors border border-transparent"
                >
                  <RefreshCw size={13} className={discoveryLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setShowSpawnModal(true)}
                  title="Spawn Session"
                  className="p-1 text-gb-aqua hover:bg-gb-aqua/10 transition-colors border border-transparent"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Card list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {discoveryLoading && !discovery && (
                <div className="flex items-center justify-center py-8 text-gb-fg4">
                  <Loader2 size={18} className="animate-spin text-gb-aqua" />
                </div>
              )}

              {discoveryError && (
                <div className="flex items-center gap-2 text-gb-red text-xs p-2">
                  <AlertCircle size={13} className="shrink-0" />
                  {discoveryError}
                </div>
              )}

              {cards.length === 0 && !discoveryLoading && !discoveryError && (
                <div className="text-xs text-gb-fg4 text-center py-6">
                  No remote services detected.
                </div>
              )}

              {cards.map((card) => (
                <SessionCard
                  key={card.id}
                  card={card}
                  isActive={isConnected && rd.targetHost === card.host && rd.targetPort === card.port}
                  onConnect={() => handleConnect(card.host, card.port, card.protocol, card.name)}
                  onQuickConnect={() => quickConnect(card.host, card.port, card.protocol, card.name)}
                  onStop={card.managedDisplay != null ? () => handleStopSession(card.managedDisplay) : null}
                />
              ))}
            </div>

            {/* Capabilities footer */}
            {discovery?.capabilities && (
              <CapabilitiesFooter caps={discovery.capabilities} />
            )}
          </div>
        )}

        {/* ── Right: Remote Viewport ─────────────────────────────── */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          {/* noVNC canvas — always in DOM */}
          <div
            ref={displayRef}
            className="absolute inset-0"
            style={{ background: '#1d2021' }}
          />

          {/* Placeholder when disconnected */}
          {!isConnected && (
            <div className="absolute inset-0 z-10 bg-gb-bg0 flex flex-col items-center justify-center">
              {isConnecting ? (
                <>
                  <Loader2 size={32} className="animate-spin text-gb-aqua mb-4" />
                  <p className="text-sm text-gb-fg4">Negotiating VNC handshake…</p>
                </>
              ) : rd.error ? (
                <div className="max-w-md text-center space-y-3 px-4">
                  <AlertCircle size={28} className="text-gb-red mx-auto" />
                  <p className="text-sm text-gb-red">{rd.error}</p>
                  <button
                    onClick={fetchDiscovery}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg1 transition-colors"
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <MonitorPlay size={40} className="text-gb-bg3 mx-auto" />
                  <p className="text-sm font-bold text-gb-fg4 uppercase tracking-wide">
                    Ready to Connect
                  </p>
                  <p className="text-xs text-gb-bg4 max-w-xs">
                    Select a session from the Connection Manager or spawn a new headless session.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         Modals
         ═══════════════════════════════════════════════════════════ */}

      {/* Connection prompt */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form
            onSubmit={(e) => { e.preventDefault(); confirmConnect(); }}
            className="bg-gb-bg0 border-2 border-gb-bg3 shadow-xl w-80"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2">
              <h3 className="text-sm font-black uppercase text-gb-fg1">
                {pendingTarget?.protocol === 'rdp' ? 'RDP Connection' : 'VNC Connection'}
              </h3>
              <button
                type="button"
                onClick={() => { setShowPasswordPrompt(false); setPendingTarget(null); setPasswordInput(''); setUsernameInput(''); }}
                className="text-gb-fg4 hover:text-gb-fg1 transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-gb-fg4">
                {pendingTarget?.name || `${pendingTarget?.host}:${pendingTarget?.port}`}
              </p>

              {/* Username — shown for RDP (required), hidden for VNC */}
              {pendingTarget?.protocol === 'rdp' && (
                <div>
                  <label className="block text-[10px] font-bold text-gb-fg3 uppercase mb-1">
                    <User size={10} className="inline mr-1" /> Username
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors placeholder:text-gb-bg4"
                    placeholder="e.g. Administrator"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gb-fg3 uppercase mb-1">
                  Password
                </label>
                <input
                  type="password"
                  autoFocus={pendingTarget?.protocol !== 'rdp'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors placeholder:text-gb-bg4"
                  placeholder="Leave blank if none"
                />
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t-2 border-gb-bg2">
              <button
                type="submit"
                disabled={pendingTarget?.protocol === 'rdp' && !usernameInput}
                className="flex-1 py-2 text-xs font-bold uppercase bg-gb-aqua text-gb-bg0-hard border-2 border-gb-aqua hover:bg-gb-aqua-dim transition-colors disabled:opacity-50"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => { setShowPasswordPrompt(false); setPendingTarget(null); setPasswordInput(''); setUsernameInput(''); }}
                className="px-4 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 text-gb-fg3 hover:bg-gb-bg1 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Spawn modal */}
      {showSpawnModal && (
        <SpawnModal
          discovery={discovery}
          onClose={() => setShowSpawnModal(false)}
          onSpawned={(spawned) => {
            setShowSpawnModal(false);
            fetchDiscovery();
            // Auto-connect to the newly spawned session
            rd.connectVnc(displayRef.current, {
              host: '127.0.0.1',
              port: spawned.port,
              pwd: '',
              name: `${spawned.user}@:${spawned.display}`,
            });
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Build card list from discovery + managed sessions
   ═══════════════════════════════════════════════════════════════════ */

function buildCards(discovery, managedSessions) {
  if (!discovery) return [];
  const cards = [];

  // Host VNC ports  (discovery.vnc.host)
  for (const p of discovery.vnc?.host || []) {
    cards.push({
      id: `host-vnc-${p.port}`,
      name: p.process !== 'unknown' ? `${p.process} :${p.port}` : `VNC :${p.port}`,
      host: p.host || '127.0.0.1',
      port: p.port,
      protocol: 'vnc',
      source: 'host',
      icon: 'monitor',
      process: p.process,
      display: p.meta?.display,
      status: 'available',
    });
  }

  // Host RDP ports  (discovery.rdp.host)
  for (const p of discovery.rdp?.host || []) {
    cards.push({
      id: `host-rdp-${p.port}`,
      name: p.process !== 'unknown' ? `${p.process} :${p.port}` : `RDP :${p.port}`,
      host: p.host || '127.0.0.1',
      port: p.port,
      protocol: 'rdp',
      source: 'host',
      icon: 'network',
      process: p.process,
      status: 'available',
    });
  }

  // Docker VNC ports  (discovery.vnc.docker)
  for (const d of discovery.vnc?.docker || []) {
    cards.push({
      id: `docker-${d.process}-vnc-${d.port}`,
      name: `${d.process} (VNC :${d.port})`,
      host: d.host === '0.0.0.0' ? '127.0.0.1' : (d.host || '127.0.0.1'),
      port: d.port,
      protocol: 'vnc',
      source: 'docker',
      icon: 'container',
      containerName: d.process,
      containerPort: d.meta?.containerPort,
      status: 'available',
    });
  }

  // Docker RDP ports  (discovery.rdp.docker)
  for (const d of discovery.rdp?.docker || []) {
    cards.push({
      id: `docker-${d.process}-rdp-${d.port}`,
      name: `${d.process} (RDP :${d.port})`,
      host: d.host === '0.0.0.0' ? '127.0.0.1' : (d.host || '127.0.0.1'),
      port: d.port,
      protocol: 'rdp',
      source: 'docker',
      icon: 'container',
      containerName: d.process,
      containerPort: d.meta?.containerPort,
      status: 'available',
    });
  }

  // Managed TigerVNC sessions
  for (const s of managedSessions || []) {
    const exists = cards.some((c) => c.port === s.port && c.source === 'host');
    if (!exists) {
      cards.push({
        id: `managed-${s.display}`,
        name: `${s.user}@:${s.display}`,
        host: '127.0.0.1',
        port: s.port,
        protocol: 'vnc',
        source: 'managed',
        icon: 'server',
        status: s.active ? 'running' : 'stopped',
        managedDisplay: s.display,
        user: s.user,
        session: s.session,
      });
    }
  }

  return cards;
}

/* ═══════════════════════════════════════════════════════════════════
   Session Card
   ═══════════════════════════════════════════════════════════════════ */

function SessionCard({ card, isActive, onConnect, onQuickConnect, onStop }) {
  const IconComp =
    card.icon === 'monitor' ? Monitor :
    card.icon === 'container' ? Container :
    card.icon === 'server' ? Server :
    Network;

  const protocolColor =
    card.protocol === 'vnc' ? 'text-gb-aqua' :
    card.protocol === 'rdp' ? 'text-gb-blue' :
    'text-gb-fg4';

  const sourceLabel =
    card.source === 'host' ? 'HOST' :
    card.source === 'docker' ? 'DOCKER' :
    card.source === 'managed' ? 'SPAWNED' :
    'UNKNOWN';

  const sourceBadgeColor =
    card.source === 'host' ? 'text-gb-green border-gb-green-dim' :
    card.source === 'docker' ? 'text-gb-blue border-gb-blue-dim' :
    card.source === 'managed' ? 'text-gb-purple border-gb-purple-dim' :
    'text-gb-fg4 border-gb-bg3';

  return (
    <div
      className={`
        border-2 p-2.5 transition-colors cursor-pointer group
        ${isActive
          ? 'border-gb-aqua bg-gb-aqua/5'
          : 'border-gb-bg2 hover:border-gb-bg3 bg-gb-bg0 hover:bg-gb-bg1'
        }
      `}
      onClick={onConnect}
    >
      {/* Top row: icon + name + protocol badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <IconComp size={14} className={protocolColor} />
        <span className="text-xs font-bold text-gb-fg1 truncate flex-1">
          {card.name}
        </span>
        <span className={`text-[10px] font-bold uppercase px-1 py-0.5 border ${sourceBadgeColor}`}>
          {sourceLabel}
        </span>
      </div>

      {/* Detail row */}
      <div className="flex items-center gap-3 text-[10px] text-gb-fg4 font-mono">
        <span>{card.protocol.toUpperCase()}</span>
        <span>{card.host}:{card.port}</span>
        {card.process && <span className="truncate">{card.process}</span>}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-1.5 mt-2">
        {isActive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-gb-green">
            <Wifi size={10} /> Connected
          </span>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onQuickConnect(); }}
              title="Quick connect (no password)"
              className={`px-2 py-0.5 text-[10px] font-bold uppercase border transition-colors ${
                card.protocol === 'vnc'
                  ? 'border-gb-aqua-dim text-gb-aqua hover:bg-gb-aqua/10'
                  : 'border-gb-blue-dim text-gb-blue hover:bg-gb-blue/10'
              }`}
            >
              Quick
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConnect(); }}
              className="px-2 py-0.5 text-[10px] font-bold uppercase border border-gb-bg3 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
            >
              Connect
            </button>
          </>
        )}

        {onStop && (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            title="Stop session"
            className="ml-auto p-0.5 text-gb-red hover:bg-gb-red/10 transition-colors"
          >
            <Square size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Capabilities Footer
   ═══════════════════════════════════════════════════════════════════ */

function CapabilitiesFooter({ caps }) {
  // Render dynamically from whatever capabilities the server reports
  // — no hardcoded binary names.
  const items = Object.entries(caps || {}).map(([key, found]) => ({
    key,
    label: key,
    found: !!found,
  }));

  return (
    <div className="border-t-2 border-gb-bg2 px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-gb-fg4 mb-1.5">Capabilities</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
            <span
              key={item.key}
              className={`text-[9px] font-mono px-1.5 py-0.5 border ${
                item.found
                  ? 'border-gb-green-dim text-gb-green bg-gb-green/5'
                  : 'border-gb-bg2 text-gb-bg4'
              }`}
              title={item.found ? 'Installed' : 'Not found'}
            >
              {item.label}
            </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Control Overlay (floating bar when connected)
   ═══════════════════════════════════════════════════════════════════ */

function ControlOverlay({
  rd, onDisconnect, isFullscreen, toolbarVisible, openDropdown, toggleDropdown,
  setOpenDropdown, toggleFullscreen, clipboardText, setClipboardText,
  sendTab, sendEscape, sendCtrlC, sendCtrlV,
}) {
  return (
    <>
      <div
        className={`
          flex items-center gap-1 px-2 py-1.5 bg-gb-bg0/90 backdrop-blur-sm border-b-2 border-gb-bg2
          transition-all duration-200
          ${isFullscreen && !toolbarVisible ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}
          ${isFullscreen ? 'absolute top-0 left-0 right-0 z-50' : ''}
        `}
        data-dropdown
      >
        {/* Status pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase border border-gb-green-dim text-gb-green mr-1">
          <span className="w-1.5 h-1.5 bg-gb-green animate-pulse" />
          {rd.label || 'Connected'}
        </div>

        <span className="text-[10px] font-mono text-gb-fg4 mr-2">
          {rd.protocol.toUpperCase()} &middot; {rd.targetHost}:{rd.targetPort}
        </span>

        <div className="flex-1" />

        {/* Clipboard */}
        <OverlayBtn icon={Clipboard} label="Clipboard" active={openDropdown === 'clipboard'}
          onClick={() => toggleDropdown('clipboard')} />

        {/* Keys */}
        <OverlayBtn icon={Keyboard} label="Keys" active={openDropdown === 'keys'}
          onClick={() => toggleDropdown('keys')} />

        {/* Settings */}
        <OverlayBtn icon={Settings} label="Settings" active={openDropdown === 'settings'}
          onClick={() => toggleDropdown('settings')} />

        <div className="w-px h-4 bg-gb-bg3 mx-0.5" />

        {/* View-only */}
        <button
          onClick={() => rd.setViewOnly(!rd.viewOnly)}
          title={rd.viewOnly ? 'View-only' : 'Interactive'}
          className={`p-1 transition-colors border ${
            rd.viewOnly ? 'border-gb-yellow-dim text-gb-yellow bg-gb-yellow/10' : 'border-transparent text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          {rd.viewOnly ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="p-1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1 transition-colors border border-transparent"
        >
          {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>

        <div className="w-px h-4 bg-gb-bg3 mx-0.5" />

        {/* Ctrl+Alt+Del */}
        <button
          onClick={rd.sendCtrlAltDel}
          title="Send Ctrl+Alt+Del"
          className="p-1 text-gb-orange hover:text-gb-red hover:bg-gb-bg1 transition-colors border border-transparent"
        >
          <Power size={13} />
        </button>

        {/* Disconnect */}
        <button
          onClick={onDisconnect}
          title="Disconnect"
          className="px-2 py-0.5 text-[10px] font-bold uppercase border border-gb-red-dim text-gb-red hover:bg-gb-red/10 transition-colors ml-1"
        >
          Disconnect
        </button>
      </div>

      {/* Dropdown panels */}
      {openDropdown && (
        <div
          className={`absolute right-2 z-50 ${isFullscreen ? 'top-10' : 'top-10'}`}
          data-dropdown
        >
          {openDropdown === 'clipboard' && (
            <DropPanel title="Clipboard" icon={Clipboard} onClose={() => setOpenDropdown(null)}>
              <p className="text-[10px] text-gb-fg4 mb-2">
                Remote clipboard syncs automatically. Paste text below to send.
              </p>
              <textarea
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
                className="w-full h-24 bg-gb-bg1 text-gb-fg1 text-xs p-2 border-2 border-gb-bg3 focus:border-gb-aqua outline-none resize-none font-mono placeholder:text-gb-bg4 mb-2"
                placeholder="Clipboard text…"
              />
              <button
                onClick={() => rd.sendClipboard(clipboardText)}
                className="w-full py-1.5 text-xs font-bold uppercase border-2 border-gb-aqua bg-gb-aqua text-gb-bg0-hard hover:bg-gb-aqua-dim transition-colors"
              >
                Send to Remote
              </button>
            </DropPanel>
          )}

          {openDropdown === 'keys' && (
            <DropPanel title="Extra Keys" icon={Keyboard} onClose={() => setOpenDropdown(null)}>
              <div className="grid grid-cols-2 gap-1.5">
                <KeyBtn label="Ctrl+Alt+Del" onClick={rd.sendCtrlAltDel} accent />
                <KeyBtn label="Tab" onClick={sendTab} />
                <KeyBtn label="Escape" onClick={sendEscape} />
                <KeyBtn label="Ctrl+C" onClick={sendCtrlC} />
                <KeyBtn label="Ctrl+V" onClick={sendCtrlV} />
              </div>
            </DropPanel>
          )}

          {openDropdown === 'settings' && (
            <DropPanel title="Display Settings" icon={Settings} onClose={() => setOpenDropdown(null)} wide>
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-2">
                  <Scaling size={11} className="text-gb-aqua" />
                  <span className="text-[10px] font-bold text-gb-fg3 uppercase">Scaling</span>
                </div>
                <ToggleRow label="Scale to Fit" checked={rd.scaleViewport}
                  onChange={(v) => { rd.setScaleViewport(v); if (v) rd.setClipToWindow(false); }} />
                <ToggleRow label="Clip to Window" checked={rd.clipToWindow}
                  onChange={(v) => { rd.setClipToWindow(v); if (v) rd.setScaleViewport(false); }} />
                <ToggleRow label="Resize Session" checked={rd.resizeSession} onChange={rd.setResizeSession} />
              </div>

              <div className="border-t-2 border-gb-bg2 my-2" />

              <div className="mb-3">
                <div className="flex items-center gap-1 mb-2">
                  <MousePointerClick size={11} className="text-gb-aqua" />
                  <span className="text-[10px] font-bold text-gb-fg3 uppercase">Input</span>
                </div>
                <ToggleRow label="View Only" checked={rd.viewOnly} onChange={rd.setViewOnly} />
              </div>

              <div className="border-t-2 border-gb-bg2 my-2" />

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Zap size={11} className="text-gb-aqua" />
                  <span className="text-[10px] font-bold text-gb-fg3 uppercase">Quality</span>
                </div>
                <SliderRow label="Quality" value={rd.qualityLevel} onChange={rd.setQualityLevel}
                  min={0} max={9} lowLabel="Low" highLabel="High" />
                <div className="h-2" />
                <SliderRow label="Compression" value={rd.compressionLevel} onChange={rd.setCompressionLevel}
                  min={0} max={9} lowLabel="Fast" highLabel="Best" />
              </div>
            </DropPanel>
          )}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Spawn Modal
   ═══════════════════════════════════════════════════════════════════ */

function SpawnModal({ discovery, onClose, onSpawned }) {
  const [user, setUser] = useState('');
  const [session, setSession] = useState('');
  const [resolution, setResolution] = useState('1920x1080');
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState(null);

  const users = discovery?.users || [];
  const sessions = discovery?.sessions || [];

  async function handleSpawn(e) {
    e.preventDefault();
    if (!user || !session) return;
    setSpawning(true);
    setError(null);
    try {
      const res = await api.post('/api/rdp/vnc/spawn', {
        user,
        session,
        geometry: resolution,
      });
      onSpawned(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSpawn} className="bg-gb-bg0 border-2 border-gb-bg3 w-96 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-gb-aqua" />
            <h3 className="text-sm font-black uppercase text-gb-fg1">Spawn Session</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gb-fg4 hover:text-gb-fg1 transition-colors p-0.5">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-2.5 text-xs">
              <AlertCircle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          {/* User */}
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">
              <User size={11} className="inline mr-1" />
              System User
            </label>
            <select
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors"
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username} (uid {u.uid})
                </option>
              ))}
            </select>
          </div>

          {/* Session */}
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">
              <Monitor size={11} className="inline mr-1" />
              Desktop Environment
            </label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors"
            >
              <option value="">Select session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.type === 'wayland' ? ' (Wayland)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">
              <Scaling size={11} className="inline mr-1" />
              Resolution
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors"
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t-2 border-gb-bg2">
          <button
            type="submit"
            disabled={spawning || !user || !session}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold uppercase bg-gb-aqua text-gb-bg0-hard border-2 border-gb-aqua hover:bg-gb-aqua-dim transition-colors disabled:opacity-50"
          >
            {spawning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {spawning ? 'Spawning…' : 'Spawn'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 text-gb-fg3 hover:bg-gb-bg1 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Shared Sub-Components (compact variants)
   ═══════════════════════════════════════════════════════════════════ */

function OverlayBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase border transition-colors ${
        active
          ? 'border-gb-aqua-dim text-gb-aqua bg-gb-aqua/10'
          : 'border-transparent text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1'
      }`}
    >
      <Icon size={12} />
      <span className="hidden lg:inline">{label}</span>
      <ChevronDown size={10} className={`transition-transform ${active ? 'rotate-180' : ''}`} />
    </button>
  );
}

function DropPanel({ title, icon: Icon, onClose, wide, children }) {
  return (
    <div className={`bg-gb-bg0 border-2 border-gb-bg3 shadow-xl ${wide ? 'w-72' : 'w-64'}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b-2 border-gb-bg2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-gb-aqua" />
          <h3 className="text-[10px] font-black uppercase tracking-wide text-gb-fg3">{title}</h3>
        </div>
        <button onClick={onClose} className="text-gb-fg4 hover:text-gb-fg1 transition-colors p-0.5">
          <X size={12} />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label
      className="flex items-center justify-between gap-2 cursor-pointer py-1 group"
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
    >
      <span className="text-xs text-gb-fg2">{label}</span>
      <div className={`w-7 h-3.5 relative transition-colors shrink-0 border ${
        checked ? 'bg-gb-aqua/20 border-gb-aqua' : 'bg-gb-bg1 border-gb-bg3'
      }`}>
        <div className={`absolute top-0.5 w-2.5 h-2 bg-gb-fg0 transition-all ${checked ? 'left-3.5 bg-gb-aqua' : 'left-0.5'}`} />
      </div>
    </label>
  );
}

function SliderRow({ label, value, onChange, min, max, lowLabel, highLabel }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gb-fg4 mb-1">
        <span>{label}</span>
        <span className="font-mono text-gb-fg2">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-gb-aqua h-1 bg-gb-bg2 appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-gb-aqua
          [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-gb-aqua [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-none"
      />
      <div className="flex justify-between text-[9px] text-gb-fg4 mt-0.5">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function KeyBtn({ label, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 text-[10px] font-mono font-bold border transition-colors ${
        accent
          ? 'border-gb-orange-dim text-gb-orange hover:bg-gb-orange/10'
          : 'border-gb-bg3 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2'
      }`}
    >
      {label}
    </button>
  );
}
