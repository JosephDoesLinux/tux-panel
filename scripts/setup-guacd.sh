#!/usr/bin/env bash
# ============================================================
#  TuxPanel — Guacamole (guacd) Native Setup
#
#  Installs and enables the guacd daemon from Fedora repos.
#  guacd listens on port 4822 by default.
#
#  Run:  sudo bash scripts/setup-guacd.sh
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

# ── Install guacd + RDP protocol plugin ──────────────────────────────
if rpm -q guacd &>/dev/null && rpm -q libguac-client-rdp &>/dev/null; then
  info "guacd is already installed ($(rpm -q guacd))."
else
  info "Installing guacd and RDP protocol plugin…"
  dnf install -y guacd libguac-client-rdp
fi

# ── Bind to IPv4 localhost ────────────────────────────────────────────
# By default guacd listens on ::1 (IPv6 only). guacamole-lite connects
# to 127.0.0.1, so we need to force IPv4 binding.
if [[ ! -f /etc/sysconfig/guacd ]] || ! grep -q '\-b 127.0.0.1' /etc/sysconfig/guacd 2>/dev/null; then
  info "Configuring guacd to listen on 127.0.0.1…"
  echo 'OPTS="-b 127.0.0.1"' > /etc/sysconfig/guacd
fi

# ── Enable & start the service ───────────────────────────────────────
info "Enabling and starting guacd.service…"
systemctl enable --now guacd
systemctl restart guacd   # pick up any config changes

# ── Verify ───────────────────────────────────────────────────────────
if systemctl is-active --quiet guacd; then
  info "✔ guacd is running on port 4822."
else
  error "guacd failed to start. Check: journalctl -u guacd"
  exit 1
fi

echo ""
info "══════════════════════════════════════════════════════"
info "  guacd setup complete!"
info ""
info "  Service:  guacd.service (systemd)"
info "  Port:     4822"
info "  Verify:   systemctl status guacd"
info "  Logs:     journalctl -u guacd -f"
info "══════════════════════════════════════════════════════"
