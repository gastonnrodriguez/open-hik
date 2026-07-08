#!/usr/bin/env bash
# Start open-hik with Docker, auto-detecting this machine's LAN IP so WebRTC
# live view works from other devices on the network (not just this machine).
#
# Why this exists: go2rtc runs inside Docker and can't see the host's real LAN
# IP on its own (especially under Docker Desktop, which runs containers in a VM).
# We detect the IP here, on the host, and pass it in as HOST_LAN_IP. Re-run this
# script any time — if your IP changed (DHCP), it just picks up the new one.
#
# Usage: ./scripts/up.sh   (accepts extra `docker compose up` flags, e.g. --build)
set -euo pipefail
cd "$(dirname "$0")/.."

# Best-effort LAN IP detection: the source address of the route to the internet.
detect_ip() {
  if command -v ip >/dev/null 2>&1; then
    ip route get 1.1.1.1 2>/dev/null | grep -oP '(?<=src\s)\d+(\.\d+){3}' | head -1
  elif command -v ipconfig >/dev/null 2>&1; then          # macOS
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  else
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

LAN_IP="${HOST_LAN_IP:-$(detect_ip || true)}"

[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }

if [ -z "${LAN_IP:-}" ]; then
  echo "⚠  Could not auto-detect the LAN IP. WebRTC may fall back to MSE on other"
  echo "   devices. Set HOST_LAN_IP=<this-machine-ip> in .env and re-run if needed."
else
  echo "→ LAN IP: $LAN_IP (advertised to browsers for WebRTC)"
  # Persist into .env so a later plain `docker compose up` uses the same value.
  if grep -q '^HOST_LAN_IP=' .env 2>/dev/null; then
    sed -i.bak "s#^HOST_LAN_IP=.*#HOST_LAN_IP=$LAN_IP#" .env && rm -f .env.bak
  else
    printf '\n# Auto-detected by scripts/up.sh — LAN IP for WebRTC.\nHOST_LAN_IP=%s\n' "$LAN_IP" >> .env
  fi
fi

export HOST_LAN_IP="${LAN_IP:-}"
exec docker compose up -d "$@"
