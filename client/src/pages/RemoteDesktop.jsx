import { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';
import {
  MonitorPlay,
  Maximize,
  Minimize,
  Clipboard,
  Power,
  Loader2,
  AlertCircle,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ── Connection state machine ─────────────────────────────────────────
const STATE = {
  IDLE: 'idle',
  DETECTING: 'detecting',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTING: 'disconnecting',
  ERROR: 'error',
};

export default function RemoteDesktop() {
  const connectionInProgress = useRef(false);
  const displayRef = useRef(null);
  const clientRef = useRef(null);
  const [state, setState] = useState(STATE.IDLE);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [showClipboard, setShowClipboard] = useState(false);
  const containerRef = useRef(null);

  // ── Credentials for krdpserver auth ──────────────────────────────
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Auto-fill username from session
  useEffect(() => {
    if (user?.username && !username) setUsername(user.username);
  }, [user]);

  // ── Fetch RDP status on mount ────────────────────────────────────
  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setState(STATE.DETECTING);
    setError(null);
    try {
      const res = await api.get('/api/rdp/status');
      setStatus(res.data);
      setState(STATE.IDLE);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setState(STATE.ERROR);
    }
  }

  // ── Connect to remote desktop ────────────────────────────────────
  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (connectionInProgress.current) return;
    if (!username || !password) {
      setError('Username and password are required. krdpserver needs your Linux credentials.');
      setState(STATE.ERROR);
      return;
    }

    connectionInProgress.current = true;
    setState(STATE.CONNECTING);
    setError(null);

    try {
      // Get connection token from API
const res = await api.post('/api/rdp/connect', {
        width: window.innerWidth & ~1,
        height: (window.innerHeight - 60) & ~1, 
        dpi: Math.round(window.devicePixelRatio * 96),
        ...(username && { username }),
        ...(password && { password }),
      });

      const { token } = res.data;

      // Build WebSocket URL — token is passed via client.connect() data
      // parameter, NOT embedded in the tunnel URL.  guacamole-common-js
      // always appends "?" + data to the URL, so putting the token here
      // would result in a double-"?" URL that corrupts the token value.
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/guacamole`;

      // Create Guacamole tunnel + client
      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      const client = new Guacamole.Client(tunnel);
      clientRef.current = client;

      // Mount the display canvas
      const displayEl = displayRef.current;
      if (displayEl) {
        displayEl.innerHTML = '';
        const guacDisplay = client.getDisplay().getElement();
        guacDisplay.style.width = '100%';
        guacDisplay.style.height = '100%';
        guacDisplay.style.objectFit = 'contain';
        displayEl.appendChild(guacDisplay);
      }

      // ── Keyboard input ───────────────────────────────────────
      const keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);

      // ── Mouse input ──────────────────────────────────────────
      const mouse = new Guacamole.Mouse(displayEl);
      mouse.onEach(['mousedown', 'mouseup', 'mousemove'], (e) => {
        // Scale mouse position to match the display
        const display = client.getDisplay();
        const scale = display.getScale();
        const scaledState = new Guacamole.Mouse.State(
          e.state.x / scale,
          e.state.y / scale,
          e.state.left,
          e.state.middle,
          e.state.right,
          e.state.up,
          e.state.down,
        );
        client.sendMouseState(scaledState);
      });

      // ── Touch input (for mobile) ─────────────────────────────
      const touch = new Guacamole.Mouse.Touchscreen(displayEl);
      touch.onEach(['mousedown', 'mouseup', 'mousemove'], (e) => {
        const display = client.getDisplay();
        const scale = display.getScale();
        const scaledState = new Guacamole.Mouse.State(
          e.state.x / scale,
          e.state.y / scale,
          e.state.left,
          e.state.middle,
          e.state.right,
          e.state.up,
          e.state.down,
        );
        client.sendMouseState(scaledState);
      });

      // ── Clipboard sync (remote → local) ──────────────────────
      client.onclipboard = (stream, mimetype) => {
        if (mimetype === 'text/plain') {
          let data = '';
          const reader = new Guacamole.StringReader(stream);
          reader.ontext = (text) => { data += text; };
          reader.onend = () => setClipboardText(data);
        }
      };

      // ── State change handler ─────────────────────────────────
      client.onstatechange = (clientState) => {
        switch (clientState) {
          case Guacamole.Client.State.IDLE:
            setState(STATE.IDLE);
            break;
          case Guacamole.Client.State.CONNECTING:
          case Guacamole.Client.State.WAITING:
            setState(STATE.CONNECTING);
            break;
          case Guacamole.Client.State.CONNECTED:
            setState(STATE.CONNECTED);
            connectionInProgress.current = false;
            break;
          case Guacamole.Client.State.DISCONNECTING:
            setState(STATE.DISCONNECTING);
            break;
          case Guacamole.Client.State.DISCONNECTED:
            setState(STATE.IDLE);
            connectionInProgress.current = false;
            cleanup(keyboard, mouse, touch);
            break;
        }
      };

      // ── Error handler ────────────────────────────────────────
      client.onerror = (err) => {
        console.error('Guac Error:', err);
        setError(err.message || 'Guacamole connection error');
        setState(STATE.ERROR);
        connectionInProgress.current = false;
        cleanup(keyboard, mouse, touch);
      };

      // ── Auto-resize ──────────────────────────────────────────
      const handleResize = () => {
        if (clientRef.current && displayRef.current) {
          const w = displayRef.current.clientWidth;
          const h = displayRef.current.clientHeight;
          clientRef.current.sendSize(w, h);
        }
      };
      window.addEventListener('resize', handleResize);

      // Store cleanup refs
      client._tuxCleanup = { keyboard, mouse, touch, handleResize };

      // Connect — pass token as query-string data so the final WS URL is
      // ws://host/guacamole?token=<encoded_token>
      client.connect(`token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setState(STATE.ERROR);
      connectionInProgress.current = false;
    }
  }, [username, password]);

  // ── Disconnect ───────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      const client = clientRef.current;
      client.disconnect();
      if (client._tuxCleanup) {
        cleanup(
          client._tuxCleanup.keyboard,
          client._tuxCleanup.mouse,
          client._tuxCleanup.touch,
        );
        window.removeEventListener('resize', client._tuxCleanup.handleResize);
      }
      clientRef.current = null;
    }
    connectionInProgress.current = false;
    setState(STATE.IDLE);
  }, []);

  function cleanup(keyboard, mouse, touch) {
    try { keyboard?.reset(); } catch {}
    try { mouse?.reset(); } catch {}
    try { touch?.reset(); } catch {}
  }

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  // ── Send clipboard text to remote ────────────────────────────────
  function sendClipboard() {
    const client = clientRef.current;
    if (client && clipboardText) {
      const stream = client.createClipboardStream('text/plain');
      const writer = new Guacamole.StringWriter(stream);
      writer.sendText(clipboardText);
      writer.sendEnd();
    }
  }

  // ── Toggle fullscreen ───────────────────────────────────────────
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  // ── Status badge ────────────────────────────────────────────────
  const statusColor = {
    [STATE.IDLE]: 'text-gb-fg4',
    [STATE.DETECTING]: 'text-gb-aqua',
    [STATE.CONNECTING]: 'text-gb-yellow',
    [STATE.CONNECTED]: 'text-gb-green',
    [STATE.DISCONNECTING]: 'text-gb-yellow',
    [STATE.ERROR]: 'text-gb-red',
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <h1 className="text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-3 text-gb-fg1">
        <MonitorPlay size={28} className="text-gb-aqua" />
        Remote Desktop
        <span className={`text-sm font-normal ${statusColor[state]}`}>
          ({state})
        </span>
      </h1>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {state === STATE.CONNECTED ? (
          <>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-4 py-2 bg-gb-bg1 text-gb-red border-2 border-gb-red-dim hover:bg-gb-bg2 transition-colors"
            >
              <Power size={16} />
              Disconnect
            </button>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-3 py-2 bg-gb-bg1 text-gb-fg2 border-2 border-gb-bg3 hover:bg-gb-bg2 transition-colors"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
            <button
              onClick={() => setShowClipboard(!showClipboard)}
              className="flex items-center gap-2 px-3 py-2 bg-gb-bg1 text-gb-fg2 border-2 border-gb-bg3 hover:bg-gb-bg2 transition-colors"
            >
              <Clipboard size={16} />
              Clipboard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={connect}
              disabled={state === STATE.CONNECTING || state === STATE.DETECTING || !username || !password}
              className="flex items-center gap-2 px-4 py-2 bg-gb-aqua text-gb-bg0-hard font-black uppercase tracking-wide border-2 border-gb-aqua hover:bg-gb-aqua-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state === STATE.CONNECTING ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Monitor size={16} />
              )}
              {state === STATE.CONNECTING ? 'Connecting…' : 'Connect to Desktop'}
            </button>
            <button
              onClick={fetchStatus}
              disabled={state === STATE.DETECTING}
              className="flex items-center gap-2 px-3 py-2 bg-gb-bg1 text-gb-fg2 border-2 border-gb-bg3 hover:bg-gb-bg2 transition-colors"
            >
              <RefreshCw size={16} className={state === STATE.DETECTING ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        )}
      </div>

      {/* ── Clipboard panel ────────────────────────────────────── */}
      {showClipboard && state === STATE.CONNECTED && (
        <div className="mb-3 bg-gb-bg0 border-2 border-gb-bg2 p-4">
          <label className="text-sm text-gb-fg3 mb-1 block font-semibold">
            Clipboard (paste here to send to remote, or copy from remote)
          </label>
          <div className="flex gap-2">
            <textarea
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              className="flex-1 bg-gb-bg1 text-gb-fg1 px-3 py-2 text-sm resize-none border-2 border-gb-bg3 focus:border-gb-aqua focus:outline-none"
              rows={2}
              placeholder="Clipboard text…"
            />
            <button
              onClick={sendClipboard}
              className="px-4 py-2 bg-gb-bg1 text-gb-aqua border-2 border-gb-aqua-dim hover:bg-gb-bg2 transition-colors self-end"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Error display ──────────────────────────────────────── */}
      {error && (
        <div className="mb-3 flex items-start gap-3 bg-gb-bg1 border-2 border-gb-red-dim p-4">
          <AlertCircle size={20} className="text-gb-red mt-0.5 shrink-0" />
          <div>
            <p className="text-gb-red font-bold">Connection Error</p>
            <p className="text-gb-red-dim text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ── Status panel (when idle) ───────────────────────────── */}
      {state !== STATE.CONNECTED && status && (
        <div className="mb-3 bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <h2 className="text-lg font-bold text-gb-fg0 mb-3">Desktop Environment</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gb-fg4 text-xs uppercase tracking-wide font-semibold">Desktop</span>
              <p className="text-gb-fg0 font-bold">{status.desktop?.desktop || '—'}</p>
            </div>
            <div>
              <span className="text-gb-fg4 text-xs uppercase tracking-wide font-semibold">Session</span>
              <p className="text-gb-fg0 font-bold">{status.desktop?.sessionType || '—'}</p>
            </div>
            <div>
              <span className="text-gb-fg4 text-xs uppercase tracking-wide font-semibold">RDP Server</span>
              <p className={`font-bold ${status.status === 'running' ? 'text-gb-green' : 'text-gb-yellow'}`}>
                {status.status === 'running'
                  ? `${status.provider?.name} (:${status.provider?.port})`
                  : status.status}
              </p>
            </div>
            <div>
              <span className="text-gb-fg4 text-xs uppercase tracking-wide font-semibold">Guacamole Proxy</span>
              <p className={`font-bold ${status.guacProxy === 'ready' ? 'text-gb-green' : 'text-gb-red'}`}>
                {status.guacProxy}
              </p>
            </div>
          </div>
          {status.message && (
            <p className="text-gb-yellow-dim text-sm mt-3">{status.message}</p>
          )}
        </div>
      )}

      {/* ── Credentials (when idle/error and krdpserver needs auth) */}
      {state !== STATE.CONNECTED && status?.status === 'running' && (
        <div className="mb-3 bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <h2 className="text-sm font-bold text-gb-fg3 mb-3 uppercase tracking-wide">
            Login Credentials (required)
          </h2>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="text-xs text-gb-fg4 mb-1 block font-semibold uppercase tracking-wide">Username <span className="text-gb-red">*</span></label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={status?.desktop?.desktop === 'KDE' ? 'joseph' : 'username'}
                autoComplete="username"
                className="w-full bg-gb-bg1 text-gb-fg1 px-3 py-2 text-sm border-2 border-gb-bg3 focus:border-gb-aqua focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="text-xs text-gb-fg4 mb-1 block font-semibold uppercase tracking-wide">Password <span className="text-gb-red">*</span></label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-gb-bg1 text-gb-fg1 px-3 py-2 text-sm border-2 border-gb-bg3 focus:border-gb-aqua focus:outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-gb-fg4 mt-2">
            Your Linux login credentials are required — krdpserver uses them for RDP authentication.
          </p>
        </div>
      )}

      {/* ── Remote display canvas ──────────────────────────────── */}
      <div
        ref={displayRef}
        className={`flex-1 bg-gb-bg0-hard border-2 border-gb-bg2 overflow-hidden ${
          state === STATE.CONNECTED ? 'cursor-none' : ''
        }`}
        style={{
          minHeight: state === STATE.CONNECTED ? 'calc(100vh - 200px)' : '300px',
        }}
      >
        {state !== STATE.CONNECTED && (
          <div className="flex items-center justify-center h-full text-gb-bg4">
            <div className="text-center">
              <MonitorPlay size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Click "Connect to Desktop" to start</p>
              <p className="text-sm mt-1 text-gb-bg3">
                Shares your current {status?.desktop?.desktop || 'Linux'} Wayland session
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
