# SPDX-License-Identifier: GPL-3.0-or-later
"""A clickable card representing a single installable component."""

from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QHBoxLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)

from ..components import Component


class ComponentCard(QWidget):
    """
    ┌─────────────────────────────────────────────────┐
    │ ☑ TigerVNC Server                        14 MB  │
    │   Headless VNC session spawning per-user …      │
    └─────────────────────────────────────────────────┘
    """

    toggled = pyqtSignal()

    def __init__(self, component: Component, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._component = component

        self.setObjectName("component-card")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet("""
            QWidget#component-card {
                border: 1px solid rgba(128, 128, 128, 0.3);
                border-radius: 8px;
                padding: 12px 16px;
            }
            QWidget#component-card:hover {
                background: rgba(128, 128, 128, 0.1);
            }
        """)

        # ── Layout ─────────────────────────────────────────────────────
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(12)

        self._check = QCheckBox()
        self._check.setChecked(component.required)
        self._check.setEnabled(not component.required)
        self._check.stateChanged.connect(lambda _: self.toggled.emit())
        row.addWidget(self._check)

        info = QVBoxLayout()
        info.setSpacing(2)

        name = QLabel(f"<b>{component.name}</b>")
        name.setTextFormat(Qt.TextFormat.RichText)
        name.setStyleSheet("font-size: 14px;")
        info.addWidget(name)

        desc = QLabel(component.description)
        desc.setWordWrap(True)
        desc.setStyleSheet("font-size: 12px;")
        info.addWidget(desc)

        row.addLayout(info, 1)

        size = QLabel(f"{component.size_mb} MB")
        size.setStyleSheet("font-size: 12px; min-width: 50px;")
        size.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        row.addWidget(size)

    # ── Public API ─────────────────────────────────────────────────────

    @property
    def component(self) -> Component:
        return self._component

    def is_selected(self) -> bool:
        return self._check.isChecked()

    def set_selected(self, checked: bool) -> None:
        if not self._component.required:
            self._check.setChecked(checked)

    # ── Click anywhere on the card to toggle ───────────────────────────

    def mousePressEvent(self, event) -> None:  # type: ignore[override]
        if not self._component.required:
            self._check.setChecked(not self._check.isChecked())
        super().mousePressEvent(event)
