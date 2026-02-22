import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

// Gruvbox dark palette for the terminal (always dark regardless of UI theme)
const GRUVBOX_THEME = {
  background: '#1d2021',
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

export default function Terminal() {
  const termRef = useRef(null);
  const xtermRef = useRef(null);

  useEffect(() => {
    if (!termRef.current) return;

    // ── xterm.js instance ───────────────────────────────────────
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: GRUVBOX_THEME,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(termRef.current);
    fitAddon.fit();
    xtermRef.current = xterm;

    // ── Socket.io connection ────────────────────────────────────
    const socket = io('/terminal', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('terminal:start', {
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });

    socket.on('terminal:output', (data) => xterm.write(data));

    socket.on('terminal:exit', ({ code }) => {
      xterm.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`);
    });

    // User types → server
    xterm.onData((data) => socket.emit('terminal:input', data));

    // Resize
    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal:resize', {
        cols: xterm.cols,
        rows: xterm.rows,
      });
    };
    window.addEventListener('resize', handleResize);

    // ── Cleanup ─────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      xterm.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-2xl font-black uppercase tracking-tight mb-4 text-gb-fg1">Terminal</h1>
      <div
        ref={termRef}
        className="flex-1 min-h-0 w-full border-2 border-gb-bg2 overflow-hidden"
      />
    </div>
  );
}
