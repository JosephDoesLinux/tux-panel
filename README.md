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
│   ├── setup-guacd.sh       # Guacamole guacd daemon (native)
│   └── setup-rdp.sh         # RDP server detection & setup
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
- **guacd:** Guacamole proxy daemon (Fedora native package)
- **Packages:** samba, nfs-utils, openssh-server, util-linux

---

## License

MIT © JosephDoesLinux
