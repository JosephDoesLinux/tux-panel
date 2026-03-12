# SPDX-License-Identifier: GPL-3.0-or-later
"""Page 2 — Component selection with categorised cards."""

from __future__ import annotations

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from ..components import Category, Component, components_by_category
from ..widgets.component_card import ComponentCard


_CATEGORY_LABELS: dict[Category, tuple[str, str]] = {
    Category.CORE: ("Core", "Required components — cannot be deselected."),
    Category.REMOTE_DESKTOP: ("Remote Desktop", "Access machines through the browser."),
    Category.DESKTOP_ENV: ("Desktop Environments", "Headless desktops for spawned VNC sessions."),
    Category.EXTRAS: ("Extras", "Additional runtimes and monitoring tools."),
}


class ComponentsPage(QWidget):
    """Grid of component cards grouped by category."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._cards: list[ComponentCard] = []

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        # ── Header ─────────────────────────────────────────────────────
        header = QLabel("Select Components")
        header.setObjectName("page-title")
        header.setStyleSheet("font-size: 22px; font-weight: 700; padding: 24px 32px 8px 32px;")
        outer.addWidget(header)

        # ── Scrollable body ────────────────────────────────────────────
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        outer.addWidget(scroll, 1)

        body = QWidget()
        scroll.setWidget(body)
        layout = QVBoxLayout(body)
        layout.setContentsMargins(32, 8, 32, 32)
        layout.setSpacing(12)

        by_cat = components_by_category()
        for cat in Category:
            comps = by_cat.get(cat, [])
            if not comps:
                continue
            label_text, hint = _CATEGORY_LABELS.get(cat, (cat.name, ""))
            cat_label = QLabel(f"<b>{label_text}</b>  —  <i>{hint}</i>")
            cat_label.setTextFormat(Qt.TextFormat.RichText)
            cat_label.setStyleSheet("font-size: 13px; color: #aaa; padding-top: 8px;")
            layout.addWidget(cat_label)

            for comp in comps:
                card = ComponentCard(comp)
                self._cards.append(card)
                layout.addWidget(card)

        layout.addStretch()

        # ── Total size label ───────────────────────────────────────────
        self._total_label = QLabel()
        self._total_label.setAlignment(Qt.AlignmentFlag.AlignRight)
        self._total_label.setStyleSheet("font-size: 12px; color: #888; padding: 4px 32px;")
        outer.addWidget(self._total_label)
        self._update_total()

        # Connect size updates
        for card in self._cards:
            card.toggled.connect(self._update_total)

    # ── Public API ─────────────────────────────────────────────────────

    def selected_ids(self) -> list[str]:
        return [card.component.id for card in self._cards if card.is_selected()]

    # ── Internal ───────────────────────────────────────────────────────

    def _update_total(self) -> None:
        total = sum(c.component.size_mb for c in self._cards if c.is_selected())
        self._total_label.setText(f"≈ {total} MB selected")
