import { useEffect, useRef, useState, useCallback } from 'react';
import RFB from '@novnc/novnc/lib/rfb';
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
import SectionHeader from '../components/shared/SectionHeader';

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
  const rfbRef = useRef(null);

  const [state, setState] = useState(STATE.IDLE);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [showClipboard, setShowClipboard] = useState(false);
  const containerRef = useRef(null);

  const { user } = useAuth();
  const [password, setPassword] = useState('');

  // Fetch VNC status on mount
  useEffect(() => {
    fetchStatus();

    return () => {
      if (rfbRef.current) {
        try { rfbRef.current.disconnect(); } catch {}
        rfbRef.current = null;
      }
    };
  }, []);

  // ResizeObserver — tell noVNC to rescale when the container resizes
  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rfb = rfbRef.current;
      if (rfb && rfb._display) {
        // Force noVNC to recalculate scale
        rfb.scaleViewport = rfb.scaleViewport; // triggers setter
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
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

  const connect = useCallback(async () => {
    if (connectionInProgress.current) return;

    connectionInProgress.current = true;
    setState(STATE.CONNECTING);
    setError(null);

    try {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/vnc`;

      // Clear any prior canvas
      if (displayRef.current) {
        displayRef.current.innerHTML = '';
      }

      // Initialise noVNC — it appends a <canvas> into displayRef
      const rfb = new RFB(displayRef.current, wsUrl, {
        credentials: { password },
      });
      rfbRef.current = rfb;

      // Gruvbox hard-black background for letterboxing
      rfb.background = '#1d2021';

      // ── RFB event listeners ────────────────────────────────────
      rfb.addEventListener('connect', () => {
        console.log('[noVNC] connected — enabling scaleViewport');
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        setState(STATE.CONNECTED);
        connectionInProgress.current = false;
      });

      rfb.addEventListener('disconnect', (e) => {
        console.log('[noVNC] disconnected, clean:', e.detail.clean);
        connectionInProgress.current = false;
        rfbRef.current = null;

        if (e.detail.clean === false) {
          setError('Connection dropped unexpectedly');
          setState(STATE.ERROR);
        } else {
          setState(STATE.IDLE);
        }
      });

      rfb.addEventListener('securityfailure', (e) => {
        console.error('[noVNC] security failure:', e.detail);
        connectionInProgress.current = false;
        rfbRef.current = null;
        setError('VNC authentication failed — ' + (e.detail.reason || 'wrong password?'));
        setState(STATE.ERROR);
      });

      rfb.addEventListener('clipboard', (e) => {
        setClipboardText(e.detail.text);
      });
    } catch (err) {
      connectionInProgress.current = false;
      setError('Failed to initialise connection: ' + err.message);
      setState(STATE.ERROR);
    }
  }, [password]);

  const disconnect = useCallback(() => {
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch {}
      rfbRef.current = null;
    }
    setState(STATE.IDLE);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('Error enabling fullscreen:', err);
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const syncClipboard = () => {
    if (rfbRef.current && state === STATE.CONNECTED) {
      rfbRef.current.clipboardPasteFrom(clipboardText);
      setShowClipboard(false);
    }
  };

  // Escape to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-4 w-full" ref={containerRef}>
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight text-gb-fg1">Remote Desktop</h1>

        {/* Top-right Controls (visible when connected) */}
        {state === STATE.CONNECTED && (
          <div className="flex border-2 border-gb-bg3 bg-gb-bg0">
            <button
              onClick={() => setShowClipboard(!showClipboard)}
              className="p-2 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1 transition-colors"
              title="Clipboard"
            >
              <Clipboard size={16} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg1 transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <div className="w-px bg-gb-bg3 my-1" />
            <button
              onClick={disconnect}
              className="p-2 text-gb-red hover:text-gb-red hover:bg-gb-bg1 transition-colors"
              title="Disconnect"
            >
              <Power size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Floating Clipboard Pane ──────────────────────────────── */}
      {showClipboard && state === STATE.CONNECTED && (
        <div className="absolute top-24 right-8 z-50 w-80 bg-gb-bg0 border-2 border-gb-bg3 p-4 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-black uppercase text-gb-fg1">Remote Clipboard</h3>
            <button
              onClick={() => setShowClipboard(false)}
              className="text-gb-fg4 hover:text-gb-fg1 transition-colors"
            >
              &times;
            </button>
          </div>
          <textarea
            value={clipboardText}
            onChange={(e) => setClipboardText(e.target.value)}
            className="w-full h-32 bg-gb-bg1 text-gb-fg1 text-sm p-3 border-2 border-gb-bg3 focus:border-gb-aqua outline-none mb-3 resize-none placeholder:text-gb-bg4"
            placeholder="Paste text here to send it to the remote session..."
          />
          <button
            onClick={syncClipboard}
            className="w-full py-2 text-sm font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors"
          >
            Send to Remote
          </button>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────── */}
      <main className="flex-1 min-h-0 bg-gb-bg0 border-2 border-gb-bg2 overflow-hidden relative">

        {/* noVNC canvas — ALWAYS in the DOM so it has real dimensions */}
        <div
          ref={displayRef}
          className="absolute inset-0"
          style={{ background: '#1d2021' }}
        />

        {/* Overlay: covers the canvas when not connected */}
        {state !== STATE.CONNECTED && (
          <div className="absolute inset-0 z-10 bg-gb-bg0 flex flex-col justify-center items-center">

            {/* Detecting spinner */}
            {state === STATE.DETECTING && (
              <div className="flex flex-col items-center text-gb-fg4">
                <Loader2 size={28} className="animate-spin text-gb-aqua mb-4" />
                <p className="text-sm">Detecting display capabilities...</p>
              </div>
            )}

            {/* Pre-connection Form */}
            {(state === STATE.IDLE || state === STATE.ERROR) && status && (
              <div className="w-full max-w-sm p-6 bg-gb-bg0 border-2 border-gb-bg3 shadow-xl">
                <div className="mb-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gb-bg1 border-2 border-gb-bg3 mb-4">
                    <Monitor size={28} className="text-gb-aqua" />
                  </div>
                  <h2 className="text-lg font-black uppercase tracking-tight text-gb-fg0 mb-2">Connect to Desktop</h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border-2 border-gb-blue-dim text-gb-blue">
                    {status.desktop?.desktop} ({status.desktop?.sessionType})
                  </span>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); connect(); }} className="space-y-4">
                  {status.status === 'unavailable' ? (
                    <div className="flex items-center gap-2 text-gb-orange bg-gb-bg1 border-2 border-gb-orange-dim p-3 text-sm">
                      <AlertCircle size={16} className="shrink-0" />
                      No VNC server found. Install krfb and start it.
                    </div>
                  ) : status.status === 'not-running' ? (
                    <div className="flex items-center gap-2 text-gb-orange bg-gb-bg1 border-2 border-gb-orange-dim p-3 text-sm">
                      <AlertCircle size={16} className="shrink-0" />
                      {status.message}
                    </div>
                  ) : (
                    <>
                      {/* krfb config badge */}
                      {status.krfbConfig && (
                        <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-gb-fg4 mb-2">
                          <span className="px-1.5 py-0.5 bg-gb-bg1 border border-gb-bg3">
                            port {status.krfbConfig.port}
                          </span>
                          <span className="px-1.5 py-0.5 bg-gb-bg1 border border-gb-bg3">
                            fb: {status.krfbConfig.framebuffer}
                          </span>
                          {status.krfbConfig.unattendedAccess && (
                            <span className="px-1.5 py-0.5 bg-gb-bg1 border border-gb-green-dim text-gb-green">
                              unattended
                            </span>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">
                          VNC Password
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none transition-colors placeholder:text-gb-bg4"
                          placeholder="Leave blank if none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gb-aqua text-gb-bg0-hard font-black uppercase tracking-wide border-2 border-gb-aqua hover:bg-gb-aqua-dim transition-colors"
                      >
                        <MonitorPlay size={16} />
                        Connect via noVNC
                      </button>
                    </>
                  )}
                </form>
              </div>
            )}

            {/* Connecting spinner */}
            {state === STATE.CONNECTING && (
              <div className="flex flex-col items-center text-gb-fg4">
                <Loader2 size={28} className="animate-spin text-gb-aqua mb-4" />
                <p className="text-sm">Negotiating VNC handshake...</p>
              </div>
            )}
          </div>
        )}

        {/* Error banner — always on top */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim px-4 py-3 z-20 mx-4 max-w-xl">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{error}</p>
            <button onClick={fetchStatus} className="p-1 hover:bg-gb-bg2 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
