import { useState, useRef, useCallback, useEffect } from 'react';
import RFB from '@novnc/novnc/lib/rfb';
import api from '../lib/api';

/* ── Connection states ─────────────────────────────────────────── */
export const CONN = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

/**
 * useRemoteDesktop — manages a single active remote connection.
 *
 * Tracks: protocol (vnc|rdp), target host/port, password,
 * connection lifecycle, noVNC RFB ref, and display settings.
 */
export default function useRemoteDesktop() {
  /* ── Connection identity ──────────────────────────────────────── */
  const [protocol, setProtocol] = useState('vnc'); // 'vnc' | 'rdp'
  const [targetHost, setTargetHost] = useState('127.0.0.1');
  const [targetPort, setTargetPort] = useState(5900);
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState(''); // descriptive label for UI

  /* ── Lifecycle ────────────────────────────────────────────────── */
  const [connState, setConnState] = useState(CONN.IDLE);
  const [error, setError] = useState(null);
  const rfbRef = useRef(null);
  const busy = useRef(false);

  /* ── Display settings ─────────────────────────────────────────── */
  const [scaleViewport, setScaleViewport] = useState(true);
  const [clipToWindow, setClipToWindow] = useState(false);
  const [resizeSession, setResizeSession] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [qualityLevel, setQualityLevel] = useState(6);
  const [compressionLevel, setCompressionLevel] = useState(2);
  const [clipboardText, setClipboardText] = useState('');

  /* ── Push settings to live RFB ────────────────────────────────── */
  useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.scaleViewport = scaleViewport;
    rfb.clipViewport = clipToWindow;
    rfb.resizeSession = resizeSession;
    rfb.viewOnly = viewOnly;
    rfb.qualityLevel = qualityLevel;
    rfb.compressionLevel = compressionLevel;
  }, [scaleViewport, clipToWindow, resizeSession, viewOnly, qualityLevel, compressionLevel]);

  /* ── Connect (VNC via noVNC) ──────────────────────────────────── */
  const connectVnc = useCallback(
    (displayEl, { host, port, pwd, name } = {}) => {
      if (busy.current) return;
      busy.current = true;

      const h = host || targetHost;
      const p = port || targetPort;
      const pw = pwd ?? password;
      const lbl = name || `${h}:${p}`;

      setTargetHost(h);
      setTargetPort(p);
      setPassword(pw);
      setLabel(lbl);
      setProtocol('vnc');
      setConnState(CONN.CONNECTING);
      setError(null);

      if (displayEl) displayEl.innerHTML = '';

      try {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${window.location.host}/vnc?host=${encodeURIComponent(h)}&port=${p}`;

        const rfb = new RFB(displayEl, wsUrl, {
          credentials: { password: pw },
        });
        rfbRef.current = rfb;

        rfb.background = '#1d2021';
        rfb.scaleViewport = scaleViewport;
        rfb.clipViewport = clipToWindow;
        rfb.resizeSession = resizeSession;
        rfb.viewOnly = viewOnly;
        rfb.qualityLevel = qualityLevel;
        rfb.compressionLevel = compressionLevel;

        rfb.addEventListener('connect', () => {
          setConnState(CONN.CONNECTED);
          busy.current = false;
        });

        rfb.addEventListener('disconnect', (e) => {
          busy.current = false;
          rfbRef.current = null;
          if (e.detail.clean === false) {
            setError('Connection dropped unexpectedly');
            setConnState(CONN.ERROR);
          } else {
            setConnState(CONN.IDLE);
          }
        });

        rfb.addEventListener('securityfailure', (e) => {
          busy.current = false;
          rfbRef.current = null;
          setError('Authentication failed — ' + (e.detail.reason || 'wrong password?'));
          setConnState(CONN.ERROR);
        });

        rfb.addEventListener('clipboard', (e) => {
          setClipboardText(e.detail.text);
        });
      } catch (err) {
        busy.current = false;
        setError('Failed to initialise: ' + err.message);
        setConnState(CONN.ERROR);
      }
    },
    [targetHost, targetPort, password, scaleViewport, clipToWindow, resizeSession, viewOnly, qualityLevel, compressionLevel]
  );

  /* ── Disconnect ───────────────────────────────────────────────── */
  const disconnect = useCallback(() => {
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch {}
      rfbRef.current = null;
    }
    busy.current = false;
    setConnState(CONN.IDLE);
    setError(null);
  }, []);

  /* ── Actions forwarded to RFB ─────────────────────────────────── */
  const sendCtrlAltDel = useCallback(() => {
    rfbRef.current?.sendCtrlAltDel();
  }, []);

  const sendClipboard = useCallback((text) => {
    rfbRef.current?.clipboardPasteFrom(text);
  }, []);

  /* ── Cleanup on unmount ───────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (rfbRef.current) {
        try { rfbRef.current.disconnect(); } catch {}
        rfbRef.current = null;
      }
    };
  }, []);

  return {
    /* state */
    protocol,
    targetHost,
    targetPort,
    password,
    label,
    connState,
    error,
    rfbRef,
    clipboardText,

    /* settings */
    scaleViewport, setScaleViewport,
    clipToWindow, setClipToWindow,
    resizeSession, setResizeSession,
    viewOnly, setViewOnly,
    qualityLevel, setQualityLevel,
    compressionLevel, setCompressionLevel,

    /* actions */
    connectVnc,
    disconnect,
    sendCtrlAltDel,
    sendClipboard,
    setClipboardText,
    setPassword,
  };
}
