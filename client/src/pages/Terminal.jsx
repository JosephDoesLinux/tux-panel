import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

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
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e7eb',
        cursor: '#60a5fa',
        selectionBackground: '#334155',
      },
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
    <div>
      <h1 className="text-2xl font-bold mb-4">Terminal</h1>
      <div
        ref={termRef}
        className="w-full rounded-xl border border-gray-800 overflow-hidden"
        style={{ height: 'calc(100vh - 140px)' }}
      />
    </div>
  );
}
