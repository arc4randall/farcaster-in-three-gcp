#!/usr/bin/env bash
# Runs ON the VM (node.sh pipes it over SSH). Safe to re-run.
set -euo pipefail
V="${SNAPCHAIN_VERSION:?}"
RAW="https://raw.githubusercontent.com/farcasterxyz/snapchain/v$V"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true
command -v jq >/dev/null || sudo apt-get install -y -qq jq

mkdir -p ~/snapchain && cd ~/snapchain
# Same files snapchain.sh installs, but from the release tag instead of main,
# and with the image pinned instead of :latest + pull_policy: always.
curl -fsSL "$RAW/docker-compose.mainnet.yml" \
  | sed -e "s#farcasterxyz/snapchain:latest#farcasterxyz/snapchain:$V#" -e '/pull_policy: always/d' \
  > docker-compose.yml
curl -fsSL "$RAW/validators.toml" -o validators.toml
mkdir -p .rocks .rocks.snapshot .onchain-config
grep -q "farcasterxyz/snapchain:$V" docker-compose.yml || { echo "image pin failed" >&2; exit 1; }

# statsd is referenced by the node's config; grafana is optional and left off.
sudo docker compose up -d snapchain statsd
echo
echo "Snapchain $V started. The first boot downloads a snapshot (several hundred GB)."
echo "Watch it:   gcloud compute ssh <vm> -- 'cd ~/snapchain && sudo docker compose logs -f --tail 20 snapchain'"
echo "Progress:   gcloud compute ssh <vm> -- 'curl -s localhost:3381/v1/info | jq .shardInfos'"
