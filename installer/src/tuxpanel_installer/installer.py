# SPDX-License-Identifier: GPL-3.0-or-later
"""
Install engine — the privileged backend that actually does the work.

Architecture:
  The GUI runs unprivileged.  When the user clicks "Install", the GUI
  serialises an InstallManifest to JSON, writes it to a temp file, and
  launches:

      pkexec tuxpanel-installer --execute /tmp/tuxpanel-XXXX.json

  This module's ``execute_manifest()`` reads that JSON, performs the
  installation, and writes JSON-Lines progress to stdout so the GUI can
  update its progress bar in real time.

  This separation means the Qt GUI *never* runs as root.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TextIO

from . import constants as C
from .components import COMPONENT_MAP, Component
from .distro import PackageManager, detect_distro, install_packages
from .systemd import (
    enable_service,
    ensure_service_user,
    generate_environment,
    generate_unit,
    start_service,
    write_unit,
)


# ── Manifest (serialisable plan) ──────────────────────────────────────────

@dataclass
class InstallManifest:
    """JSON-serialisable description of what to install."""

    component_ids: list[str] = field(default_factory=list)
    host: str = C.DEFAULT_HOST
    port: int = C.DEFAULT_PORT
    enable_on_boot: bool = True
    start_now: bool = True
    open_firewall: bool = True
    tls_mode: str = "self-signed"  # "self-signed" | "none"
    admin_user: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    @classmethod
    def from_json(cls, text: str) -> "InstallManifest":
        return cls(**json.loads(text))


# ── Progress protocol ─────────────────────────────────────────────────────

def _emit(stream: TextIO, *, step: str, status: str, pct: int, detail: str = "") -> None:
    """Write a JSON-Lines progress event to *stream*."""
    json.dump({"step": step, "status": status, "pct": pct, "detail": detail}, stream)
    stream.write("\n")
    stream.flush()


# ── Top-level executor ────────────────────────────────────────────────────

def execute_manifest(manifest: InstallManifest, out: TextIO = sys.stdout) -> int:
    """Run the full install sequence.  Returns 0 on success."""
    distro = detect_distro()
    pm = distro.pm
    components = [COMPONENT_MAP[cid] for cid in manifest.component_ids if cid in COMPONENT_MAP]

    steps = _plan_steps(manifest, components, pm)
    total = len(steps)

    for i, (step_id, label, fn) in enumerate(steps):
        pct = int((i / total) * 100)
        _emit(out, step=step_id, status="running", pct=pct, detail=label)
        try:
            fn()
            _emit(out, step=step_id, status="done", pct=pct + int(100 / total))
        except Exception as exc:
            _emit(out, step=step_id, status="error", pct=pct, detail=str(exc))
            return 1

    _emit(out, step="complete", status="done", pct=100, detail="Installation complete")
    return 0


# ── Step planner ──────────────────────────────────────────────────────────

StepFn = tuple[str, str, "() -> None"]  # (id, label, callable)


def _plan_steps(
    manifest: InstallManifest,
    components: list[Component],
    pm: PackageManager,
) -> list[StepFn]:
    """Build an ordered list of install steps from the manifest."""
    steps: list[StepFn] = []

    # 1. Verify Node.js
    steps.append(("node-check", "Checking Node.js version...", _check_nodejs))

    # 2. Install system packages for selected components
    all_pkgs: list[str] = []
    for comp in components:
        all_pkgs.extend(comp.packages_for(pm.value))
    if all_pkgs:
        steps.append((
            "sys-packages",
            f"Installing system packages ({len(all_pkgs)})...",
            lambda pkgs=all_pkgs, _pm=pm: install_packages(_pm, pkgs),
        ))

    # 3. Create service user
    steps.append(("service-user", "Creating tuxpanel system user...", ensure_service_user))

    # 4. Deploy application files
    steps.append(("deploy", "Deploying TuxPanel to /opt/tuxpanel...", _deploy_app))

    # 5. Install npm dependencies
    steps.append(("npm-install", "Running npm ci --production...", _npm_install))

    # 6. Build client
    steps.append(("build-client", "Building web UI...", _build_client))

    # 7. Build server
    steps.append(("build-server", "Compiling TypeScript server...", _build_server))

    # 8. Deploy polkit rules
    steps.append(("polkit", "Installing polkit rules...", _install_polkit))

    # 9. Deploy editConf helper
    steps.append(("editconf", "Deploying editConf helper...", _install_editconf))

    # 10. Write systemd unit + environment
    steps.append((
        "systemd",
        "Configuring systemd service...",
        lambda: _setup_systemd(manifest),
    ))

    # 11. TLS (self-signed)
    if manifest.tls_mode == "self-signed":
        steps.append(("tls", "Generating self-signed certificate...", _generate_self_signed))

    # 12. Firewall
    if manifest.open_firewall:
        steps.append((
            "firewall",
            f"Opening port {manifest.port}...",
            lambda port=manifest.port: _open_firewall(port),
        ))

    # 13. Enable + start
    if manifest.enable_on_boot:
        steps.append(("enable", "Enabling tuxpanel.service...", enable_service))
    if manifest.start_now:
        steps.append(("start", "Starting TuxPanel...", start_service))

    # 14. Write version sentinel
    steps.append(("version", "Finalising...", _write_version))

    return steps


# ── Individual step implementations ───────────────────────────────────────

def _check_nodejs() -> None:
    r = subprocess.run(["node", "--version"], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("Node.js is not installed.  Select the Node.js component or install it manually.")
    version = r.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < C.NODE_MIN_MAJOR:
        raise RuntimeError(f"Node.js {major}.x found — TuxPanel requires {C.NODE_MIN_MAJOR}+.")


REPO_ROOT = Path(__file__).resolve().parents[3]  # installer/src/tuxpanel_installer → project root


def _deploy_app() -> None:
    """Copy server/ and client/ source into /opt/tuxpanel."""
    for d in (C.SERVER_DIR, C.CLIENT_DIR, C.SCRIPTS_DIR, C.DATA_DIR):
        d.mkdir(parents=True, exist_ok=True)

    # Copy source trees (in an AppImage these would be bundled assets;
    # for a source install we copy from the repo)
    src_server = REPO_ROOT / "server"
    src_client = REPO_ROOT / "client"

    if src_server.is_dir():
        shutil.copytree(src_server, C.SERVER_DIR, dirs_exist_ok=True)
    if src_client.is_dir():
        shutil.copytree(src_client, C.CLIENT_DIR, dirs_exist_ok=True)

    # Fix ownership
    subprocess.run(["chown", "-R", f"{C.SERVICE_USER}:{C.SERVICE_GROUP}", str(C.INSTALL_PREFIX)],
                   check=True)


def _npm_install() -> None:
    subprocess.run(
        ["npm", "ci", "--production"],
        cwd=str(C.SERVER_DIR), check=True,
    )


def _build_client() -> None:
    subprocess.run(["npm", "ci"], cwd=str(C.CLIENT_DIR), check=True)
    subprocess.run(["npm", "run", "build"], cwd=str(C.CLIENT_DIR), check=True)


def _build_server() -> None:
    subprocess.run(["npm", "run", "build"], cwd=str(C.SERVER_DIR), check=True)


def _install_polkit() -> None:
    src = REPO_ROOT / "server" / "polkit" / "50-tuxpanel.rules"
    if src.exists():
        dest = C.POLKIT_RULE
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        dest.chmod(0o644)


def _install_editconf() -> None:
    src = REPO_ROOT / "server" / "scripts" / "tuxpanel-edit-conf.sh"
    if src.exists():
        dest = C.SCRIPTS_DIR / "tuxpanel-edit-conf.sh"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        dest.chmod(0o755)


def _setup_systemd(manifest: InstallManifest) -> None:
    node_bin = shutil.which("node") or "/usr/bin/node"
    unit = generate_unit(
        host=manifest.host,
        port=manifest.port,
        node_bin=node_bin,
    )
    write_unit(unit)

    C.ENVIRONMENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    C.ENVIRONMENT_FILE.write_text(
        generate_environment(host=manifest.host, port=manifest.port)
    )


def _generate_self_signed() -> None:
    C.SSL_DIR.mkdir(parents=True, exist_ok=True)
    cert = C.SSL_DIR / "tuxpanel.crt"
    key = C.SSL_DIR / "tuxpanel.key"
    if cert.exists() and key.exists():
        return  # Don't overwrite existing certs
    subprocess.run([
        "openssl", "req", "-x509", "-nodes",
        "-days", "3650",
        "-newkey", "rsa:2048",
        "-keyout", str(key),
        "-out", str(cert),
        "-subj", "/CN=tuxpanel/O=TuxPanel/C=US",
    ], check=True)
    key.chmod(0o600)
    cert.chmod(0o644)


def _open_firewall(port: int) -> None:
    if shutil.which("firewall-cmd"):
        subprocess.run([
            "firewall-cmd", "--permanent", f"--add-port={port}/tcp",
        ], check=True)
        subprocess.run(["firewall-cmd", "--reload"], check=True)
    elif shutil.which("ufw"):
        subprocess.run(["ufw", "allow", str(port)], check=True)
    # Silently skip if neither firewall tool is present


def _write_version() -> None:
    from . import __version__
    C.VERSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    C.VERSION_FILE.write_text(__version__ + "\n")


# ── Detection helpers ─────────────────────────────────────────────────────

def is_installed() -> bool:
    """Check whether TuxPanel is already deployed."""
    return C.VERSION_FILE.exists()


def installed_version() -> str | None:
    if C.VERSION_FILE.exists():
        return C.VERSION_FILE.read_text().strip()
    return None
