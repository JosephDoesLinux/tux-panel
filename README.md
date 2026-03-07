# 🐧 TuxPanel

> A modern, Node-based orchestration dashboard for Linux — managing NAS functions, remote access, and system health from a single pane of glass.

**Built for Fedora** (initially Fedora 43 KDE) with a reactive JS stack that replaces legacy PHP panels.

---

## Tech Stack

| Layer       | Technology                                         |
| ----------- | -------------------------------------------------- |
| Frontend    | React 19, Tailwind CSS 4, Vite 6, xterm.js, noVNC |
| Backend     | Node.js 22, Express 4, Socket.io 4, TypeScript     |
| Integration | node-pty (terminal), krfb/VNC (remote desktop)     |
| System      | systemd, Samba, NFS, Docker, firewalld, SELinux    |

---

## Project Structure

```
tux-panel/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # Layout, AIChatbot, ConfigEditor, TerminalPane
│   │   ├── pages/           # Dashboard, Terminal, RemoteDesktop, Disks,
│   │   │                    # Services, Containers, Accounts, Troubleshooting
│   │   ├── contexts/        # AuthContext, ThemeContext, TerminalContext
│   │   ├── hooks/           # Custom React hooks (useTabSync)
│   │   └── lib/             # API client (axios)
│   └── vite.config.js
├── server/                  # Express + Socket.io backend (TypeScript)
│   ├── src/
│   │   ├── routes/          # REST API endpoints
│   │   ├── sockets/         # Socket.io namespaces (terminal)
│   │   ├── services/        # authService, desktopService, vncService
│   │   ├── parsers/         # Config file parsers
│   │   └── utils/           # Logger, commandRunner, asyncContext
│   └── .env.example
├── scripts/                 # System-level setup scripts
│   ├── install-deps.sh      # Fedora package installer + polkit rules
│   └── setup-vnc.sh         # KDE VNC server (krfb) setup
├── docs/                    # Architecture & documentation
│   ├── ARCHITECTURE.md
│   └── DOCUMENTATION.md
└── package.json             # Root workspace (concurrently)
```

---

## Quick Start

```bash
# 1 — Clone
git clone git@github.com:JosephDoesLinux/tux-panel.git
cd tux-panel

# 2 — System dependencies (Fedora)
#     Also installs polkit rules so the tuxpanel group can
#     manage services, users, and power without password prompts.
sudo bash scripts/install-deps.sh

# 3 — Create the tuxpanel group & add your user
sudo groupadd tuxpanel
sudo usermod -aG tuxpanel $USER
# Log out and back in for group to take effect

# 4 — Re-run the installer so polkit rules pick up the new group
sudo bash scripts/install-deps.sh

# 5 — PAM service config
echo -e 'auth       required     pam_unix.so\naccount    required     pam_unix.so' | sudo tee /etc/pam.d/tuxpanel

# 6 — Install Node packages
npm run install:all

# 7 — Copy env
cp server/.env.example server/.env

# 8 — Run dev servers (API on :3001, UI on :5173)
npm run dev
```

---

## Features

| Page             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| Dashboard        | Real-time CPU, RAM, disk, network gauges (Recharts)      |
| Terminal         | Full web terminal (xterm.js + node-pty over WebSocket)   |
| Remote Desktop   | In-browser VNC via noVNC + krfb WebSocket proxy          |
| Disks            | Block devices, SMART health, BTRFS subvols, mount points |
| Services         | systemd unit control (start/stop/restart/logs)           |
| Containers       | Docker management (ps, images, logs, stats, inspect)     |
| Accounts         | Linux user & group CRUD                                  |
| Troubleshooting  | journalctl, dmesg, failed units, ping/traceroute/dig     |
| AI Chatbot       | Integrated AI assistant for system administration help   |

---

## System Requirements

- **OS:** Fedora 43+ (systemd-based Linux)
- **Node.js:** 22.x LTS
- **Packages:** samba, nfs-utils, openssh-server, util-linux, docker

---

## License

MIT © JosephDoesLinux
