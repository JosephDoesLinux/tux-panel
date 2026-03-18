# SPDX-License-Identifier: GPL-3.0-or-later
"""Page 3 — Server configuration (host, port, TLS, admin user, autostart)."""

from __future__ import annotations

import os

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from .. import constants as C
from ..installer import InstallManifest


class ConfigPage(QWidget):
    """Collects server settings before kicking off installation."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 32, 32, 32)
        root.setSpacing(16)

        title = QLabel("Server Configuration")
        title.setObjectName("page-title")
        title.setStyleSheet("font-size: 22px; font-weight: 700;")
        root.addWidget(title)

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        form.setSpacing(12)
        root.addLayout(form)

        # ── Listen address ─────────────────────────────────────────────
        self._host = QComboBox()
        self._host.setEditable(True)
        self._host.addItems(["0.0.0.0", "127.0.0.1", "::"])
        form.addRow("Listen address:", self._host)

        # ── Port ───────────────────────────────────────────────────────
        self._port = QSpinBox()
        self._port.setRange(1024, 65535)
        self._port.setValue(C.DEFAULT_PORT)
        form.addRow("Port:", self._port)

        # ── TLS ────────────────────────────────────────────────────────
        self._tls = QComboBox()
        self._tls.addItems(["Self-signed certificate", "None (HTTP only)"])
        form.addRow("HTTPS:", self._tls)

        # ── Admin user ─────────────────────────────────────────────────
        self._admin = QLineEdit()
        self._admin.setPlaceholderText("PAM username")
        self._admin.setText(os.environ.get("USER", ""))
        form.addRow("Admin user:", self._admin)

        # ── Checkboxes ─────────────────────────────────────────────────
        self._autostart = QCheckBox("Start on boot (enable systemd unit)")
        self._autostart.setChecked(True)
        form.addRow("", self._autostart)

        self._firewall = QCheckBox("Open port in firewall (firewalld / ufw)")
        self._firewall.setChecked(True)
        form.addRow("", self._firewall)

        root.addStretch()

        note = QLabel(
            "The installer will use <b>pkexec</b> to perform privileged operations.\n"
            "You will be prompted for your password once."
        )
        note.setWordWrap(True)
        note.setTextFormat(Qt.TextFormat.RichText)
        note.setStyleSheet("font-size: 12px;")
        root.addWidget(note)

    # ── Public API ─────────────────────────────────────────────────────

    def apply_to(self, manifest: InstallManifest) -> None:
        """Write form values into the manifest."""
        manifest.host = self._host.currentText().strip() or C.DEFAULT_HOST
        manifest.port = self._port.value()
        manifest.tls_mode = "self-signed" if self._tls.currentIndex() == 0 else "none"
        manifest.admin_user = self._admin.text().strip()
        manifest.enable_on_boot = self._autostart.isChecked()
        manifest.open_firewall = self._firewall.isChecked()
