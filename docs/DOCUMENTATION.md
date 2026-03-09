# TuxPanel Documentation

This document provides a deep dive into the architecture, data flow, security model, and page-by-page breakdown of the TuxPanel project.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [Security Model](#security-model)
4. [Authentication & Command Execution Flow](#authentication--command-execution-flow)
5. [Page Breakdown](#page-breakdown)

---

## Architecture Overview

TuxPanel is a full-stack web application designed to manage a Linux system. It is split into a React frontend (Client) and a Node.js/Express backend (Server).

### Frontend (Client)
- **Framework:** React (bootstrapped with Vite).
- **Routing:** React Router (`react-router-dom`) handles client-side navigation.
- **State Management:** React Context API is used for global state:
  - `AuthContext`: Manages user session, login/logout functions, and protects routes.
  - `ThemeContext`: Manages UI theming (e.g., dark/light mode).
  - `TerminalContext`: Manages WebSocket connections for the web-based terminal.
- **Styling:** Tailwind CSS 4 with a custom Gruvbox theme (dark/light modes).

### Backend (Server)
- **Framework:** Node.js with Express.
- **Authentication:** PAM (Pluggable Authentication Modules) via `authenticate-pam` to validate actual Linux system credentials.
- **Command Execution:** A strict, allow-listed command runner (`commandRunner.ts`) that prevents arbitrary shell execution.
- **Real-time Communication:** Socket.io for streaming terminal I/O and potentially container logs.
- **Privilege Escalation:** Uses `pkexec` and Polkit rules to execute privileged commands securely without storing plaintext passwords.

---

## Data Flow

1. **Client Request:** The React frontend makes HTTP REST API calls (via `axios` or `fetch` in `api.js`) to the Express backend.
2. **Middleware Interception:** 
   - `helmet` secures HTTP headers.
   - `cors` verifies the origin.
   - `rateLimit` prevents abuse.
   - `requireAuth` (for protected routes) verifies the JWT in the `httpOnly` cookie.
   - `asyncLocalStorage` wraps the request to maintain context (like the authenticated user) across asynchronous operations without passing `req` everywhere.
3. **Route Handler:** The specific route (e.g., `/api/services`) processes the request and determines which system command needs to be run.
4. **Command Runner:** The route calls `commandRunner.run(commandName, args)`.
5. **Execution:** The command runner validates the command against a hardcoded registry, sanitizes arguments, and spawns a child process using `execFile` (elevating via `pkexec` if required).
6. **Response:** The stdout/stderr of the command is captured, parsed (often from JSON), and sent back to the client as an HTTP response.

---

## Security Model

Security is a primary focus of TuxPanel, as it provides web-based access to critical system functions.

### 1. Authentication & Session Management
- **PAM Integration:** Users log in with their actual Linux username and password.
- **Group Restriction:** Successful PAM authentication is not enough; the user must also be a member of the `tuxpanel` Linux group.
- **JWT & Cookies:** Upon login, a JSON Web Token (JWT) is generated and stored in an `httpOnly`, `secure` (in production), and `sameSite` cookie. This prevents Cross-Site Scripting (XSS) attacks from stealing the token and mitigates Cross-Site Request Forgery (CSRF).

### 2. Command Execution (No Shell Injection)
- **No Arbitrary Shells:** The backend *never* executes arbitrary shell strings (e.g., `exec('ls ' + userInput)`).
- **Allow-list:** Every permitted command is hardcoded in `COMMAND_REGISTRY` within `commandRunner.ts`.
- **Argument Sanitization:** Arguments are passed as an array to `execFile`, bypassing the shell entirely. The runner also explicitly checks arguments for illegal shell metacharacters (`;`, `&`, `|`, `$`, etc.).

### 3. Privilege Escalation (Polkit)
- **No Plaintext Passwords:** The backend does not store or handle plaintext passwords after the initial PAM authentication.
- **pkexec:** When a command requires elevated privileges, the runner uses `/usr/bin/pkexec` instead of `sudo`.
- **Polkit Rules:** A custom Polkit rule (`50-tuxpanel.rules`) is installed to allow members of the `tuxpanel` group to perform specific actions (like power management, systemd unit control, and running specific binaries) without a password prompt. This provides a secure, authorized privilege escalation path without needing to pass passwords around in memory.

---

## Authentication & Command Execution Flow

### Step-by-Step: What happens when a user logs in?
1. **Submit:** The user enters their Linux username and password on the `/login` page.
2. **API Call:** The frontend sends a `POST /api/auth/login` request.
3. **PAM Verification:** `authService.authenticate()` uses PAM to verify the credentials against `/etc/shadow`.
4. **Group Check:** The backend verifies the user is in the `tuxpanel` group.
5. **JWT Creation:** A JWT is signed containing the user's `sub` (username) and `groups`.
6. **Cookie Set:** The JWT is sent back as an `httpOnly` cookie (`tuxpanel_session`).
7. **Redirect:** The frontend `AuthContext` updates, and the user is redirected to the Dashboard.

### Step-by-Step: How are credentials carried over to commands?
1. **Protected Request:** The user clicks "Restart" on a service. The frontend sends `POST /api/services/restart`.
2. **Auth Middleware:** `requireAuth` reads the `tuxpanel_session` cookie, verifies the JWT, and attaches `req.user`.
3. **Async Context:** The `asyncLocalStorage` middleware ensures `req.user` is accessible anywhere in the current async execution tree.
4. **Command Invocation:** The route calls `commandRunner.run('systemctlAction', ['restart', 'nginx.service'])`.
5. **Registry Check:** `commandRunner` looks up `systemctlAction` and sees `sudo: true`.
6. **Execution:** It spawns `/usr/bin/pkexec /usr/bin/systemctl restart nginx.service`.
7. **Polkit Authorization:** `pkexec` checks the system's Polkit rules. Because the user is in the `tuxpanel` group and the action is permitted by `50-tuxpanel.rules`, the command executes successfully without prompting for a password.

---

## Page Breakdown

Here is an explanation of every page in the frontend application:

### 1. Login (`/login`)
The entry point of the application. It presents a form for the user to enter their Linux credentials. It redirects to the Dashboard upon successful authentication.

### 2. Dashboard (`/`)
The main landing page. It provides a high-level overview of system health, typically displaying real-time metrics such as CPU usage, RAM consumption, Disk space, and Network activity.

### 3. Terminal (`/terminal`)
A fully functional web-based terminal emulator (likely powered by xterm.js). It connects to the backend via WebSockets (`sockets/terminal.js`), providing the user with a direct, interactive shell session on the server.

### 4. Remote Desktop (`/rdp`)
Provides graphical remote access to the server's desktop or Docker containers. The backend discovery service (`discoveryService.ts`) auto-discovers all VNC and RDP endpoints on both the host and Docker containers. VNC connections are proxied directly via a WebSocket-to-TCP bridge (`vncService.ts`) to noVNC in the browser. RDP connections are bridged through an xfreerdp + Xvnc pipeline (`rdpBridgeService.ts`) that translates RDP into a local VNC endpoint, which noVNC then connects to. Users provide credentials (including username for RDP) at connect time.

### 5. Disks (`/disks`)
Manages physical block devices and advanced storage. It displays connected drives (`lsblk`), partitions, mount points (`findmnt`), SMART health status (`smartctl`), BTRFS subvolumes/snapshots, and Samba (SMB) and NFS share configuration with a semantic config editor.

### 6. Services (`/services`)
A GUI for `systemctl`. It lists all systemd services, showing their active/running state. Users can start, stop, restart, and view the journal logs for individual services. Also supports editing SSH server configuration with validation.

### 7. Containers (`/containers`)
A Docker management interface. It lists running and stopped containers (`docker ps`), available images, and allows users to start/stop containers, view real-time stats (`docker stats`), inspect container details, and view container logs.

### 8. Accounts (`/accounts`)
Manages Linux users and groups. It allows administrators to create new users (`useradd`), delete users (`userdel`), modify group memberships (`usermod`), and change passwords (`chpasswd`).

### 9. Troubleshooting (`/troubleshooting`)
A diagnostic hub. It provides access to system logs (`journalctl`), kernel ring buffer messages (`dmesg`), failed systemd units, and network diagnostic tools like `ping`, `traceroute`, and `dig`.

### AI Chatbot (Sidebar)
An integrated AI assistant available from any page via the sidebar. It provides context-aware system administration help and troubleshooting guidance.
