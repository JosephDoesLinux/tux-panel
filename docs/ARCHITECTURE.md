# TuxPanel — Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React 19 + Tailwind 4 + Vite                                │   │
│  │                                                              │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐  │   │
│  │  │  Dashboard   │ │  Terminal    │ │  Shares / Users / RDP │  │   │
│  │  │  (Recharts)  │ │  (xterm.js) │ │  (CRUD forms)         │  │   │
│  │  └──────┬───────┘ └──────┬───────┘ └───────────┬───────────┘  │   │
│  │         │ REST           │ WebSocket            │ REST         │   │
│  │         │                │ + VNC(noVNC)         │              │   │
│  └─────────┼────────────────┼──────────────────────┼─────────────┘   │
│            │                │                      │                  │
└────────────┼────────────────┼──────────────────────┼─────────────────┘
             │  :5173 proxy   │                      │
             ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Node.js Server (:3001)                            │
│                                                                     │
│  ┌─────────────┐  ┌────────────────────┐  ┌─────────────────────┐  │
│  │  Express     │  │  Socket.io          │  │  Auth Middleware    │  │
│  │  REST API    │  │  /terminal (pty)    │  │  (JWT + rate limit) │  │
│  │              │  │  /stats (metrics)   │  │                     │  │
│  └──────┬───────┘  └────────┬───────────┘  └─────────────────────┘  │
│         │                   │                                        │
│  ┌──────┴───────────────────┴────────────────────────────────────┐  │
│  │                    Command Runner                              │  │
│  │  • Allow-listed commands only                                  │  │
│  │  • Argument sanitisation                                       │  │
│  │  • execFile (no shell)                                         │  │
│  │  • Timeout enforcement                                         │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │ execFile (no shell)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Fedora Linux                                │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ systemd  │ │  Samba   │ │   NFS    │ │  sshd    │ │  krfb   │ │
│  │          │ │ smb/nmb  │ │  server  │ │          │ │  (VNC)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ /etc/samba/       │  │ /etc/exports │  │ firewalld + SELinux  │  │
│  │   smb.conf        │  │              │  │                      │  │
│  └──────────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Security Model

1. **No shell execution** — All commands use `execFile()`, never `exec()`.
2. **Allow-list** — Every binary must be registered in `commandRunner.js`.
3. **Argument sanitisation** — Shell metacharacters are rejected.
4. **PAM authentication** — Users authenticate with Linux credentials;
   only members of the `tuxpanel` group may log in.
5. **JWT auth** — Sessions stored in httpOnly cookies (8 h expiry).
6. **Rate limiting** — Express rate-limit on all routes.
7. **Helmet** — Security headers (CSP, HSTS, etc.).
8. **SELinux** — Stays enforcing; targeted booleans set for Samba.

## Data Flow: Terminal Session

```
User types "ls" in browser
        │
        ▼
  xterm.js onData("ls\r")
        │
        ▼
  socket.emit('terminal:input', "ls\r")
        │
        ▼  WebSocket
  server: ptyProcess.write("ls\r")
        │
        ▼  node-pty → /bin/bash
  bash executes ls, produces output
        │
        ▼
  ptyProcess.onData(output)
        │
        ▼
  socket.emit('terminal:output', output)
        │
        ▼  WebSocket
  xterm.write(output)  →  rendered in browser
```
