// Shared helpers: config, reading from your node, and app-FID attribution.
import { getInsecureHubRpcClient, getSSLHubRpcClient, Message, SignerSource } from "@farcaster/hub-nodejs";
import { decodeAbiParameters, bytesToHex } from "viem";
import fs from "node:fs";
import path from "node:path";

export const cfg = {
  nodeHttp: process.env.NODE_HTTP ?? "http://127.0.0.1:3381", // reads
  nodeGrpc: process.env.NODE_GRPC ?? "127.0.0.1:3383",       // signer lookups
  writeUrl: process.env.WRITE_URL ?? process.env.NODE_HTTP ?? "http://127.0.0.1:3381", // submits
  opRpc: process.env.OP_RPC ?? "https://mainnet.optimism.io",
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
};
export const signerFile = () => path.join(cfg.dataDir, "signer.json");

export const rpc = cfg.nodeGrpc.startsWith("ssl://")
  ? getSSLHubRpcClient(cfg.nodeGrpc.slice(6))
  : getInsecureHubRpcClient(cfg.nodeGrpc);

export async function http(pathAndQuery) {
  const r = await fetch(cfg.nodeHttp + pathAndQuery);
  if (!r.ok) throw new Error(`${pathAndQuery} -> HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// Submit a signed protobuf Message. The bytes are identical whichever node
// receives them; the node validates and gossips them to the validators.
export async function submit(msg) {
  const bytes = Message.encode(msg).finish();
  const r = await fetch(cfg.writeUrl + "/v1/submitMessage", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`submitMessage HTTP ${r.status}: ${text}`);
  return { hash: bytesToHex(msg.hash), via: cfg.writeUrl };
}

const META = [{ type: "tuple", components: [
  { name: "requestFid", type: "uint256" }, { name: "requestSigner", type: "address" },
  { name: "signature", type: "bytes" }, { name: "deadline", type: "uint256" } ] }];

// fid -> Map(signerHex -> appFid). Every key carries the FID of the app that
// requested it (SignedKeyRequest metadata), so each cast's `signer` tells us
// which client produced it.
const cache = new Map();
export async function signerAppMap(fid) {
  const hit = cache.get(fid);
  if (hit && Date.now() - hit.t < 10 * 60_000) return hit.m;
  const m = new Map();
  let pageToken;
  do {
    const res = await rpc.getSignersByFid({ fid, pageToken });
    if (res.isErr()) throw new Error(res.error.message);
    for (const s of res.value.signers) {
      let app = s.requestFid;
      const meta = s.onchainEvent?.signerEventBody?.metadata;
      if (!app && meta?.length) {
        try { app = Number(decodeAbiParameters(META, bytesToHex(meta))[0].requestFid); } catch {}
      }
      m.set(bytesToHex(s.key).toLowerCase(), { app: app ?? null, source: s.source === SignerSource.OFFCHAIN ? "gasless" : "onchain" });
    }
    pageToken = res.value.nextPageToken?.length ? res.value.nextPageToken : undefined;
  } while (pageToken);
  cache.set(fid, { t: Date.now(), m });
  return m;
}
export async function appFidOf(fid, signerHex) {
  try { return (await signerAppMap(fid)).get(signerHex.toLowerCase())?.app ?? null; }
  catch { return null; }
}

export function loadSigner() {
  if (!fs.existsSync(signerFile())) return null;
  return JSON.parse(fs.readFileSync(signerFile(), "utf8"));
}
