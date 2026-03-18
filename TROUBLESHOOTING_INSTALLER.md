# TuxPanel Installer Troubleshooting Guide

Your installer now has **"View Installation Logs"** button on failure pages, making it easy to see what went wrong. Here's a complete guide to troubleshooting installer failures.

---

## Quick Fix: Installation Failed Screen

When you see "Installation Failed":

1. **Click "View Installation Logs"** (new button added)
2. You'll see the detailed error messages from each installation step
3. Look for lines marked `[ERROR]` or `[RUNNING]` that failed

---

## Manual Troubleshooting Commands

If you're stuck or want to debug before attempting install again:

### Check Polkit (Required for Privilege Escalation)
```bash
# Verify polkit is installed and running
which pkexec
sudo systemctl status polkit

# If polkit not installed:
# Fedora:
sudo dnf install polkit

# Debian/Ubuntu:
sudo apt install policykit-1
```

### Check Node.js Version
```bash
# TuxPanel requires Node.js 22+
node --version

# If not installed or too old:
# Fedora:
sudo dnf install nodejs

# Debian/Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs
```

### Check Python Version
```bash
# Must be Python 3.10+
python3 --version

# Install PyQt6 which is required
python3 -m pip install --upgrade PyQt6 dbus-python

# Or system package:
# Fedora:
sudo dnf install python3-pyqt6 python3-dbus

# Debian/Ubuntu:
sudo apt install python3-pyqt6 python3-dbus
```

### Check Service User Creation
```bash
# Verify tuxpanel user can be created
id tuxpanel  # If it exists, you're good

# Check if groupadd will work
sudo groupadd -f tuxpanel
sudo useradd -r -s /usr/sbin/nologin tuxpanel 2>/dev/null || echo "User exists"
```

### Check npm Installation
```bash
# Verify npm is available and working
npm --version
npm list -g | head -5

# If npm not found:
# Should be installed with Node.js, but can reinstall:
# Fedora:
sudo dnf install npm

# Debian/Ubuntu:
sudo apt install npm
```

### View System Journal for Install Errors
```bash
# Check for pkexec errors (privilege escalation failures)
sudo journalctl /usr/bin/pkexec -n 20

# Check Node build errors
journalctl -e --no-pager | grep -i "node\|npm\|typescript"

# Check for polkit permission denials
sudo journalctl SYSLOG_IDENTIFIER=polkitd -n 20

# Real-time monitoring (run BEFORE clicking Install):
journalctl -f -p warning

# Check permissions on /etc/tuxpanel (after failed install)
ls -la /etc/tuxpanel/ 2>/dev/null || echo "Directory not created yet"
```

### View Temporary Manifest Files
```bash
# These are created during install and contain the configuration
ls -lh /tmp/tuxpanel-*.json

# View the manifest (to confirm your settings were passed correctly)
cat /tmp/tuxpanel-*.json | python3 -m json.tool

# Save the manifest for debugging
cp /tmp/tuxpanel-*.json /tmp/tuxpanel-backup.json
```

### Test npm Build Manually
```bash
# If npm build step is failing, test it manually:
cd /opt/tuxpanel/server 2>/dev/null || echo "Directory not created"
npm run build

# Check for TypeScript errors
npm run build 2>&1 | grep -i "error"
```

### Check Permissions After Failed Install
```bash
# Verify ownership and permissions
ls -l /opt/tuxpanel/ 2>/dev/null || echo "Not installed"
ls -l /etc/tuxpanel/ 2>/dev/null || echo "Config not created"
ls -l /etc/systemd/system/tuxpanel.service 2>/dev/null || echo "Unit not created"

# Fix permissions if stuck:
sudo chown -R tuxpanel:tuxpanel /opt/tuxpanel/
sudo chown -R tuxpanel:tuxpanel /etc/tuxpanel/
```

---

## Common Failure Modes & Solutions

### ❌ "Failed to acquire polkit authorization"
**Problem:** User lacks permissions to run privileged install

**Solution:**
```bash
# Confirm you have sudo access:
sudo whoami

# Or request IT to allow your user account polkit access
sudo usermod -aG wheel $USER  # Fedora
sudo usermod -aG sudo $USER   # Debian/Ubuntu
# Log out and back in for group to take effect
```

### ❌ "Node.js version check failed"
**Problem:** Node.js is too old or not installed

**Solution:**
```bash
# Check version
node --version  # Must be 22.x or higher

# Update Node.js
# Fedora:
sudo dnf update nodejs

# Debian/Ubuntu:
sudo apt update && sudo apt upgrade nodejs
```

### ❌ "npm ci failed" or "npm not found"
**Problem:** npm installation or configuration issue

**Solution:**
```bash
# Clean npm cache and retry
npm cache clean --force

# Reinstall npm
sudo npm install -g npm@latest

# Check npm registry is accessible
npm ping
```

### ❌ "TypeScript build failed" or "npm run build: not found"
**Problem:** Dependencies not installed or TypeScript compiler missing

**Solution:**
```bash
# Clean and reinstall
cd /opt/tuxpanel/server  # Or server/ in source
rm -rf node_modules package-lock.json
npm ci
npm run build
```

### ❌ "Permission denied" on /opt/tuxpanel or /etc/tuxpanel
**Problem:** Service user creation failed

**Solution:**
```bash
# Check if tuxpanel user/group exist
id tuxpanel
getent group tuxpanel

# Create if missing:
sudo groupadd -f tuxpanel
sudo useradd -r -m -s /usr/sbin/nologin -g tuxpanel tuxpanel

# Fix ownership
sudo chown -R tuxpanel:tuxpanel /opt/tuxpanel/ /etc/tuxpanel/
sudo chmod 750 /etc/tuxpanel/
```

### ❌ "pkexec: execve: Permission denied"
**Problem:** The tuxpanel-installer binary lacks execute permissions

**Solution:**
```bash
# Reinstall the installer
pip install --upgrade --force-reinstall tuxpanel-installer

# Or manually fix permissions:
which tuxpanel-installer
sudo chmod 755 $(which tuxpanel-installer)
```

### ❌ "Health check failed: port not listening"
**Problem:** Service started but didn't bind to port 3001

**Solution:**
```bash
# Check if port is already in use
sudo lsof -i :3001 || sudo ss -tlnp | grep :3001

# If port is blocked, change it:
# Edit /etc/tuxpanel/environment and set TUXPANEL_PORT=3002

# Manually test service startup:
sudo systemctl start tuxpanel
sleep 2
sudo systemctl status tuxpanel
sudo journalctl -u tuxpanel -n 50

# Check if service process is running:
ps aux | grep tuxpanel
```

### ❌ Firewall blocking
**Problem:** Firewall won't open port

**Solution:**
```bash
# Fedora/RHEL:
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# Debian/Ubuntu:
sudo ufw status
sudo ufw allow 3001/tcp
```

---

## Advanced Debugging

### Run Installer in Debug Mode (Manual)
```bash
# Step 1: Create manifest
cat > /tmp/tuxpanel-debug.json << 'EOF'
{
  "component_ids": [],
  "host": "0.0.0.0",
  "port": 3001,
  "enable_on_boot": true,
  "start_now": true,
  "open_firewall": true,
  "tls_mode": "self-signed",
  "admin_user": ""
}
EOF

# Step 2: Run installer manually with full output
python3 -m tuxpanel_installer --execute /tmp/tuxpanel-debug.json

# Step 3: Watch each step from output
# Look for lines like:
# {"step": "deploy", "status": "running", "pct": 20}
# {"step": "deploy", "status": "done", "pct": 20}
# {"step": "npm-install", "status": "error", "pct": 40, "detail": "error message"}
```

### Run Installation as Root (Bypass pkexec)
```bash
# For testing, you can run installation directly as root
# (Not recommended for production, but helps debug pkexec issues)
sudo python3 -m tuxpanel_installer --execute /tmp/tuxpanel-debug.json

# This will output raw installation progress
# If this works, the problem is likely polkit/permissions
# If this also fails, the problem is the installer code itself
```

### Check AppImage Integrity
```bash
# If using AppImage:
./TuxPanel-Installer-*.AppImage --appimage-info

# Check if it mounts correctly:
./TuxPanel-Installer-*.AppImage --help

# Extract and inspect (advanced):
./TuxPanel-Installer-*.AppImage --appimage-extract
ls squashfs-root/
```

---

## File Locations Reference

After a successful install, files are at:

```
Application:   /opt/tuxpanel/
Config:        /etc/tuxpanel/environment
Logs:          journalctl -u tuxpanel -f
Systemd Unit:  /etc/systemd/system/tuxpanel.service
Polkit Rules:  /etc/polkit-1/rules.d/50-tuxpanel.rules
Desktop Entry: /usr/share/applications/org.tuxpanel.desktop
Tray Autostart: /etc/xdg/autostart/tuxpanel-tray.desktop
Icon:          /usr/share/icons/hicolor/scalable/apps/tuxpanel.svg
SSL Cert:      /etc/tuxpanel/ssl/tuxpanel.crt
```

---

## Collecting Logs for Bug Report

If you need to file a GitHub issue:

```bash
# Collect system information
uname -a > /tmp/tuxpanel-debug.txt
echo "---" >> /tmp/tuxpanel-debug.txt

# Installer version
python3 -c "from tuxpanel_installer import __version__; print(__version__)" >> /tmp/tuxpanel-debug.txt 2>&1
echo "---" >> /tmp/tuxpanel-debug.txt

# Dependencies
echo "Node.js: $(node --version)" >> /tmp/tuxpanel-debug.txt 2>&1
echo "npm: $(npm --version)" >> /tmp/tuxpanel-debug.txt 2>&1
echo "Python: $(python3 --version)" >> /tmp/tuxpanel-debug.txt 2>&1
echo "---" >> /tmp/tuxpanel-debug.txt

# Recent installation attempt logs
sudo journalctl -u tuxpanel -n 100 >> /tmp/tuxpanel-debug.txt 2>&1 || echo "(No tuxpanel logs yet)" >> /tmp/tuxpanel-debug.txt
echo "---" >> /tmp/tuxpanel-debug.txt

# Permissions check
echo "=== Permission Check ===" >> /tmp/tuxpanel-debug.txt
ls -la /opt/tuxpanel 2>&1 | head -10 >> /tmp/tuxpanel-debug.txt || echo "(Not installed)" >> /tmp/tuxpanel-debug.txt
ls -la /etc/tuxpanel 2>&1 >> /tmp/tuxpanel-debug.txt || echo "(Not created)" >> /tmp/tuxpanel-debug.txt

# Save and share
cat /tmp/tuxpanel-debug.txt
```

Then attach `/tmp/tuxpanel-debug.txt` to your GitHub issue.

---

## Quick Reference: What to Do

1. **Installation fails** → Click "View Installation Logs" button
2. **Still stuck** → Run: `bash /tmp/check-installer-logs.sh`
3. **Need to debug** → Follow "Advanced Debugging" section above
4. **Filing a bug** → Run the "Collecting Logs" command at bottom

---

**For urgent issues:** Check GitHub issues at https://github.com/JosephDoesLinux/tux-panel/issues

