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
if [ ! -f data/signer.json ]; then
  case "$FLAG" in
    --seed)    node setup.mjs ;;            # gasless KEY_ADD signed with a test account's phrase
    --onchain) node setup.mjs --onchain ;;  # legacy KeyGateway.add transaction
    *)
      # Default: delegated approval in the Farcaster app. Needs this client's app FID once.
      if [ ! -f data/app.json ]; then
        echo "This client needs its own app FID to request keys (operator only, one time)."
        echo "Use the custody phrase or key of a FID you registered for the app, NOT a personal account."
        node app-key.mjs
      fi
      echo "Open http://localhost:3000 and press 'Connect with the Farcaster app'." ;;
  esac
fi
exec node server.mjs
