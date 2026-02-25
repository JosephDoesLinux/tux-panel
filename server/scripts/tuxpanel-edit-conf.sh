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
)

# Check if file is allowed
is_allowed=0
for allowed in "${ALLOWED_FILES[@]}"; do
  if [[ "$FILE" == "$allowed" ]]; then
    is_allowed=1
    break
  fi
done

if [[ $is_allowed -eq 0 ]]; then
  echo "Error: File $FILE is not allowed." >&2
  exit 1
fi

if [[ "$ACTION" == "read" ]]; then
  cat "$FILE"
elif [[ "$ACTION" == "write" ]]; then
  cat > "$FILE"
else
  echo "Error: Invalid action $ACTION." >&2
  exit 1
fi
