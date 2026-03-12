# SPDX-License-Identifier: GPL-3.0-or-later
"""Paths, URLs, and compile-time constants."""

from __future__ import annotations

from pathlib import Path

# ── Install locations ──────────────────────────────────────────────────────
INSTALL_PREFIX = Path("/opt/tuxpanel")
SERVER_DIR = INSTALL_PREFIX / "server"
CLIENT_DIR = INSTALL_PREFIX / "client"
DATA_DIR = INSTALL_PREFIX / "data"
SCRIPTS_DIR = INSTALL_PREFIX / "scripts"

SYSTEMD_UNIT = Path("/etc/systemd/system/tuxpanel.service")
POLKIT_RULE = Path("/etc/polkit-1/rules.d/50-tuxpanel.rules")
ENVIRONMENT_FILE = Path("/etc/tuxpanel/environment")
SSL_DIR = Path("/etc/tuxpanel/ssl")

TRAY_DESKTOP = Path("/etc/xdg/autostart/tuxpanel-tray.desktop")
APP_DESKTOP = Path("/usr/share/applications/org.tuxpanel.desktop")
ICON_SYSTEM = Path("/usr/share/icons/hicolor/scalable/apps/tuxpanel.svg")

# ── Upstream ───────────────────────────────────────────────────────────────
GITHUB_REPO = "https://github.com/JosephDoesLinux/tux-panel"
GITHUB_API_LATEST = "https://api.github.com/repos/JosephDoesLinux/tux-panel/releases/latest"
ISSUES_URL = f"{GITHUB_REPO}/issues"

# ── Defaults ───────────────────────────────────────────────────────────────
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 3001
SERVICE_NAME = "tuxpanel.service"
SERVICE_USER = "tuxpanel"
SERVICE_GROUP = "tuxpanel"

# ── Sentinel for detecting existing installs ───────────────────────────────
VERSION_FILE = INSTALL_PREFIX / "VERSION"

# ── XDG session directory ─────────────────────────────────────────────────
XSESSIONS_DIR = Path("/usr/share/xsessions")

# ── Node.js ────────────────────────────────────────────────────────────────
NODE_MIN_MAJOR = 22
