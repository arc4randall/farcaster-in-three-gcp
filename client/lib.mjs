// Shared helpers: config, reading from your node, and app-FID attribution.
import { getInsecureHubRpcClient, getSSLHubRpcClient, Message, SignerSource } from "@farcaster/hub-nodejs";
import { decodeAbiParameters, bytesToHex } from "viem";
import fs from "node:fs";
import path from "node:path";

// NODE_URL: STOPGAP only. Point reads/writes at someone else's node (e.g. a
// public keyless one) while your own is still syncing. NODE_GRPC_URL is its gRPC
// equivalent; without one, signer lookups fall back to HTTP (onchain keys only).
const NODE_URL = process.env.NODE_URL?.replace(/\/$/, "");
export const cfg = {
  stopgap: !!NODE_URL,
  nodeHttp: NODE_URL ?? process.env.NODE_HTTP ?? "http://127.0.0.1:3381", // reads
  nodeGrpc: process.env.NODE_GRPC_URL ?? process.env.NODE_GRPC ?? (NODE_URL ? null : "127.0.0.1:3383"), // signer lookups
  writeUrl: process.env.WRITE_URL ?? NODE_URL ?? process.env.NODE_HTTP ?? "http://127.0.0.1:3381", // submits
  opRpc: process.env.OP_RPC ?? "https://mainnet.optimism.io",
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
};
export const signerFile = () => path.join(cfg.dataDir, "signer.json");

export const rpc = !cfg.nodeGrpc ? null : cfg.nodeGrpc.startsWith("ssl://")
  ? getSSLHubRpcClient(cfg.nodeGrpc.slice(6))
  : getInsecureHubRpcClient(cfg.nodeGrpc);

// All signers for a fid: [{ key: hex, app, source }], plus the user's KEY_ADD nonce
// (gRPC only; null over the HTTP fallback, which also cannot see gasless keys).
export async function getSigners(fid) {
  fid = Number(fid);
  const out = { signers: [], nonce: null };
  if (rpc) {
    let pageToken;
    do {
      const res = await rpc.getSignersByFid({ fid, requesterFids: [], pageToken });
      if (res.isErr()) throw new Error(res.error.message);
      out.nonce = res.value.currentUserNonce ?? null;
      for (const s of res.value.signers) {
        let app = s.requestFid;
        const meta = s.onchainEvent?.signerEventBody?.metadata;
        if (!app && meta?.length) {
          try { app = Number(decodeAbiParameters(META, bytesToHex(meta))[0].requestFid); } catch {}
        }
        out.signers.push({ key: bytesToHex(s.key).toLowerCase(), app: app || null, source: s.source === SignerSource.OFFCHAIN ? "gasless" : "onchain" });
      }
      pageToken = res.value.nextPageToken?.length ? res.value.nextPageToken : undefined;
    } while (pageToken);
    return out;
  }
  const j = await (await fetch(`${cfg.nodeHttp}/v1/onChainSignersByFid?fid=${fid}`)).json();
  for (const e of j.events ?? []) {
    const b = e.signerEventBody; if (!b || b.eventType !== "SIGNER_EVENT_TYPE_ADD") continue;
    let app = null;
    try { app = Number(decodeAbiParameters(META, Buffer.from(b.metadata, "base64").toString("hex").replace(/^/, "0x"))[0].requestFid); } catch {}
    out.signers.push({ key: b.key.startsWith("0x") ? b.key.toLowerCase() : "0x" + Buffer.from(b.key, "base64").toString("hex"), app, source: "onchain" });
  }
  return out;
}

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
  for (const s of (await getSigners(fid)).signers) m.set(s.key, { app: s.app, source: s.source });
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
