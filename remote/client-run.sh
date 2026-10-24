#!/usr/bin/env bash
# Runs ON the VM. Installs Node 22 if needed, installs pinned deps, creates the
# app key on first run, then starts the client on 127.0.0.1:3000.
set -euo pipefail
FLAG="${1:-}"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs
fi
cd ~/fc-client-src
npm ci --omit=dev --no-audit --no-fund --loglevel=error
info=$(curl -s localhost:3381/v1/info || true)
if [ -z "$info" ]; then echo "Your node isn't answering on :3381. Run ./node.sh first." >&2; exit 1; fi
echo "node: $(echo "$info" | jq -c '[.shardInfos[] | {shard: .shardId, blockDelay}]')"
echo "(blockDelay in single digits on every shard = in sync)"
[ -f data/signer.json ] || node setup.mjs ${FLAG:+"$FLAG"}
exec node server.mjs
