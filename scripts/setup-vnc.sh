#!/usr/bin/env bash
# TuxPanel VNC Setup
set -euo pipefail

echo "Installing krfb (KDE VNC server) and x11vnc..."
dnf install -y krfb x11vnc

DESKTOP="${XDG_CURRENT_DESKTOP:-unknown}"

if [[ "$DESKTOP" == *KDE* ]]; then
  echo "Configuring KDE VNC server (krfb)…"
  KRFB_AUTOSTART="$HOME/.config/autostart/krfb.desktop"
  mkdir -p "$(dirname "$KRFB_AUTOSTART")"
  cat > "$KRFB_AUTOSTART" <<INNEREOF
[Desktop Entry]
Type=Application
Name=Desktop Sharing (TuxPanel)
Exec=krfb --nodialog
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
INNEREOF
  echo "krfb autostart configured. Make sure to set a password in the krfb GUI."
fi

echo "Done!"
