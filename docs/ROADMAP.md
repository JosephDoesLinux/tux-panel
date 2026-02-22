# TuxPanel — Development Roadmap

## Phase 1: The Core Bridge 🔨
> Secure foundation connecting Node.js to the Linux system

### 1.1 — Project Scaffolding
- [x] Monorepo structure (client / server / scripts)
- [x] Express + Socket.io server boilerplate
- [x] React + Tailwind + Vite client boilerplate
- [x] Safe command execution wrapper (`commandRunner.js`)
- [x] Winston logging with file rotation

### 1.2 — Secure System Access
- [x] Fedora dependency installer script
- [x] PAM-based authentication (tuxpanel group)
- [x] JWT sessions in httpOnly cookies (8 h expiry)
- [x] Login / logout / session-check API
- [x] React auth context with route guards
- [ ] HTTPS / TLS configuration

### 1.3 — System Health Monitoring
- [x] `/api/health` — liveness probe
- [x] `/api/system/overview` — CPU, memory, disk, load
- [x] `/api/system/memory` — parsed /proc/meminfo
- [x] `/api/system/network` — `ip -j addr` output
- [x] `/api/system/services` — running systemd units
- [ ] CPU temperature via lm_sensors
- [ ] Disk I/O stats
- [ ] Service start/stop/restart via API

### 1.4 — Dashboard UI (Basic)
- [x] Sidebar layout with routing
- [x] Dashboard page with stat cards
- [ ] Auto-refresh (polling or WebSocket push)
- [ ] Responsive mobile layout

---

## Phase 2: Identity & Storage 🗄️
> User/group management and NAS file sharing

### 2.1 — User & Group Management
- [ ] `GET /api/users` — list system users (parse `/etc/passwd`)
- [ ] `POST /api/users` — create user (`useradd`)
- [ ] `PUT /api/users/:uid` — modify user (`usermod`)
- [ ] `DELETE /api/users/:uid` — remove user (`userdel`)
- [ ] `GET /api/groups` — list groups
- [ ] `POST /api/groups` — create group
- [ ] Samba password management (`pdbedit`)
- [ ] Users management UI page

### 2.2 — Samba (SMB) Configuration
- [ ] Parser for `/etc/samba/smb.conf` (read → JSON)
- [ ] Writer: JSON → `smb.conf` (safe atomic write)
- [ ] `GET /api/shares/smb` — list configured shares
- [ ] `POST /api/shares/smb` — create/update share
- [ ] `DELETE /api/shares/smb/:name` — remove share
- [ ] Restart smb/nmb after config changes
- [ ] Shares management UI page

### 2.3 — NFS Configuration
- [ ] Parser for `/etc/exports`
- [ ] `GET /api/shares/nfs` — list NFS exports
- [ ] `POST /api/shares/nfs` — add export
- [ ] `DELETE /api/shares/nfs/:path` — remove export
- [ ] `exportfs -ra` after changes
- [ ] NFS management UI page

---

## Phase 3: Remote Tools 🖥️
> In-browser terminal and RDP access

### 3.1 — Web Terminal (node-pty)
- [x] Socket.io `/terminal` namespace
- [x] node-pty spawn/kill lifecycle
- [x] xterm.js frontend with fit/resize
- [ ] Multiple concurrent terminal tabs
- [ ] Session persistence (reconnect)
- [ ] SSH to remote hosts (not just localhost)

### 3.2 — Web RDP (Guacamole Proxy)
- [x] guacd Docker setup script
- [ ] Guacamole client library integration
- [ ] `POST /api/rdp/connect` — initiate RDP session
- [ ] Connection manager (saved hosts)
- [ ] RDP viewer UI page (canvas-based)
- [ ] Clipboard & file transfer support

---

## Phase 4: Intelligence & UI 🧠
> AI chatbot and polished dashboard visualisations

### 4.1 — Live Dashboard Visualisations
- [ ] Real-time CPU usage chart (Recharts + Socket.io push)
- [ ] Memory usage timeline
- [ ] Disk usage donut charts
- [ ] Network throughput graph
- [ ] Service health status grid
- [ ] Alert thresholds & notifications

### 4.2 — AI Troubleshooting Chatbot
- [ ] Chat UI component (message list + input)
- [ ] Backend integration with LLM API (Ollama local or OpenAI)
- [ ] System context injection (current health data fed to prompt)
- [ ] Suggested commands (with user confirmation before execution)
- [ ] Conversation history persistence

### 4.3 — Polish & Hardening
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Audit logging (who did what, when)
- [ ] Backup & restore of panel config
- [ ] Packaging as a systemd service
- [ ] Installation wizard (first-run setup)

---

## Fedora System Dependencies

| Package             | Purpose                        | Status on this machine      |
| ------------------- | ------------------------------ | --------------------------- |
| `util-linux`        | lsblk, mount, fdisk, etc.     | ✅ 2.41.3                   |
| `samba`             | SMB file sharing               | ✅ 4.23.4 (smb active)      |
| `samba-client`      | smbclient, smbstatus           | ✅ 4.23.4                   |
| `nfs-utils`         | NFS server/client              | ✅ 2.8.4 (server inactive)  |
| `openssh-server`    | SSH daemon                     | ✅ sshd active              |
| `firewalld`         | Firewall management            | ✅ 2.3.2 (active)           |
| `docker`            | Container runtime (for guacd)  | ✅ 29.1.4                   |
| `guacd`             | Guacamole RDP proxy daemon     | ❌ Not in Fedora repos — use Docker |
| `lm_sensors`        | CPU temperature readings       | ⬜ Install needed            |
| `jq`                | JSON processing in scripts     | ⬜ Install needed            |
| `gcc-c++` / `make`  | Build node-pty native module   | ⬜ Verify                    |

### Notable Environment Facts
- **SELinux:** Enforcing (requires `samba_enable_home_dirs`, `samba_export_all_rw`)
- **ZeroTier:** Active (zt4hombach interface at 10.147.20.90) — useful for remote access
- **Filesystem:** btrfs on nvme0n1p6 (88% used — 57 GB free)
- **User:** joseph (uid=1000), member of wheel, docker, libvirt, ollama groups
- **Ollama:** Group exists — local LLM already set up (useful for Phase 4 AI chatbot)
