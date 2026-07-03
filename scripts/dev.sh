#!/usr/bin/env bash
# Run open-hik locally without Docker (development mode).
# Downloads the go2rtc binary on first run, then starts go2rtc + Next.js dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — edit it with your DVR credentials, then re-run this script."
  exit 1
fi

set -a
source .env
set +a

BIN=.local/go2rtc
if [ ! -x "$BIN" ]; then
  mkdir -p .local
  echo "Downloading go2rtc..."
  curl -sSL -o "$BIN" "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64"
  chmod +x "$BIN"
fi

# go2rtc persists API-added streams (with resolved credentials) into its config
# file, so it must never run against the repo copy — use a runtime copy instead.
cp go2rtc/go2rtc.yaml .local/go2rtc.runtime.yaml
"$BIN" -config .local/go2rtc.runtime.yaml &
GO2RTC_PID=$!
trap 'kill $GO2RTC_PID 2>/dev/null' EXIT

cd web
[ -d node_modules ] || npm install
npm run dev
