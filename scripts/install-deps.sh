#!/usr/bin/env bash
# ============================================================
#  TuxPanel — Fedora Dependency Installer
#  Run as root:  sudo bash scripts/install-deps.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERR]${NC}   $*"; }

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root (sudo)."
  exit 1
fi

info "Updating package cache…"
dnf makecache --refresh -q

# ── Core system utilities ────────────────────────────────────────────
PACKAGES=(
  # Already present but listed for completeness
  util-linux        # lsblk, mount, fdisk, etc.
  procps-ng         # ps, top, free, uptime
  iproute           # ip command
  hostname          # hostname command
  coreutils         # cat, df, etc.

  # NAS services
  samba             # SMB file sharing
  samba-client      # smbclient, smbstatus
  nfs-utils         # NFS server/client

  # Remote access
  openssh-server    # sshd
  tigervnc-server   # Xvnc for headless VNC sessions + RDP bridge
  freerdp           # xfreerdp for RDP-to-VNC bridging

  # Build tools for node-pty native compilation
  gcc-c++
  make
  cmake
  python3
  pam-devel

  # Guacamole (RDP proxy) — Phase 3
  guacd

  # Misc
  jq                # JSON parsing in scripts
  htop              # Nice-to-have
  lm_sensors        # CPU temp
)

info "Installing packages…"
dnf install -y "${PACKAGES[@]}"

# ── Enable services ─────────────────────────────────────────────────
info "Enabling Samba…"
systemctl enable --now smb nmb

info "Enabling NFS…"
systemctl enable --now nfs-server

info "Enabling SSH…"
systemctl enable --now sshd

# ── Firewall ─────────────────────────────────────────────────────────
if systemctl is-active --quiet firewalld; then
  info "Configuring firewalld…"
  firewall-cmd --permanent --add-service=samba
  firewall-cmd --permanent --add-service=nfs
  firewall-cmd --permanent --add-service=ssh
  firewall-cmd --permanent --add-port=3001/tcp   # TuxPanel API
  firewall-cmd --permanent --add-port=5173/tcp   # Vite dev server
  firewall-cmd --reload
fi

# ── SELinux booleans (Samba home dirs, NFS) ───────────────────────────
if command -v setsebool &>/dev/null; then
  info "Setting SELinux booleans for Samba…"
  setsebool -P samba_enable_home_dirs on
  setsebool -P samba_export_all_rw on
fi

# ── Polkit – authorisation rules for the tuxpanel group ──────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLKIT_SRC="${SCRIPT_DIR}/../server/polkit/50-tuxpanel.rules"
if [[ -f "$POLKIT_SRC" ]]; then
  info "Installing polkit rules for tuxpanel group…"
  install -m 0644 "$POLKIT_SRC" /etc/polkit-1/rules.d/50-tuxpanel.rules
  # Remove the old power-only rule if it exists
  rm -f /etc/polkit-1/rules.d/50-tuxpanel-power.rules
  info "Polkit rules installed (/etc/polkit-1/rules.d/50-tuxpanel.rules)"
else
  warn "server/polkit/50-tuxpanel.rules not found – skipping polkit setup"
fi

info "──────────────────────────────────────────────"
info "  System dependencies installed successfully."
info "  Next: run 'npm run install:all' from the project root."
info "──────────────────────────────────────────────"
