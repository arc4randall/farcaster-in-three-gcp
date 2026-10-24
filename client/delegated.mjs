// Delegated sign-in: the user approves this client's key in the Farcaster app.
// No user seed phrase touches this client. Flow (docs.farcaster.xyz/reference/farcaster/signer-requests):
//   1. make an Ed25519 key here
//   2. the APP's custody key signs a SignedKeyRequest {requestFid, key, deadline}
//   3. POST it to https://api.farcaster.xyz/v2/signed-key-requests -> token + deeplink
//   4. user opens the deeplink / scans the QR in the Farcaster app and approves;
//      the app registers the key onchain (KeyGateway) from the user's account
//   5. poll GET /v2/signed-key-request?token=... until state == "completed"
// api.farcaster.xyz needs no API key. It is a third-party service used once, for the
// handoff to the user's phone; reads and writes still go only to your node.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { NobleEd25519Signer, ViemLocalEip712Signer } from "@farcaster/hub-nodejs";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import { cfg, getSigners, signerFile } from "./lib.mjs";

const API = process.env.FARCASTER_API ?? "https://api.farcaster.xyz";
export const appFile = () => path.join(cfg.dataDir, "app.json");
export const loadApp = () => (fs.existsSync(appFile()) ? JSON.parse(fs.readFileSync(appFile(), "utf8")) : null);

let pending = null; // { token, deeplinkUrl, priv, pub, appFid }

export async function start() {
  const app = loadApp();
  if (!app) throw new Error("No app FID configured on this VM. Run: npm run app-key");
  const priv = randomBytes(32);
  const pub = (await new NobleEd25519Signer(priv).getSignerKey())._unsafeUnwrap();
  const deadline = Math.floor(Date.now() / 1000) + 86400;
  const appSigner = new ViemLocalEip712Signer(privateKeyToAccount(app.privateKey));
  const sig = (await appSigner.signKeyRequest({ requestFid: BigInt(app.appFid), key: pub, deadline: BigInt(deadline) }))._unsafeUnwrap();
  const r = await fetch(`${API}/v2/signed-key-requests`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: bytesToHex(pub), requestFid: app.appFid, signature: bytesToHex(sig), deadline }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`signed-key-requests: ${JSON.stringify(j)}`);
  const { token, deeplinkUrl } = j.result.signedKeyRequest;
  pending = { token, deeplinkUrl, priv: bytesToHex(priv), pub: bytesToHex(pub), appFid: app.appFid };
  return { deeplinkUrl, appFid: app.appFid, key: pending.pub };
}

// Returns {state}. On "completed", waits for YOUR node to see the key, then saves it.
export async function poll() {
  if (!pending) return { state: "none" };
  const r = await fetch(`${API}/v2/signed-key-request?token=${pending.token}`);
  const j = await r.json();
  const s = j.result?.signedKeyRequest;
  if (!s) return { state: "error", error: JSON.stringify(j) };
  if (s.state !== "completed") return { state: s.state, userFid: s.userFid };
  const seen = await getSigners(s.userFid).catch(() => ({ signers: [] }));
  if (!seen.signers.some((x) => x.key === pending.pub.toLowerCase()))
    return { state: "waiting-for-node", userFid: s.userFid };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.writeFileSync(signerFile(), JSON.stringify({ fid: s.userFid, appFid: pending.appFid, privateKey: pending.priv, publicKey: pending.pub, mode: "delegated" }, null, 2), { mode: 0o600 });
  pending = null;
  return { state: "ready" };
}
