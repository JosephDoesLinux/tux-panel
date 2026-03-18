# TuxPanel Production Deployment Guide

This guide covers deploying TuxPanel to production on Fedora, Debian/Ubuntu, Arch, and openSUSE systems.

## System Requirements

### Minimum
- **CPU:** 2 cores recommended
- **RAM:** 2GB minimum (4GB recommended)
- **Disk:** 500MB for application + dependencies
- **OS:** Fedora 43+, Debian 12+, Ubuntu 22.04+, Arch, or openSUSE Leap 15.5+

### Supported Components
- **Virtualization:** libvirt/KVM, QEMU (optional)
- **Containers:** Docker/Podman (optional)
- **Remote Desktop:** TigerVNC, xfreerdp, XRDP (optional)
- **Storage:** Samba, NFS (optional)

### Required Base Packages
- Node.js 22.x LTS
- Python 3.10+
- OpenSSL
- systemd
- dbus (for system integration)
- SELinux/AppArmor (security context)

## Installation Methods

### Method 1: AppImage (Recommended for End Users)

The AppImage is a self-contained, single-file installer. No system dependencies required beyond Python 3.10.

```bash
# Download the latest AppImage
wget https://github.com/JosephDoesLinux/tux-panel/releases/download/v0.1.0/TuxPanel-Installer-0.1.0-x86_64.AppImage

# Make it executable
chmod +x TuxPanel-Installer-0.1.0-x86_64.AppImage

# Run the installer GUI
./TuxPanel-Installer-0.1.0-x86_64.AppImage
```

The GUI will:
1. Detect your Linux distribution
2. Prompt for component selection (VNC, Docker, Samba, etc.)
3. Show advanced options (port, TLS mode, host binding)
4. Request polkit authentication for privileged operations
5. Display real-time installation progress
6. Generate a post-install report with login credentials

#### AppImage System Requirements
- x86_64 Linux with glibc 2.29+
- FUSE 2 or FUSE 3 (for AppImage mounting; most distros include this)
- Python 3.10+ for the installer backend
- dbus-bin package (for system integration)

### Method 2: Repository Installation (For System Administrators)

Clone the repository and run the installer:

```bash
git clone https://github.com/JosephDoesLinux/tux-panel.git
cd tux-panel/installer

# Install and build
pip install -e .

# Run installer (GUI)
tuxpanel-installer

# Or run directly via Python
python -m tuxpanel_installer
```

### Method 3: Automated Deployment (For Infrastructure Automation)

Use the JSON manifest API for CI/CD pipelines:

```bash
# Generate installation manifest
cat > /tmp/tuxpanel-manifest.json << 'EOF'
{
  "component_ids": ["vnc", "docker", "samba"],
  "host": "0.0.0.0",
  "port": 3001,
  "enable_on_boot": true,
  "start_now": true,
  "open_firewall": true,
  "tls_mode": "self-signed",
  "admin_user": "root"
}
EOF

# Execute the manifest (requires root)
sudo python -m tuxpanel_installer --execute /tmp/tuxpanel-manifest.json
```

## Installation Details

### What Gets Installed

| Component            | Location                           | Owner         | Purpose                  |
| -------------------- | ---------------------------------- | ------------- | ------------------------ |
| Application files    | `/opt/tuxpanel/`                   | tuxpanel:root | Core application         |
| Configuration        | `/etc/tuxpanel/`                   | tuxpanel      | Runtime configuration    |
| Systemd service unit | `/etc/systemd/system/tuxpanel.service` | root    | Service management       |
| Polkit rules         | `/etc/polkit-1/rules.d/50-tuxpanel.rules` | root | Privilege delegation     |
| PAM service config   | `/etc/pam.d/tuxpanel`              | root          | Authentication           |
| Desktop entries      | `/usr/share/applications/org.tuxpanel.desktop` | root | Application launcher   |
| Tray autostart       | `/etc/xdg/autostart/tuxpanel-tray.desktop` | root | System tray integration  |
| Application icon     | `/usr/share/icons/hicolor/scalable/apps/tuxpanel.svg` | root | Icon assets |

### Service User

The installer creates a system service user:
- **Username:** `tuxpanel`
- **Group:** `tuxpanel`
- **Shell:** `/usr/sbin/nologin`
- **Home:** `/var/lib/tuxpanel` (for session data)
- **Privileges:** Via polkit rules (no SUDO required for allowed operations)

### Directory Structure

```
/opt/tuxpanel/
├── server/              # Node.js backend (compiled)
│   ├── dist/           # TypeScript → JavaScript
│   ├── node_modules/   # Production dependencies only
│   └── package.json
├── client/             # React frontend (bundled)
│   ├── dist/           # Vite build output (~1.5MB)
│   ├── index.html
│   └── assets/
├── scripts/            # System integration scripts
├── data/               # Application data
│   └── README.POST-INSTALL.txt
└── VERSION             # Installed version marker
```

### Configuration Files

`/etc/tuxpanel/environment` — Runtime variables:
```bash
# Server binding
TUXPANEL_HOST=0.0.0.0
TUXPANEL_PORT=3001

# Environment
NODE_ENV=production
LOG_LEVEL=warn

# Security (auto-generated at install)
JWT_SECRET=<32-byte-urlsafe-base64>
CORS_ORIGINS=https://localhost:3001

# TLS/SSL
TUXPANEL_TLS_MODE=self-signed|none
TUXPANEL_TLS_CERT=/etc/tuxpanel/ssl/tuxpanel.crt
TUXPANEL_TLS_KEY=/etc/tuxpanel/ssl/tuxpanel.key

# Optional: AI chatbot support
# GEMINI_API_KEY=
```

Edit with:
```bash
sudo tuxpanel-edit-conf TUXPANEL_PORT=3002
```

## First Login

1. **Access the dashboard:**
   - HTTPS: `https://localhost:3001` (self-signed certificate)
   - HTTP: `http://localhost:3001` (if TLS disabled)

2. **Browser certificate warning (self-signed TLS):**
   - Click "Advanced"
   - Click "Proceed to localhost:3001 (unsafe)"
   - Or install the certificate in your browser's CA store

3. **Authentication:**
   - First login uses system PAM authentication
   - Username: Your Linux username
   - Password: Your Linux password
   - After first login, users are granted `tuxpanel` group membership automatically

4. **Verify service is running:**
   ```bash
   sudo systemctl status tuxpanel
   sudo journalctl -u tuxpanel -f  # Follow logs
   ```

## Post-Installation

### Enable System Tray Integration

Make the tray indicator autostart:

```bash
# For GNOME/KDE/Cinnamon:
cp /usr/share/applications/tuxpanel-tray.desktop ~/.config/autostart/

# Or enable in your desktop session autostart settings
```

The tray provides:
- Quick access to the dashboard (right-click → "Open Dashboard")
- Service status indicator
- Systemd logs viewer
- Restart/stop controls

### Configure Firewall

If the installer didn't auto-configure:

**Fedora/RHEL (firewalld):**
```bash
sudo firewall-cmd --permanent --add-service=tuxpanel
sudo firewall-cmd --reload
```

**Debian/Ubuntu (ufw):**
```bash
sudo ufw allow 3001/tcp
```

### Verify SSL Certificate

For self-signed certificates:

```bash
# View certificate details
sudo openssl x509 -in /etc/tuxpanel/ssl/tuxpanel.crt -noout -text

# Certificate validity
sudo openssl x509 -in /etc/tuxpanel/ssl/tuxpanel.crt -noout -dates

# Fingerprint (for pinning)
sudo openssl x509 -in /etc/tuxpanel/ssl/tuxpanel.crt -noout -fingerprint -sha256
```

### Enable Secure Remote Access

To access TuxPanel from other machines:

1. **Get the host IP:**
   ```bash
   hostname -I
   ```

2. **Update CORS in environment:**
   ```bash
   echo "CORS_ORIGINS=https://192.168.1.100:3001" | sudo tee -a /etc/tuxpanel/environment
   sudo systemctl restart tuxpanel
   ```

3. **Forward firewall & port:**
   - Open port 3001 on your router/firewall (choose reverse proxy over direct exposure)
   - OR use a reverse proxy (Nginx, HAProxy) with proper SSL termination

4. **Best practice: Use a reverse proxy**
   ```nginx
   # Nginx example
   upstream tuxpanel {
       server 127.0.0.1:3001;
   }
   
   server {
       listen 443 ssl http2;
       server_name dashboard.example.com;
       
       ssl_certificate /etc/ssl/certs/dashboard.crt;
       ssl_certificate_key /etc/ssl/private/dashboard.key;
       
       location / {
           proxy_pass http://tuxpanel;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

## Troubleshooting

### Service won't start

```bash
# Check status
sudo systemctl status tuxpanel

# View detailed logs
sudo journalctl -u tuxpanel -n 100

# Verify configuration
cat /etc/tuxpanel/environment

# Check if port is already in use
sudo ss -tlnp | grep :3001
```

### Port 3001 already in use

Change the port:
```bash
sudo tuxpanel-edit-conf TUXPANEL_PORT=3002
sudo systemctl restart tuxpanel
```

### SSL certificate errors

- If self-signed: Accept the certificate in your browser
- To use a valid certificate: Copy your cert/key to `/etc/tuxpanel/ssl/` and update config:
  ```bash
  echo "TUXPANEL_TLS_MODE=external" | sudo tee -a /etc/tuxpanel/environment
  sudo systemctl restart tuxpanel
  ```

### High CPU/Memory usage

1. Check running processes:
   ```bash
   sudo systemctl status tuxpanel
   ps aux | grep -i tuxpanel
   ```

2. Review logs for errors:
   ```bash
   sudo journalctl -u tuxpanel --priority=err
   ```

3. Restart the service:
   ```bash
   sudo systemctl restart tuxpanel
   ```

### Remote desktop not working

Verify dependencies are installed:
```bash
# For VNC
sudo dnf install tigervnc-server  # Fedora
sudo apt install tigervnc-server  # Debian

# For RDP
sudo dnf install xfreerdp  # Fedora
sudo apt install freerdp2-x11  # Debian
```

## Uninstallation

Remove TuxPanel completely:

```bash
sudo tuxpanel-installer --uninstall
```

This removes:
- `/opt/tuxpanel/` (application files)
- `/etc/tuxpanel/` (configuration)
- `/etc/systemd/system/tuxpanel.service` (systemd unit)
- `/etc/polkit-1/rules.d/50-tuxpanel.rules` (polkit rules)
- `/usr/share/applications/org.tuxpanel.desktop` (launcher)
- `/etc/xdg/autostart/tuxpanel-tray.desktop` (tray autostart)
- `/usr/share/icons/hicolor/scalable/apps/tuxpanel.svg` (icon)

Keeps:
- Service user `tuxpanel` (manually remove with `sudo userdel tuxpanel` if needed)

## Multiple Machine Deployment

### Automated with Ansible

```yaml
---
- hosts: linux_servers
  become: yes
  
  tasks:
    - name: Download TuxPanel AppImage
      get_url:
        url: "https://github.com/JosephDoesLinux/tux-panel/releases/download/v0.1.0/TuxPanel-Installer-0.1.0-x86_64.AppImage"
        dest: /tmp/
        mode: '0755'
    
    - name: Run installer (non-interactive mode)
      shell: |
        python3 - /tmp/TuxPanel-Installer-0.1.0-x86_64.AppImage << 'EOF'
        import json, subprocess
        manifest = {
            "component_ids": ["vnc", "docker"],
            "host": "0.0.0.0",
            "port": 3001,
            "tls_mode": "self-signed"
        }
        with open("/tmp/manifest.json", "w") as f:
            json.dump(manifest, f)
        
        result = subprocess.run(["python", "-m", "tuxpanel_installer", "--execute", "/tmp/manifest.json"], capture_output=True)
        print(result.stdout.decode())
        EOF
```

## Support & Issues

- **GitHub Issues:** https://github.com/JosephDoesLinux/tux-panel/issues
- **Documentation:** https://github.com/JosephDoesLinux/tux-panel/tree/main/docs

## Version Information

- **TuxPanel:** 0.1.0 (check with `cat /opt/tuxpanel/VERSION`)
- **Node.js:** 22.x
- **React:** 19.x
- **Python Installer:** 3.10+

---

**Last Updated:** 2026-03-18
**License:** MIT © JosephDoesLinux
