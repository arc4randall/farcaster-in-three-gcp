# farcaster-in-three-gcp

Run your own Farcaster stack on Google Cloud in three commands: a VM, a Snapchain
read node, and a small web client that reads from that node and posts through it.
No API keys.

Tutorial: https://arc4randall.github.io/farcaster-in-three-gcp/ ([中文](https://arc4randall.github.io/farcaster-in-three-gcp/zh.html))

```sh
git clone https://github.com/arc4randall/farcaster-in-three-gcp && cd farcaster-in-three-gcp
./provision.sh   # 0. e2-standard-4 + 2 TB pd-standard + firewall (3382/udp)
./node.sh        # 1. Snapchain read node, image pinned to 0.14.3
./client.sh      # 2. client on localhost:3000 over SSH; approve its key in the Farcaster app
```

**Status:** code and tutorial complete; scripts lint clean and the offline tests pass.
Not yet run end to end on GCP or mainnet; measured results will go under [Measured](#measured).

Run from Cloud Shell or anywhere `gcloud` is logged in with a billing-enabled project.
Settings live in `config.env` (zone, VM name, machine type, disk size, Snapchain version).

**Sign-in:** the default is delegated approval. The client shows a QR code, you approve
its key in the Farcaster app, and your seed phrase never touches it. This needs the client's
own app FID key once, on the VM (`npm run app-key`). `./client.sh --seed` imports a phrase
instead: use a test account and read `client/setup.mjs` first. Treat pasting a phrase like
`rm -rf /`.

## Layout

| Path | What |
| --- | --- |
| `provision.sh` | Command 0. Creates firewall rules and the VM. Idempotent. |
| `node.sh`, `remote/node-setup.sh` | Command 1. Installs Docker, fetches compose + `validators.toml` from the Snapchain release tag, pins the image, starts it. |
| `client.sh`, `remote/client-run.sh` | Command 2. Copies the client, installs Node 22, runs setup once, starts the server, opens an SSH tunnel. |
| `client/delegated.mjs` | Default sign-in: signed key request -> QR/deeplink -> approval in the Farcaster app -> poll until your node has the key. |
| `client/app-key.mjs` | One-time operator step: store the app FID's custody key on the VM (mode 600). |
| `client/setup.mjs` | Alternate: seed phrase -> FID -> new Ed25519 key -> gasless `KEY_ADD` (`--seed`) or `KeyGateway.add` (`--onchain`). |
| `client/server.mjs`, `client/public/` | Feed, casts, replies, follow/unfollow, like/recast, include/exclude by app FID. |
| `client/test.mjs` | Offline check: builds a `KEY_ADD`, a cast and a signed key request with throwaway keys and verifies them. |
| `docs/` | The microsite (GitHub Pages, `/docs` folder). |
| `NOTES-upstream.md` | Outdated upstream docs we hit, with file/line and the correct fact. |
| `upstream/` | Patches and PR text for three of those fixes in farcasterxyz/docs. |
| `VIDEO.md` | Script for a 59 s vertical walkthrough. |

## Writes

The client submits every message to your own read node (`POST /v1/submitMessage`). The
read node validates it and relays it to validators over the `mempool` gossip topic; it has
no mempool of its own. A 200 means "valid and relayed", so the client confirms inclusion
with `/v1/castById`. Details: https://snapchain.farcaster.xyz/node-types#message-submission-and-the-mempool

## Measured

<a id="measured"></a>
Not measured yet. Provision time, snapshot download, catch-up and disk use will go here
after the first full run.

## Develop

```sh
cd client && npm ci && npm test
npm run app-key   # once: this client's app FID
NODE_HTTP=http://127.0.0.1:3381 NODE_GRPC=127.0.0.1:3383 npm start   # then Connect in the UI
```

MIT licensed.
