#!/usr/bin/env bash
# ============================================================
#  TuxPanel — Remote Desktop Setup
#
#  Installs VNC/RDP tooling so TuxPanel can discover and
#  bridge remote desktop sessions. Run as root:
#    sudo bash scripts/setup-vnc.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }

DESKTOP="${XDG_CURRENT_DESKTOP:-unknown}"
PACKAGES=(tigervnc-server freerdp)

# Desktop-specific VNC servers
if [[ "$DESKTOP" == *KDE* ]]; then
  info "Detected KDE — will install krfb"
  PACKAGES+=(krfb)
elif [[ "$DESKTOP" == *GNOME* ]]; then
  info "Detected GNOME — will install gnome-remote-desktop"
  PACKAGES+=(gnome-remote-desktop)
else
  info "Desktop: $DESKTOP — installing x11vnc as generic VNC server"
  PACKAGES+=(x11vnc)
fi

info "Installing packages: ${PACKAGES[*]}"
dnf install -y "${PACKAGES[@]}"

# KDE: optional krfb autostart
if [[ "$DESKTOP" == *KDE* ]] && command -v krfb &>/dev/null; then
  SUDO_USER="${SUDO_USER:-$USER}"
  KRFB_AUTOSTART="/home/$SUDO_USER/.config/autostart/krfb.desktop"
  if [[ ! -f "$KRFB_AUTOSTART" ]]; then
    info "Creating krfb autostart entry for $SUDO_USER"
    mkdir -p "$(dirname "$KRFB_AUTOSTART")"
    cat > "$KRFB_AUTOSTART" <<'INNEREOF'
[Desktop Entry]
Type=Application
Name=Desktop Sharing (TuxPanel)
Exec=krfb --nodialog
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
INNEREOF
    chown "$SUDO_USER:$SUDO_USER" "$KRFB_AUTOSTART"
    info "krfb autostart configured — set a password in the krfb GUI."
  else
    info "krfb autostart already exists — skipping."
  fi
fi

info "────────────────────────────────────────"
info "  Remote Desktop setup complete."
info "  TuxPanel will auto-discover VNC/RDP"
info "  servers on next /api/rdp/discover call."
info "────────────────────────────────────────"
