# SPDX-License-Identifier: GPL-3.0-or-later
"""Page 4 — Real-time install progress fed by the privileged child process."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Callable

from PyQt6.QtCore import QProcess, Qt
from PyQt6.QtWidgets import (
    QLabel,
    QProgressBar,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..installer import InstallManifest


class ProgressPage(QWidget):
    """Shows a progress bar and a scrolling log while pkexec runs the manifest."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._proc: QProcess | None = None
        self._on_done: Callable[[bool], None] | None = None
        self._success = False

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 32, 32, 32)
        root.setSpacing(12)

        title = QLabel("Installing…")
        title.setObjectName("page-title")
        title.setStyleSheet("font-size: 22px; font-weight: 700;")
        root.addWidget(title)
        self._title = title

        self._bar = QProgressBar()
        self._bar.setRange(0, 100)
        self._bar.setValue(0)
        self._bar.setTextVisible(True)
        root.addWidget(self._bar)

        self._step_label = QLabel("")
        self._step_label.setStyleSheet("font-size: 13px; color: #aaa;")
        root.addWidget(self._step_label)

        self._log = QTextEdit()
        self._log.setReadOnly(True)
        self._log.setStyleSheet(
            "QTextEdit { font-family: 'JetBrains Mono', 'Fira Code', monospace; "
            "font-size: 12px; background: #1a1a2e; color: #ccc; border-radius: 8px; "
            "padding: 8px; }"
        )
        root.addWidget(self._log, 1)

    # ── Public API ─────────────────────────────────────────────────────

    def run_install(self, manifest: InstallManifest, *, on_done: Callable[[bool], None]) -> None:
        """Serialise manifest to a temp file and launch ``pkexec tuxpanel-installer --execute``."""
        self._on_done = on_done
        self._success = False
        self._log.clear()
        self._bar.setValue(0)
        self._title.setText("Installing…")

        # Write manifest to temp file (world-readable so pkexec child can read it)
        tmp = tempfile.NamedTemporaryFile(
            prefix="tuxpanel-", suffix=".json", mode="w", delete=False,
        )
        tmp.write(manifest.to_json())
        tmp.flush()
        tmp.close()
        self._manifest_path = Path(tmp.name)

        # Resolve our own entry point.  We must forward PYTHONPATH through
        # pkexec so the child process can find the tuxpanel_installer package
        # (pkexec strips the caller's environment for security).
        import sys
        src_root = str(Path(__file__).resolve().parents[2])  # installer/src
        python = sys.executable
        entry = [
            "env",
            f"PYTHONPATH={src_root}",
            python, "-m", "tuxpanel_installer",
            "--execute", str(self._manifest_path),
        ]

        self._proc = QProcess(self)
        self._proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self._proc.readyReadStandardOutput.connect(self._on_stdout)
        self._proc.finished.connect(self._on_finished)

        # Launch via pkexec for privilege escalation
        self._proc.start("pkexec", entry)

        self._append_log("$ pkexec tuxpanel-installer --execute manifest.json\n")

    # ── Slots ──────────────────────────────────────────────────────────

    def _on_stdout(self) -> None:
        assert self._proc is not None
        data = self._proc.readAllStandardOutput().data().decode(errors="replace")
        for line in data.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
                self._handle_event(evt)
            except json.JSONDecodeError:
                self._append_log(line)

    def _handle_event(self, evt: dict) -> None:
        step = evt.get("step", "")
        status = evt.get("status", "")
        pct = evt.get("pct", 0)
        detail = evt.get("detail", "")

        self._bar.setValue(min(pct, 100))

        icon = {"running": "▶", "done": "✔", "error": "✘"}.get(status, "·")
        self._step_label.setText(f"{icon}  {detail or step}")
        self._append_log(f"[{status.upper():>7}] {step}: {detail}")

        if status == "error":
            self._success = False
        elif step == "complete":
            self._success = True

    def _on_finished(self, exit_code: int, _status: QProcess.ExitStatus) -> None:
        # Clean up temp file
        if hasattr(self, "_manifest_path") and self._manifest_path.exists():
            self._manifest_path.unlink(missing_ok=True)

        if exit_code != 0 and not self._success:
            self._title.setText("Installation failed")
            self._append_log(f"\nProcess exited with code {exit_code}")
            self._success = False
        else:
            self._title.setText("Installation complete")
            self._bar.setValue(100)

        if self._on_done:
            self._on_done(self._success)

    def _append_log(self, text: str) -> None:
        self._log.append(text)
        sb = self._log.verticalScrollBar()
        if sb:
            sb.setValue(sb.maximum())
