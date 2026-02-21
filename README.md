# 🐧 TuxPanel

> A modern, Node-based orchestration dashboard for Linux — managing NAS functions, remote access, and system health from a single pane of glass.

**Built for Fedora** (initially Fedora 43 KDE) with a reactive JS stack that replaces legacy PHP panels.

---

## Tech Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Frontend    | React 19, Tailwind CSS 4, Vite 6, xterm.js    |
| Backend     | Node.js 22, Express 4, Socket.io 4            |
| Integration | node-pty (SSH/terminal), guacd (Web-RDP)      |
| System      | systemd, Samba, NFS, firewalld, SELinux       |

---

## Project Structure

```
tux-panel/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route-level views
│   │   ├── lib/             # API client, socket helpers
│   │   └── hooks/           # Custom React hooks
│   └── vite.config.js
├── server/                  # Express + Socket.io backend
│   ├── src/
│   │   ├── routes/          # REST API endpoints
│   │   ├── sockets/         # Socket.io namespaces (terminal, stats)
│   │   ├── services/        # Business logic (samba, nfs, users)
│   │   ├── parsers/         # Config file parsers (smb.conf, exports)
│   │   └── utils/           # Logger, commandRunner, helpers
│   └── .env.example
├── scripts/                 # System-level setup scripts
│   ├── install-deps.sh      # Fedora package installer
│   ├── setup-sudoers.sh     # Least-privilege sudo rules
│   └── setup-guacd.sh       # Guacamole Docker container
├── docs/                    # Architecture & roadmap docs
└── package.json             # Root workspace (concurrently)
```

---

## Quick Start

```bash
# 1 — Clone
git clone git@github.com:JosephDoesLinux/tux-panel.git
cd tux-panel

# 2 — System dependencies (Fedora)
sudo bash scripts/install-deps.sh

# 3 — Sudoers (for safe Node→system commands)
sudo bash scripts/setup-sudoers.sh $USER

# 4 — Install Node packages
npm run install:all

# 5 — Copy env
cp server/.env.example server/.env

# 6 — Run dev servers (API on :3001, UI on :5173)
npm run dev
```

---

## Development Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full 4-phase plan.

| Phase | Name                  | Status      |
| ----- | --------------------- | ----------- |
| 1     | The Core Bridge       | 🔨 Active   |
| 2     | Identity & Storage    | ⏳ Planned  |
| 3     | Remote Tools          | ⏳ Planned  |
| 4     | Intelligence & UI     | ⏳ Planned  |

---

## System Requirements

- **OS:** Fedora 43+ (systemd-based Linux)
- **Node.js:** 22.x LTS
- **Docker:** For guacd (RDP proxy)
- **Packages:** samba, nfs-utils, openssh-server, util-linux

---

## License

MIT © JosephDoesLinux
