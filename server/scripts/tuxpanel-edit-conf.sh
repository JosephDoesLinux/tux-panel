#!/bin/bash
# tuxpanel-edit-conf.sh
# Helper script to safely read/write specific configuration files.

ACTION=$1
FILE=$2

ALLOWED_FILES=(
  "/etc/samba/smb.conf"
  "/etc/exports"
  "/etc/ssh/sshd_config"
  "/etc/vsftpd/vsftpd.conf"
  "/etc/vsftpd.conf"
  "/etc/tigervnc/vncserver.users"
)

# Allowed path patterns (glob-style)
ALLOWED_PATTERNS=(
  "/home/*/.config/tigervnc/config"
  "/home/*/.vnc/config"  # Legacy fallback
)

# Check if file is allowed
is_allowed=0

# Resolve real path to prevent directory traversal
if [[ -e "$FILE" ]]; then
  REALPATH=$(readlink -f "$FILE")
else
  # If it doesn't exist yet, evaluate the directory
  DIR_PART=$(dirname "$FILE")
  if [[ -d "$DIR_PART" ]]; then
    REALPATH="$(readlink -f "$DIR_PART")/$(basename "$FILE")"
  else
    REALPATH="$FILE"
  fi
fi

# Exact matches
for allowed in "${ALLOWED_FILES[@]}"; do
  if [[ "$REALPATH" == "$allowed" ]]; then
    is_allowed=1
    break
  fi
done

# Pattern matches (for user-scoped paths)
if [[ $is_allowed -eq 0 ]]; then
  for pattern in "${ALLOWED_PATTERNS[@]}"; do
    # shellcheck disable=SC2254
    if [[ "$REALPATH" == $pattern ]]; then
      # additional anti-traversal check to ensure it stays in /home
      if [[ "$REALPATH" =~ ^/home/[^/]+ ]]; then
        is_allowed=1
        break
      fi
    fi
  done
fi

if [[ $is_allowed -eq 0 ]]; then
  echo "Error: File $FILE is not allowed." >&2
  exit 1
fi

if [[ "$ACTION" == "read" ]]; then
  cat "$REALPATH"
elif [[ "$ACTION" == "write" ]]; then
  # Auto-create parent directory if needed
  PARENT_DIR=$(dirname "$REALPATH")
  if [[ ! -d "$PARENT_DIR" ]]; then
    mkdir -p "$PARENT_DIR"
    # For /home/* paths, fix ownership to the home directory user
    if [[ "$PARENT_DIR" =~ ^/home/([^/]+) ]]; then
      HOME_USER="${BASH_REMATCH[1]}"
      if id "$HOME_USER" &>/dev/null; then
        chown -R "$HOME_USER:$(id -gn "$HOME_USER")" "$PARENT_DIR"
      fi
    fi
  fi
  cat > "$REALPATH"
  # For files under /home/*, fix ownership so the user owns their config
  if [[ "$REALPATH" =~ ^/home/([^/]+) ]]; then
    HOME_USER="${BASH_REMATCH[1]}"
    if id "$HOME_USER" &>/dev/null; then
      chown "$HOME_USER:$(id -gn "$HOME_USER")" "$REALPATH"
    fi
  fi
else
  echo "Error: Invalid action $ACTION." >&2
  exit 1
fi
