/**
 * Terminal Context — manages multiple terminal sessions globally.
 *
 * Sessions (Socket.io connections + PTY output buffers) live here so they
 * survive React-Router navigations.  When the user leaves the Terminal page
 * and comes back, TerminalPane replays the buffer and re-subscribes.
 *
 * Split is per-tab: each session can optionally have a `splitId` pointing
 * to another session displayed side-by-side.  When unsplitting, the right
 * pane is promoted to its own independent tab.
 *
 * Provides:
 *   sessions        — [{ id, name, alive, splitId }]
 *   activeTabId     — currently-focused tab
 *   createSession   — open a new PTY
 *   closeSession    — kill PTY + disconnect socket
 *   renameSession   — change display name
 *   setActiveTab    — switch focused tab
 *   splitTab        — add a split pane to the active tab
 *   unsplitTab      — promote split pane to its own tab
 *   sendInput       — write to a session's PTY
 *   sendResize      — resize a session's PTY
 *   subscribe       — register a live-output callback (returns unsubscribe)
 *   getBuffer       — retrieve the accumulated output for replay
 */

import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const TerminalContext = createContext(null);
const MAX_BUFFER = 500_000; // characters
let counter = 0;

export function TerminalProvider({ children }) {
  // sessions now carry an optional splitId
  const [sessions, setSessions] = useState([]);  // [{ id, name, alive, splitId }]
  const [activeTabId, setActiveTab] = useState(null);
  const dataRef = useRef(new Map()); // id → { socket, buffer[], bufferSize, alive, listeners }

  /* ── Create ──────────────────────────────────────────────────── */
  const createSession = useCallback((name, { activate = true, hidden = false } = {}) => {
    const id = ++counter;
    const displayName = name || `Terminal ${id}`;

    const socket = io('/terminal', { transports: ['websocket'] });

    const entry = {
      socket,
      buffer: [],
      bufferSize: 0,
      alive: true,
      listeners: new Set(),
    };

    socket.on('connect', () => {
      socket.emit('terminal:start', { cols: 80, rows: 24 });
    });

    socket.on('terminal:output', (data) => {
      entry.buffer.push(data);
      entry.bufferSize += data.length;
      while (entry.bufferSize > MAX_BUFFER && entry.buffer.length > 1) {
        entry.bufferSize -= entry.buffer.shift().length;
      }
      for (const fn of entry.listeners) fn(data);
    });

    socket.on('terminal:exit', ({ code }) => {
      entry.alive = false;
      const msg = `\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`;
      entry.buffer.push(msg);
      entry.bufferSize += msg.length;
      for (const fn of entry.listeners) fn(msg);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, alive: false } : s)));
    });

    dataRef.current.set(id, entry);
    // hidden sessions (split children) are tracked in dataRef but not shown as tabs
    if (!hidden) {
      setSessions((prev) => [...prev, { id, name: displayName, alive: true, splitId: null }]);
    }
    if (activate) setActiveTab(id);
    return id;
  }, []);

  /* ── Close ───────────────────────────────────────────────────── */
  const closeSession = useCallback((id) => {
    // If this tab has a split child, close that too
    setSessions((prev) => {
      const tab = prev.find((s) => s.id === id);
      if (tab?.splitId) {
        const splitEntry = dataRef.current.get(tab.splitId);
        if (splitEntry) {
          splitEntry.socket.disconnect();
          dataRef.current.delete(tab.splitId);
        }
      }
      return prev;
    });

    // Also check if this session is someone else's split child — clear that reference
    setSessions((prev) =>
      prev
        .map((s) => (s.splitId === id ? { ...s, splitId: null } : s))
        .filter((s) => s.id !== id)
    );

    const entry = dataRef.current.get(id);
    if (entry) {
      entry.socket.disconnect();
      dataRef.current.delete(id);
    }

    setActiveTab((prev) => {
      if (prev !== id) return prev;
      const remaining = [...dataRef.current.keys()];
      return remaining.length > 0 ? remaining[remaining.length - 1] : null;
    });
  }, []);

  /* ── Rename ──────────────────────────────────────────────────── */
  const renameSession = useCallback((id, newName) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));
  }, []);

  /* ── Split: create a child session for the given tab ─────────── */
  const splitTab = useCallback((tabId) => {
    const childId = createSession(null, { activate: false, hidden: true });
    setSessions((prev) => prev.map((s) => (s.id === tabId ? { ...s, splitId: childId } : s)));
  }, [createSession]);

  /* ── Unsplit: promote the split child to its own tab ─────────── */
  const unsplitTab = useCallback((tabId) => {
    setSessions((prev) => {
      const tab = prev.find((s) => s.id === tabId);
      if (!tab?.splitId) return prev;
      const childId = tab.splitId;
      // Clear splitId on parent, then add child as a new visible tab
      const childName = `Terminal ${childId}`;
      return [
        ...prev.map((s) => (s.id === tabId ? { ...s, splitId: null } : s)),
        { id: childId, name: childName, alive: !!dataRef.current.get(childId)?.alive, splitId: null },
      ];
    });
  }, []);

  /* ── I/O helpers ─────────────────────────────────────────────── */
  const sendInput = useCallback((id, data) => {
    dataRef.current.get(id)?.socket.emit('terminal:input', data);
  }, []);

  const sendResize = useCallback((id, cols, rows) => {
    dataRef.current.get(id)?.socket.emit('terminal:resize', { cols, rows });
  }, []);

  const subscribe = useCallback((id, fn) => {
    const entry = dataRef.current.get(id);
    if (!entry) return () => {};
    entry.listeners.add(fn);
    return () => entry.listeners.delete(fn);
  }, []);

  const getBuffer = useCallback((id) => {
    return dataRef.current.get(id)?.buffer.join('') ?? '';
  }, []);

  /* ── Cleanup all on unmount (logout) ─────────────────────────── */
  useEffect(() => {
    return () => {
      for (const [, entry] of dataRef.current) entry.socket.disconnect();
      dataRef.current.clear();
    };
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        sessions,
        activeTabId,
        setActiveTab,
        createSession,
        closeSession,
        renameSession,
        splitTab,
        unsplitTab,
        sendInput,
        sendResize,
        subscribe,
        getBuffer,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
  return ctx;
}
