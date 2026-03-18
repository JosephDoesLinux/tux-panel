# SPDX-License-Identifier: GPL-3.0-or-later
"""Main wizard window — drives the page stack."""

from __future__ import annotations

from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QIcon
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from . import __version__, constants as C
from .installer import InstallManifest, is_installed, installed_version
from .pages.welcome import WelcomePage
from .pages.components import ComponentsPage
from .pages.config import ConfigPage
from .pages.progress import ProgressPage
from .pages.finish import FinishPage


class InstallerWindow(QWidget):
    """Top-level wizard container."""

    def __init__(
        self,
        *,
        force_install: bool = False,
        force_manage: bool = False,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)

        self._manifest = InstallManifest()

        # ── Window chrome ──────────────────────────────────────────────
        self.setWindowTitle("TuxPanel Installer")
        self.setMinimumSize(QSize(720, 540))
        self.resize(QSize(780, 580))
        self.setWindowFlags(
            Qt.WindowType.Window
            | Qt.WindowType.WindowCloseButtonHint
            | Qt.WindowType.WindowMinimizeButtonHint
        )

        # ── Page stack ─────────────────────────────────────────────────
        self._stack = QStackedWidget()

        self._welcome = WelcomePage(already_installed=is_installed() and not force_install)
        self._components = ComponentsPage()
        self._config = ConfigPage()
        self._progress = ProgressPage()
        self._finish = FinishPage()

        for page in (self._welcome, self._components, self._config, self._progress, self._finish):
            self._stack.addWidget(page)

        # ── Navigation bar ─────────────────────────────────────────────
        self._btn_back = QPushButton("← Back")
        self._btn_next = QPushButton("Next →")
        self._btn_cancel = QPushButton("Cancel")

        self._btn_back.clicked.connect(self._go_back)
        self._btn_next.clicked.connect(self._go_next)
        self._btn_cancel.clicked.connect(self.close)

        nav = QHBoxLayout()
        nav.addWidget(self._btn_cancel)
        nav.addStretch()
        nav.addWidget(self._btn_back)
        nav.addWidget(self._btn_next)

        # ── Layout ─────────────────────────────────────────────────────
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.addWidget(self._stack, 1)
        root.addLayout(nav)
        root.setContentsMargins(16, 16, 16, 16)

        self._update_nav()

    # ── Properties ─────────────────────────────────────────────────────

    @property
    def manifest(self) -> InstallManifest:
        return self._manifest

    # ── Navigation ─────────────────────────────────────────────────────

    def _current_index(self) -> int:
        return self._stack.currentIndex()

    def _update_nav(self) -> None:
        idx = self._current_index()
        last = self._stack.count() - 1

        # Allow back button from progress (3) and finish (4) pages
        self._btn_back.setVisible(idx > 0 and (idx < 4 or idx == 4))
        self._btn_back.setEnabled(idx > 0)

        # Update back button label for clarity on error screen
        if idx == 4:  # Finish page
            self._btn_back.setText("← View Details")
        else:
            self._btn_back.setText("← Back")

        # On the config page the button says "Install"
        if idx == 2:  # ConfigPage
            self._btn_next.setText("Install")
        elif idx >= last:
            self._btn_next.setText("Close")
        else:
            self._btn_next.setText("Next →")

        self._btn_cancel.setVisible(idx < 3)  # hide during/after install
        self._btn_next.setVisible(True)
        self._btn_next.setEnabled(idx != 3)  # disable while installing

    def _go_back(self) -> None:
        idx = self._current_index()
        if idx > 0:
            self._stack.setCurrentIndex(idx - 1)
            self._update_nav()

    def show_logs(self) -> None:
        """Navigate back to progress page to view installation logs."""
        self._stack.setCurrentIndex(3)  # Progress page index
        self._update_nav()

    def _go_next(self) -> None:
        idx = self._current_index()
        last = self._stack.count() - 1

        if idx >= last:
            self.close()
            return

        # Collect state from current page before advancing
        if idx == 1:  # ComponentsPage → ConfigPage
            self._manifest.component_ids = self._components.selected_ids()

        if idx == 2:  # ConfigPage → ProgressPage  (start install)
            self._config.apply_to(self._manifest)
            self._stack.setCurrentIndex(3)
            self._update_nav()
            self._progress.run_install(self._manifest, on_done=self._on_install_done)
            return

        self._stack.setCurrentIndex(idx + 1)
        self._update_nav()

    def _on_install_done(self, success: bool) -> None:
        """Called by ProgressPage when the privileged process exits."""
        self._finish.set_result(success, self._manifest)
        self._stack.setCurrentIndex(self._stack.count() - 1)
        self._update_nav()
