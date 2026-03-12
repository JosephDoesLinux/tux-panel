# SPDX-License-Identifier: GPL-3.0-or-later
"""
System tray indicator for TuxPanel.

Sits in the taskbar and shows service status, active VNC sessions,
and quick actions (start / stop / restart / open dashboard / logs).

Polls ``systemctl is-active`` and the TuxPanel API on a timer to
stay up to date without a persistent connection.
"""

from __future__ import annotations

import subprocess
import webbrowser
from pathlib import Path

from PyQt6.QtCore import QTimer
from PyQt6.QtGui import QAction, QIcon
from PyQt6.QtWidgets import QMenu, QSystemTrayIcon

from .. import constants as C
from ..systemd import is_active, restart_service, start_service, stop_service

_ICON_DIR = Path(__file__).resolve().parent.parent / "resources" / "icons"

_POLL_INTERVAL_MS = 5_000


class TrayIndicator(QSystemTrayIcon):
    """AppIndicator-style tray icon using Qt's QSystemTrayIcon."""

    def __init__(self) -> None:
        super().__init__()

        self._running = False

        # ── Icons ──────────────────────────────────────────────────────
        self._icon_running = QIcon(str(_ICON_DIR / "tuxpanel.svg"))
        self._icon_stopped = QIcon(str(_ICON_DIR / "tuxpanel-stopped.svg"))
        self._icon_error = QIcon(str(_ICON_DIR / "tuxpanel-error.svg"))

        self.setIcon(self._icon_stopped)
        self.setToolTip("TuxPanel — checking…")

        # ── Context menu ───────────────────────────────────────────────
        menu = QMenu()

        self._status_action = QAction("TuxPanel")
        self._status_action.setEnabled(False)
        menu.addAction(self._status_action)

        menu.addSeparator()

        self._act_open = QAction("Open Dashboard")
        self._act_open.triggered.connect(self._open_dashboard)
        menu.addAction(self._act_open)

        menu.addSeparator()

        self._act_start = QAction("▶  Start Server")
        self._act_start.triggered.connect(self._do_start)
        menu.addAction(self._act_start)

        self._act_stop = QAction("■  Stop Server")
        self._act_stop.triggered.connect(self._do_stop)
        menu.addAction(self._act_stop)

        self._act_restart = QAction("↻  Restart Server")
        self._act_restart.triggered.connect(self._do_restart)
        menu.addAction(self._act_restart)

        menu.addSeparator()

        self._sessions_action = QAction("Active sessions: …")
        self._sessions_action.setEnabled(False)
        menu.addAction(self._sessions_action)

        menu.addSeparator()

        act_logs = QAction("View Logs…")
        act_logs.triggered.connect(self._view_logs)
        menu.addAction(act_logs)

        act_manage = QAction("Manage Components…")
        act_manage.triggered.connect(self._open_manage)
        menu.addAction(act_manage)

        menu.addSeparator()

        act_quit = QAction("Quit Tray")
        act_quit.triggered.connect(self._quit)
        menu.addAction(act_quit)

        self.setContextMenu(menu)
        self.activated.connect(self._on_activated)

        # ── Polling timer ──────────────────────────────────────────────
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._poll)
        self._timer.start(_POLL_INTERVAL_MS)
        self._poll()  # immediate first check

    # ── Polling ────────────────────────────────────────────────────────

    def _poll(self) -> None:
        self._running = is_active()
        self._update_ui()
        self._poll_sessions()

    def _update_ui(self) -> None:
        if self._running:
            self.setIcon(self._icon_running)
            self.setToolTip(f"TuxPanel — Running on :{C.DEFAULT_PORT}")
            self._status_action.setText(f"● Running on :{C.DEFAULT_PORT}")
            self._act_start.setEnabled(False)
            self._act_stop.setEnabled(True)
            self._act_restart.setEnabled(True)
            self._act_open.setEnabled(True)
        else:
            self.setIcon(self._icon_stopped)
            self.setToolTip("TuxPanel — Stopped")
            self._status_action.setText("● Stopped")
            self._act_start.setEnabled(True)
            self._act_stop.setEnabled(False)
            self._act_restart.setEnabled(False)
            self._act_open.setEnabled(False)

    def _poll_sessions(self) -> None:
        """Try to read active VNC sessions from vncserver.users."""
        try:
            users_file = Path("/etc/tigervnc/vncserver.users")
            if not users_file.exists():
                self._sessions_action.setText("Active sessions: N/A")
                return
            lines = [
                ln.strip() for ln in users_file.read_text().splitlines()
                if ln.strip() and not ln.strip().startswith("#") and "=" in ln
            ]
            self._sessions_action.setText(f"Active sessions: {len(lines)}")
        except Exception:
            self._sessions_action.setText("Active sessions: ?")

    # ── Actions ────────────────────────────────────────────────────────

    def _do_start(self) -> None:
        subprocess.Popen(["pkexec", "systemctl", "start", C.SERVICE_NAME])

    def _do_stop(self) -> None:
        subprocess.Popen(["pkexec", "systemctl", "stop", C.SERVICE_NAME])

    def _do_restart(self) -> None:
        subprocess.Popen(["pkexec", "systemctl", "restart", C.SERVICE_NAME])

    def _open_dashboard(self) -> None:
        webbrowser.open(f"https://localhost:{C.DEFAULT_PORT}")

    def _view_logs(self) -> None:
        subprocess.Popen([
            "xdg-open",
            f"journalctl -u {C.SERVICE_NAME} --no-pager -n 200",
        ])
        # Fallback: open a terminal with journalctl
        subprocess.Popen([
            "x-terminal-emulator", "-e",
            f"journalctl -u {C.SERVICE_NAME} -f",
        ])

    def _open_manage(self) -> None:
        subprocess.Popen(["tuxpanel-installer", "--manage"])

    def _quit(self) -> None:
        self.hide()
        from PyQt6.QtWidgets import QApplication
        QApplication.quit()

    def _on_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            if self._running:
                self._open_dashboard()
