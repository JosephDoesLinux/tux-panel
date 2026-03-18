# SPDX-License-Identifier: GPL-3.0-or-later
"""Page 1 — Welcome / mode detection."""

from __future__ import annotations

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QLabel, QVBoxLayout, QWidget

from .. import __version__
from ..installer import installed_version


class WelcomePage(QWidget):
    """Shows a greeting and, if TuxPanel is already installed, the current version."""

    def __init__(self, *, already_installed: bool = False, parent: QWidget | None = None) -> None:
        super().__init__(parent)

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        layout.setSpacing(16)
        layout.setContentsMargins(32, 48, 32, 32)

        # ── Title ──────────────────────────────────────────────────────
        title = QLabel("TuxPanel Installer")
        title.setObjectName("page-title")
        title.setStyleSheet("font-size: 28px; font-weight: 700;")
        layout.addWidget(title)

        # ── Subtitle ───────────────────────────────────────────────────
        subtitle = QLabel(
            "A self-hosted Linux administration dashboard.\n"
            "This wizard will walk you through installation and configuration."
        )
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("font-size: 14px;")
        layout.addWidget(subtitle)

        layout.addSpacing(24)

        # ── Status ─────────────────────────────────────────────────────
        if already_installed:
            ver = installed_version() or "unknown"
            status = QLabel(
                f"✔  TuxPanel <b>{ver}</b> is currently installed.\n\n"
                "You can update, add or remove components, or uninstall."
            )
        else:
            status = QLabel(
                "TuxPanel is <b>not installed</b> on this system.\n\n"
                "Click <b>Next</b> to choose which components to install."
            )
        status.setWordWrap(True)
        status.setTextFormat(Qt.TextFormat.RichText)
        status.setStyleSheet("font-size: 14px;")
        layout.addWidget(status)

        layout.addStretch()

        # ── Footer ─────────────────────────────────────────────────────
        footer = QLabel(f"Installer v{__version__}  •  GPL-3.0-or-later")
        footer.setStyleSheet("font-size: 11px;")
        footer.setAlignment(Qt.AlignmentFlag.AlignRight)
        layout.addWidget(footer)
