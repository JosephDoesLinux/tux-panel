#!/usr/bin/env bash
# ============================================================
#  TuxPanel — RDP / Remote Desktop Setup
#
#  Detects the current desktop environment and installs +
#  configures the appropriate session-sharing server so
#  TuxPanel can proxy it through Guacamole.
#
#  Run as root:  sudo bash scripts/setup-rdp.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERR]${NC}   $*"; }
step()  { echo -e "${CYAN}[STEP]${NC}  $*"; }

# ── Detect desktop ───────────────────────────────────────────────────
DESKTOP="${XDG_CURRENT_DESKTOP:-unknown}"
SESSION="${XDG_SESSION_TYPE:-unknown}"

info "Detected desktop: ${DESKTOP} (${SESSION})"

# ── Install packages based on DE ─────────────────────────────────────
step "Installing remote desktop server packages…"

case "$DESKTOP" in
  *KDE*)
    info "KDE Plasma detected — installing krdp + krfb"
    dnf install -y krdp krfb freerdp
    ;;
  *GNOME*)
    info "GNOME detected — installing gnome-remote-desktop"
    dnf install -y gnome-remote-desktop freerdp
    ;;
  *)
    warn "Unknown DE '${DESKTOP}' — installing krfb + freerdp as fallback"
    dnf install -y krfb freerdp
    ;;
esac

# ── Install & enable guacd (native package) ──────────────────────────
step "Setting up guacd (native)…"

if rpm -q guacd &>/dev/null; then
  info "guacd is already installed."
else
  dnf install -y guacd
fi

systemctl enable --now guacd
info "guacd is running on port 4822."

# ── Firewall ─────────────────────────────────────────────────────────
if systemctl is-active --quiet firewalld; then
  step "Configuring firewall…"
  # Only allow RDP on localhost (guacd connects locally)
  # No need to open 3389 externally — guacd is on the same machine
  firewall-cmd --permanent --add-port=4822/tcp 2>/dev/null || true
  firewall-cmd --reload
fi

# ── KDE-specific: ensure krdpserver starts with session ──────────────
if [[ "$DESKTOP" == *KDE* ]]; then
  step "Configuring KDE RDP server…"

  KRDP_AUTOSTART="$HOME/.config/autostart/krdpserver.desktop"
  if [[ ! -f "$KRDP_AUTOSTART" ]]; then
    mkdir -p "$(dirname "$KRDP_AUTOSTART")"
    cat > "$KRDP_AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=KDE RDP Server (TuxPanel)
Exec=krdpserver --address 127.0.0.1 --port 3389
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF
    info "Created autostart entry for krdpserver."
  else
    info "krdpserver autostart already exists."
  fi

  # Check if it's running now
  if ss -tlnp 2>/dev/null | grep -q krdpserver; then
    info "krdpserver is already running."
  else
    warn "krdpserver is not currently running."
    warn "It will start automatically on next login, or start it manually:"
    warn "  krdpserver --address 127.0.0.1 --port 3389 &"
  fi
fi

echo ""
info "══════════════════════════════════════════════════════"
info "  Remote Desktop setup complete!"
info ""
info "  RDP server:  krdpserver on :3389 (current session)"
info "  Guac proxy:  guacd (native) on :4822"
info "  TuxPanel:    proxies via guacamole-lite on :3001"
info ""
info "  Verify:  systemctl status guacd"
info "══════════════════════════════════════════════════════"
