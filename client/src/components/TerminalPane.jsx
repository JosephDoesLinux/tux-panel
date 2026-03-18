/**
 * TerminalPane — renders a single xterm.js instance bound to a
 * TerminalContext session.
 *
 * On mount  → replays the session's output buffer so the user sees
 *              everything that happened while they were on another page.
 * On live   → subscribes to new output via the context's listener API.
 * On unmount → disposes the xterm instance but does NOT touch the socket
 *              (the session stays alive in TerminalContext).
 */

import { useEffect, useRef, memo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../contexts/TerminalContext';
import { useTheme } from '../contexts/ThemeContext';

const GRUVBOX_DARK = {
  background: 'rgba(29, 32, 33, 0.70)',
  foreground: '#ebdbb2',
  cursor: '#fabd2f',
  cursorAccent: '#1d2021',
  selectionBackground: '#504945',
  selectionForeground: '#ebdbb2',
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2',
};

const GRUVBOX_LIGHT = {
  background: 'rgba(249, 245, 215, 0.70)',
  foreground: '#3c3836',
  cursor: '#d79921',
  cursorAccent: '#fbf1c7',
  selectionBackground: '#d5c4a1',
  selectionForeground: '#3c3836',
  black: '#fbf1c7',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#665c54',
  brightBlack: '#928374',
  brightRed: '#9d0006',
  brightGreen: '#79740e',
  brightYellow: '#b57614',
  brightBlue: '#076678',
  brightMagenta: '#8f3f71',
  brightCyan: '#427b58',
  brightWhite: '#3c3836',
};

export default memo(function TerminalPane({ sessionId }) {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const { sendInput, sendResize, subscribe, getBuffer } = useTerminal();
  const { isDark } = useTheme();

  // Swap theme live when the user toggles dark/light
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = isDark ? GRUVBOX_DARK : GRUVBOX_LIGHT;
    }
  }, [isDark]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !sessionId) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: isDark ? GRUVBOX_DARK : GRUVBOX_LIGHT,
      allowTransparency: true,
    });
    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(el);

    // Let the container settle, then fit + send correct dimensions
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        sendResize(sessionId, xterm.cols, xterm.rows);
      } catch {
        /* container may have unmounted */
      }
    });

    // Replay buffered output
    const buf = getBuffer(sessionId);
    if (buf) xterm.write(buf);

    // Subscribe to live output
    const unsub = subscribe(sessionId, (data) => xterm.write(data));

    // User keystrokes → socket
    const onData = xterm.onData((data) => sendInput(sessionId, data));

    // ── Resize handling ──────────────────────────────────────────
    let resizeTimer;
    const doFit = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          sendResize(sessionId, xterm.cols, xterm.rows);
        } catch {
          /* disposed */
        }
      }, 60);
    };

    window.addEventListener('resize', doFit);

    const ro = new ResizeObserver(doFit);
    ro.observe(el);

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', doFit);
      ro.disconnect();
      unsub();
      onData.dispose();
      xterm.dispose();
      xtermRef.current = null;
    };
  }, [sessionId, sendInput, sendResize, subscribe, getBuffer]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
});
