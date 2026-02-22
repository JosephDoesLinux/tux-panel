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
  const displayRef = useRef(null);
  const clientRef = useRef(null);
  const [state, setState] = useState(STATE.IDLE);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [showClipboard, setShowClipboard] = useState(false);
  const containerRef = useRef(null);

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
    setState(STATE.CONNECTING);
    setError(null);

    try {
      // Get connection token from API
      const res = await api.post('/api/rdp/connect', {
        width: window.innerWidth,
        height: window.innerHeight - 60, // leave room for toolbar
        dpi: Math.round(window.devicePixelRatio * 96),
      });

      const { token } = res.data;

      // Build WebSocket URL
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/guacamole?token=${encodeURIComponent(token)}`;

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
            break;
          case Guacamole.Client.State.DISCONNECTING:
            setState(STATE.DISCONNECTING);
            break;
          case Guacamole.Client.State.DISCONNECTED:
            setState(STATE.IDLE);
            cleanup(keyboard, mouse, touch);
            break;
        }
      };

      // ── Error handler ────────────────────────────────────────
      client.onerror = (err) => {
        setError(err.message || 'Guacamole connection error');
        setState(STATE.ERROR);
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

      // Connect!
      client.connect();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setState(STATE.ERROR);
    }
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    const client = clientRef.current;
    if (client) {
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
    setState(STATE.IDLE);
  }, []);

  function cleanup(keyboard, mouse, touch) {
    try { keyboard?.reset(); } catch {}
    try { mouse?.reset(); } catch {}
    try { touch?.reset(); } catch {}
  }

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => disconnect();
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
    [STATE.IDLE]: 'text-gray-400',
    [STATE.DETECTING]: 'text-blue-400',
    [STATE.CONNECTING]: 'text-amber-400',
    [STATE.CONNECTED]: 'text-emerald-400',
    [STATE.DISCONNECTING]: 'text-amber-400',
    [STATE.ERROR]: 'text-red-400',
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-3">
        <MonitorPlay size={28} className="text-blue-400" />
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
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-800 rounded-lg hover:bg-red-600/30 transition-colors"
            >
              <Power size={16} />
              Disconnect
            </button>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
            <button
              onClick={() => setShowClipboard(!showClipboard)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Clipboard size={16} />
              Clipboard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={connect}
              disabled={state === STATE.CONNECTING || state === STATE.DETECTING}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <RefreshCw size={16} className={state === STATE.DETECTING ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        )}
      </div>

      {/* ── Clipboard panel ────────────────────────────────────── */}
      {showClipboard && state === STATE.CONNECTED && (
        <div className="mb-3 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <label className="text-sm text-gray-400 mb-1 block">
            Clipboard (paste here to send to remote, or copy from remote)
          </label>
          <div className="flex gap-2">
            <textarea
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              className="flex-1 bg-gray-800 text-gray-200 rounded px-3 py-2 text-sm resize-none border border-gray-700 focus:border-blue-500 focus:outline-none"
              rows={2}
              placeholder="Clipboard text…"
            />
            <button
              onClick={sendClipboard}
              className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-800 rounded-lg hover:bg-blue-600/30 transition-colors self-end"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Error display ──────────────────────────────────────── */}
      {error && (
        <div className="mb-3 flex items-start gap-3 bg-red-950/30 border border-red-800 rounded-lg p-4">
          <AlertCircle size={20} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-400 font-medium">Connection Error</p>
            <p className="text-red-300/80 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ── Status panel (when idle) ───────────────────────────── */}
      {state !== STATE.CONNECTED && status && (
        <div className="mb-3 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Desktop Environment</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Desktop</span>
              <p className="text-white font-medium">{status.desktop?.desktop || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Session</span>
              <p className="text-white font-medium">{status.desktop?.sessionType || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">RDP Server</span>
              <p className={`font-medium ${status.status === 'running' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {status.status === 'running'
                  ? `${status.provider?.name} (:${status.provider?.port})`
                  : status.status}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Guacamole Proxy</span>
              <p className={`font-medium ${status.guacProxy === 'ready' ? 'text-emerald-400' : 'text-red-400'}`}>
                {status.guacProxy}
              </p>
            </div>
          </div>
          {status.message && (
            <p className="text-amber-400/80 text-sm mt-3">{status.message}</p>
          )}
        </div>
      )}

      {/* ── Remote display canvas ──────────────────────────────── */}
      <div
        ref={displayRef}
        className={`flex-1 bg-black rounded-xl border border-gray-800 overflow-hidden ${
          state === STATE.CONNECTED ? 'cursor-none' : ''
        }`}
        style={{
          minHeight: state === STATE.CONNECTED ? 'calc(100vh - 200px)' : '300px',
        }}
      >
        {state !== STATE.CONNECTED && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div className="text-center">
              <MonitorPlay size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Click "Connect to Desktop" to start</p>
              <p className="text-sm mt-1 text-gray-700">
                Shares your current {status?.desktop?.desktop || 'Linux'} Wayland session
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
