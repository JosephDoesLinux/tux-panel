# SPDX-License-Identifier: GPL-3.0-or-later
"""Page 5 — Final status + launch actions."""

from __future__ import annotations

import subprocess
import webbrowser

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..installer import InstallManifest


class FinishPage(QWidget):
    """Shows success/failure and offers to open the dashboard or launch the tray."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 48, 32, 32)
        root.setSpacing(16)
        root.setAlignment(Qt.AlignmentFlag.AlignTop)

        self._icon = QLabel()
        self._icon.setStyleSheet("font-size: 48px;")
        root.addWidget(self._icon)

        self._title = QLabel()
        self._title.setObjectName("page-title")
        self._title.setStyleSheet("font-size: 26px; font-weight: 700;")
        root.addWidget(self._title)

        self._body = QLabel()
        self._body.setWordWrap(True)
        self._body.setTextFormat(Qt.TextFormat.RichText)
        self._body.setStyleSheet("font-size: 14px;")
        root.addWidget(self._body)

        root.addSpacing(24)

        # ── Actions ────────────────────────────────────────────────────
        btn_row = QHBoxLayout()
        self._btn_open = QPushButton("Open in Browser")
        self._btn_open.clicked.connect(self._open_browser)
        self._btn_tray = QPushButton("Launch Tray Indicator")
        self._btn_tray.clicked.connect(self._launch_tray)
        self._btn_logs = QPushButton("View Installation Logs")
        self._btn_logs.clicked.connect(self._show_logs_request)
        self._btn_logs.setVisible(False)  # Only show on failure

        btn_row.addWidget(self._btn_open)
        btn_row.addWidget(self._btn_tray)
        btn_row.addWidget(self._btn_logs)
        btn_row.addStretch()
        root.addLayout(btn_row)

        root.addStretch()

        self._manifest: InstallManifest | None = None

    # ── Public API ─────────────────────────────────────────────────────

    def set_result(self, success: bool, manifest: InstallManifest) -> None:
        self._manifest = manifest
        if success:
            scheme = "https" if manifest.tls_mode == "self-signed" else "http"
            url = f"{scheme}://localhost:{manifest.port}"
            self._icon.setText("✔")
            self._title.setText("Installation Complete")
            self._body.setText(
                f"TuxPanel is running at <b>{url}</b><br><br>"
                f"Systemd service: <code>tuxpanel.service</code> "
                f"({'enabled' if manifest.enable_on_boot else 'not enabled'})<br>"
                f"Tray indicator: <code>tuxpanel-tray</code>"
            )
            self._btn_open.setEnabled(True)
            self._btn_tray.setEnabled(True)
        else:
            self._icon.setText("✘")
            self._title.setText("Installation Failed")
            self._body.setText(
                "Something went wrong during installation.<br>"
                "Click <b>View Installation Logs</b> to see detailed error messages.<br><br>"
                "If you need help, file a bug at "
                "<a href='https://github.com/JosephDoesLinux/tux-panel/issues'>"
                "github.com/JosephDoesLinux/tux-panel/issues</a>."
            )
            self._btn_open.setEnabled(False)
            self._btn_tray.setEnabled(False)
            self._btn_logs.setVisible(True)

    # ── Actions ────────────────────────────────────────────────────────

    def _open_browser(self) -> None:
        if self._manifest:
            scheme = "https" if self._manifest.tls_mode == "self-signed" else "http"
            webbrowser.open(f"{scheme}://localhost:{self._manifest.port}")

    def _launch_tray(self) -> None:
        subprocess.Popen(
            ["tuxpanel-installer", "--tray"],
            start_new_session=True,
        )

    def _show_logs_request(self) -> None:
        """Request to show installation logs (navigates back to progress page)."""
        if self.parent():
            try:
                self.parent().show_logs()  # type: ignore
            except AttributeError:
                pass
