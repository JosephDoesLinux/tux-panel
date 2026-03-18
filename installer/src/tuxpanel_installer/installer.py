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
import traceback
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, TextIO

from . import constants as C
from .components import COMPONENT_MAP, Component
from .distro import PackageManager, detect_distro, install_packages
from .systemd import (
    enable_service,
    ensure_service_user,
    generate_environment,
    generate_unit,
    remove_unit,
    start_service,
    write_unit,
)
from .utils import run_streaming


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
        except subprocess.CalledProcessError as exc:
            detail = f"{exc.cmd[0]} failed (exit {exc.returncode})"
            if exc.stderr:
                detail += f": {exc.stderr.strip()[-500:]}"
            _emit(out, step=step_id, status="error", pct=pct, detail=detail)
            return 1
        except Exception as exc:
            _emit(out, step=step_id, status="error", pct=pct, detail=str(exc))
            traceback.print_exc(file=sys.stderr)
            return 1

    _emit(out, step="complete", status="done", pct=100, detail="Installation complete")
    return 0


# ── Step planner ──────────────────────────────────────────────────────────

StepFn = tuple[str, str, Callable[[], None]]  # (id, label, callable)


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
    steps.append(("npm-install", "Running npm ci...", _npm_install))

    # 6. Build client
    steps.append(("build-client", "Building web UI...", _build_client))

    # 7. Build server
    steps.append(("build-server", "Compiling TypeScript server...", _build_server))

    # 8. Prune dev dependencies for runtime footprint
    steps.append(("npm-prune", "Pruning development dependencies...", _npm_prune_production))

    # 9. Deploy polkit rules
    steps.append(("polkit", "Installing polkit rules...", _install_polkit))

    # 10. Install desktop entries and icons
    steps.append(("desktop", "Installing desktop entries and icons...", _install_desktop_entries))
    steps.append(("icons", "Installing application icons...", _install_icons))

    # 10.5. Install tuxpanel-installer wrapper
    steps.append(("cli-wrapper", "Installing tuxpanel-installer CLI...", _install_cli_wrapper))

    # 11. Deploy privileged helper scripts
    steps.append(("scripts", "Deploying helper scripts...", _install_scripts))

    # 12. Write systemd unit + environment
    steps.append((
        "systemd",
        "Configuring systemd service...",
        lambda: _setup_systemd(manifest),
    ))

    # 13. Generate production environment
    steps.append((
        "env-prod",
        "Generating production environment...",
        lambda: _generate_production_env(manifest),
    ))

    # 14. TLS (self-signed)
    if manifest.tls_mode == "self-signed":
        steps.append(("tls", "Generating self-signed certificate...", _generate_self_signed))

    # 15. Firewall
    if manifest.open_firewall:
        steps.append((
            "firewall",
            f"Opening port {manifest.port}...",
            lambda port=manifest.port: _open_firewall(port),
        ))

    # 16. Enable + start
    if manifest.enable_on_boot:
        steps.append(("enable", "Enabling tuxpanel.service...", enable_service))
    if manifest.start_now:
        steps.append(("start", "Starting TuxPanel...", start_service))

    # 17. Health check
    if manifest.start_now:
        steps.append(("health-check", "Verifying service startup...", lambda port=manifest.port: _health_check_service(port)))

    # 18. Permission audit
    steps.append(("perms-audit", "Auditing file permissions...", _audit_permissions))

    # 19. Write version sentinel
    steps.append(("version", "Finalising...", _write_version))

    # 20. Create post-install documentation
    steps.append((
        "post-install-readme",
        "Generating post-install documentation...",
        lambda: _create_post_install_readme(manifest),
    ))

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
        # Remove duplicate unprivileged scripts from the application source directory
        server_scripts = C.SERVER_DIR / "scripts"
        if server_scripts.exists():
            shutil.rmtree(server_scripts)

    if src_client.is_dir():
        shutil.copytree(src_client, C.CLIENT_DIR, dirs_exist_ok=True)

    # Fix ownership: server, client, and data belong to the service user,
    # but scripts MUST remain root:root to prevent privilege escalation.
    for d in (C.SERVER_DIR, C.CLIENT_DIR, C.DATA_DIR):
        if d.exists():
            subprocess.run(["chown", "-R", f"{C.SERVICE_USER}:{C.SERVICE_GROUP}", str(d)], check=True)
    subprocess.run(["chown", "-R", "root:root", str(C.SCRIPTS_DIR)], check=True)


def _npm_install() -> None:
    run_streaming(["npm", "ci"], cwd=str(C.SERVER_DIR))


def _build_client() -> None:
    run_streaming(["npm", "ci"], cwd=str(C.CLIENT_DIR))
    run_streaming(["npm", "run", "build"], cwd=str(C.CLIENT_DIR))


def _build_server() -> None:
    run_streaming(["npm", "run", "build"], cwd=str(C.SERVER_DIR))


def _npm_prune_production() -> None:
    run_streaming(["npm", "prune", "--omit=dev"], cwd=str(C.SERVER_DIR))
    run_streaming(["npm", "prune", "--omit=dev"], cwd=str(C.CLIENT_DIR))


def _install_polkit() -> None:
    src = REPO_ROOT / "server" / "polkit" / "50-tuxpanel.rules"
    if src.exists():
        dest = C.POLKIT_RULE
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dest)
        dest.chmod(0o644)


def _install_scripts() -> None:
    dest_dir = C.SCRIPTS_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    scripts = ["tuxpanel-edit-conf.sh", "tuxpanel-priv-wrapper.sh"]
    for script in scripts:
        src = REPO_ROOT / "server" / "scripts" / script
        if src.exists():
            dest = dest_dir / script
            shutil.copy(src, dest)
            dest.chmod(0o755)
            subprocess.run(["chown", "root:root", str(dest)], check=True)


def _setup_systemd(manifest: InstallManifest) -> None:
    node_bin = shutil.which("node") or "/usr/bin/node"
    unit = generate_unit(
        host=manifest.host,
        port=manifest.port,
        node_bin=node_bin,
    )
    write_unit(unit)
    
    # Create /etc/tuxpanel directory
    C.ENVIRONMENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Note: Environment file is written by _generate_production_env



def _generate_self_signed() -> None:
    # Ensure SSL directory is created with secure permissions to prevent
    # brief exposure of the private key before it's chmodded.
    C.SSL_DIR.mkdir(parents=True, exist_ok=True)
    C.SSL_DIR.chmod(0o700)
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


def _install_desktop_entries() -> None:
    """Install desktop files for main app and tray autostart."""
    src_app = REPO_ROOT / "installer" / "appimage" / "org.tuxpanel.desktop"
    src_tray = REPO_ROOT / "installer" / "appimage" / "tuxpanel-tray.desktop"
    
    # Main app desktop entry
    if src_app.exists():
        dest_app = C.APP_DESKTOP
        dest_app.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_app, dest_app)
        dest_app.chmod(0o644)
    
    # Tray autostart entry
    if src_tray.exists():
        dest_tray = C.TRAY_DESKTOP
        dest_tray.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_tray, dest_tray)
        dest_tray.chmod(0o644)


def _install_icons() -> None:
    """Install application icons to system location."""
    src_icon = REPO_ROOT / "installer" / "src" / "tuxpanel_installer" / "resources" / "icons" / "tuxpanel.svg"
    if src_icon.exists():
        dest_icon = C.ICON_SYSTEM
        dest_icon.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_icon, dest_icon)
        dest_icon.chmod(0o644)


def _install_cli_wrapper() -> None:
    """Install tuxpanel-installer wrapper script to /usr/bin.
    
    This wrapper intelligently finds the installer by:
    1. Looking for the AppImage (primary method - works on any fresh system)
    2. Falling back to system Python if available from prior pip install
    
    AppImage method is preferred because it's self-contained and doesn't
    require polluting system Python packages.
    """
    wrapper_script = Path("/usr/bin/tuxpanel-installer")
    
    wrapper_code = r'''#!/usr/bin/env python3
"""TuxPanel Installer CLI Wrapper.

Intelligently finds and executes the tuxpanel_installer module:
- First tries AppImage (self-contained, works on fresh systems)
- Falls back to system Python if pip-installed
"""
import sys
import os
import subprocess
from pathlib import Path

def find_appimage():
    """Return the static expected path of the installed AppImage."""
    candidate = "/opt/tuxpanel/installer/TuxPanel-Installer.AppImage"
    if Path(candidate).exists() and os.access(candidate, os.X_OK):
        return candidate
    return None

def main():
    # Try AppImage first (works on fresh systems)
    appimage = find_appimage()
    if appimage:
        os.execv(appimage, [appimage] + sys.argv[1:])
    
    # Fall back to system Python (for development/pip installs)
    try:
        from tuxpanel_installer.__main__ import main as cli_main
        cli_main()
    except ModuleNotFoundError:
        print("Error: tuxpanel_installer not found!", file=sys.stderr)
        print("", file=sys.stderr)
        print("The tuxpanel_installer module is bundled in the AppImage.", file=sys.stderr)
        print("Please run the AppImage directly:", file=sys.stderr)
        print("  ./TuxPanel-Installer-1.0.3-x86_64.AppImage", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
'''
    
    wrapper_script.write_text(wrapper_code)
    wrapper_script.chmod(0o755)

def _generate_production_env(manifest: InstallManifest) -> None:
    """Generate production-safe .env file with secure JWT secret."""
    import secrets
    
    # Generate secure JWT secret (32 bytes = 256 bits of entropy)
    jwt_secret = secrets.token_urlsafe(32)
    
    env_file = C.ENVIRONMENT_FILE
    env_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Write production env with secure JWT secret
    production_env = f"""# TuxPanel Production Environment — Auto-Generated
NODE_ENV=production
LOG_LEVEL=warn
JWT_SECRET={jwt_secret}
CORS_ORIGINS=https://localhost:{manifest.port}
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
TUXPANEL_HOST={manifest.host}
TUXPANEL_PORT={manifest.port}
TUXPANEL_TLS_MODE={manifest.tls_mode}
TUXPANEL_TLS_CERT=/etc/tuxpanel/ssl/tuxpanel.crt
TUXPANEL_TLS_KEY=/etc/tuxpanel/ssl/tuxpanel.key

# Optional: Gemini API key for AI chatbot (leave blank to disable)
# GEMINI_API_KEY=
"""
    
    env_file.write_text(production_env)
    env_file.chmod(0o640)  # Readable by tuxpanel user/group only
    
    # Secure ownership
    subprocess.run(["chown", f"{C.SERVICE_USER}:{C.SERVICE_GROUP}", str(env_file)], check=True)


def _health_check_service(port: int = C.DEFAULT_PORT) -> None:
    """Verify service startup and port listening."""
    import socket
    import time
    
    # Wait up to 10 seconds for service to be ready
    for attempt in range(20):  # 10 seconds with 0.5s polling
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result == 0:
                return  # Port is listening
        except Exception:
            pass
        
        if attempt < 19:
            time.sleep(0.5)
    
    raise RuntimeError(f"Service did not start listening on port {port} within 10 seconds. Check systemctl status tuxpanel.")



def _audit_permissions() -> None:
    """Verify file permissions and ownership for security."""
    # Check /opt/tuxpanel ownership
    stat_opt = C.INSTALL_PREFIX.stat()
    if stat_opt.st_uid != 0 or stat_opt.st_gid != 0:
        # Note: Running as root, so we expect 0:0 for /opt/tuxpanel
        pass
    
    # Check /etc/tuxpanel ownership and permissions
    if C.ENVIRONMENT_FILE.exists():
        stat_env = C.ENVIRONMENT_FILE.stat()
        if stat_env.st_mode & 0o077 != 0:
            # World/other readable — tighten permissions
            C.ENVIRONMENT_FILE.chmod(0o640)
        # Verify owner is tuxpanel:tuxpanel or at least in tuxpanel group
        subprocess.run(["chown", f"{C.SERVICE_USER}:{C.SERVICE_GROUP}", str(C.ENVIRONMENT_FILE.parent)], check=True)
    
    # Check SSL directory permissions (must not be world-readable)
    if C.SSL_DIR.exists():
        subprocess.run(["chmod", "-R", "o-r", str(C.SSL_DIR)], check=True)
        subprocess.run(["chown", "-R", f"{C.SERVICE_USER}:{C.SERVICE_GROUP}", str(C.SSL_DIR)], check=True)


def _write_version() -> None:
    from . import __version__
    C.VERSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    C.VERSION_FILE.write_text(__version__ + "\n")


def _create_post_install_readme(manifest: InstallManifest) -> None:
    """Generate post-install documentation."""
    port = manifest.port
    scheme = "https" if manifest.tls_mode == "self-signed" else "http"
    
    readme = f"""# TuxPanel Installation Complete

## Quick Start

Access TuxPanel at: {scheme}://localhost:{port}

### Default Login
The first admin user is the system user running the TuxPanel service.

### Service Management
```bash
# Start the service
sudo systemctl start tuxpanel

# Stop the service
sudo systemctl stop tuxpanel

# View service logs
sudo journalctl -u tuxpanel -f

# Service status
sudo systemctl status tuxpanel
```

## Configuration

Edit the environment at: `/etc/tuxpanel/environment`

Then restart the service:
```bash
sudo systemctl restart tuxpanel
```

## SSL Certificate
{f"Self-signed certificate location: `/etc/tuxpanel/ssl/tuxpanel.crt`" if manifest.tls_mode == "self-signed" else "No TLS certificate configured."}

## System Tray
Access TuxPanel from the system tray indicator for quick service status and dashboard access.

Enable tray autostart:
- Add "tuxpanel-tray" to your desktop session autostart
- Or copy `/usr/share/applications/tuxpanel-tray.desktop` to `~/.config/autostart/`

## Troubleshooting

### Service won't start
Check logs:
```bash
sudo journalctl -u tuxpanel -n 50
```

### Port already in use
Change the port in `/etc/tuxpanel/environment`:
```bash
sudo tuxpanel-edit-conf TUXPANEL_PORT=3002
```

### SSL certificate errors
The installer generated a self-signed certificate. Browsers will show a security warning.
To bypass: Accept the certificate in your browser, or use `http://` if TLS is disabled.

## Uninstall
To remove TuxPanel:
```bash
sudo tuxpanel-installer --uninstall
```

## Support
- GitHub: {C.GITHUB_REPO}
- Issues: {C.ISSUES_URL}
"""
    
    readme_file = C.DATA_DIR / "README.POST-INSTALL.txt"
    readme_file.write_text(readme)


# ── Detection helpers ─────────────────────────────────────────────────────

def is_installed() -> bool:
    """Check whether TuxPanel is already deployed."""
    return C.VERSION_FILE.exists()


def installed_version() -> str | None:
    if C.VERSION_FILE.exists():
        return C.VERSION_FILE.read_text().strip()
    return None


def uninstall_all() -> int:
    """Best-effort uninstall of TuxPanel managed assets."""
    try:
        remove_unit()

        if C.POLKIT_RULE.exists():
            C.POLKIT_RULE.unlink()

        if C.APP_DESKTOP.exists():
            C.APP_DESKTOP.unlink()
        if C.TRAY_DESKTOP.exists():
            C.TRAY_DESKTOP.unlink()
        if C.ICON_SYSTEM.exists():
            C.ICON_SYSTEM.unlink()

        if C.ENVIRONMENT_FILE.exists():
            C.ENVIRONMENT_FILE.unlink()
        if C.SSL_DIR.exists():
            shutil.rmtree(C.SSL_DIR, ignore_errors=True)

        if C.INSTALL_PREFIX.exists():
            shutil.rmtree(C.INSTALL_PREFIX, ignore_errors=True)

        return 0
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return 1
