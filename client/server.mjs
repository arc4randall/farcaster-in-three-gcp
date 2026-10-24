// The client. Reads from your node's HTTP API, signs with this client's app
// key, and submits to your node, which relays to validators over gossip.
// Binds to 127.0.0.1 only: reach it through an SSH tunnel, not the open internet.
import express from "express";
import {
  NobleEd25519Signer, makeCastAdd, makeLinkAdd, makeLinkRemove, makeReactionAdd,
  FarcasterNetwork, ReactionType, hexStringToBytes,
} from "@farcaster/hub-nodejs";
import QRCode from "qrcode";
import { cfg, http, submit, appFidOf, loadSigner } from "./lib.mjs";
import * as delegated from "./delegated.mjs";

// No key yet is fine: the UI then offers "Connect with the Farcaster app".
let me, signer, opts;
function useKey() {
  me = loadSigner();
  if (!me) return;
  signer = new NobleEd25519Signer(hexStringToBytes(me.privateKey)._unsafeUnwrap());
  opts = { fid: me.fid, network: FarcasterNetwork.MAINNET };
}
useKey();
const need = () => { if (!me) throw new Error("Not connected yet"); };
const unwrap = (r) => { if (r.isErr()) throw new Error(r.error.message); return r.value; };
const hexBytes = (h) => hexStringToBytes(h)._unsafeUnwrap();

const names = new Map();
async function profile(fid) {
  if (names.has(fid)) return names.get(fid);
  const p = { fid, username: null, display: null };
  try {
    for (const m of (await http(`/v1/userDataByFid?fid=${fid}`)).messages ?? []) {
      const b = m.data.userDataBody;
      if (b.type === "USER_DATA_TYPE_USERNAME") p.username = b.value;
      if (b.type === "USER_DATA_TYPE_DISPLAY") p.display = b.value;
    }
  } catch {}
  names.set(fid, p); return p;
}
async function following(fid) {
  const out = []; let token = "";
  do {
    const r = await http(`/v1/linksByFid?fid=${fid}&link_type=follow&pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    for (const m of r.messages ?? []) if (m.data.linkBody?.targetFid) out.push(m.data.linkBody.targetFid);
    token = r.nextPageToken;
  } while (token && out.length < 5000);
  return out;
}
const ids = (s) => new Set(String(s ?? "").split(",").map((x) => Number(x.trim())).filter(Boolean));

const app = express();
app.use(express.json());
app.use(express.static(new URL("./public", import.meta.url).pathname));
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: String(e.message ?? e) }); }
};

app.post("/api/connect", wrap(async () => {
  const r = await delegated.start();
  return { ...r, qr: await QRCode.toString(r.deeplinkUrl, { type: "svg", margin: 1 }) };
}));
app.get("/api/connect/status", wrap(async () => {
  const r = await delegated.poll();
  if (r.state === "ready") useKey();
  return r;
}));
app.get("/api/me", wrap(async () => !me ? { connected: false, appConfigured: !!delegated.loadApp(), node: cfg.nodeHttp } : ({ connected: true, ...me, privateKey: undefined, node: cfg.nodeHttp, writeUrl: cfg.writeUrl, profile: await profile(me.fid) })));
app.get("/api/info", wrap(() => http("/v1/info")));
app.get("/api/lookup", wrap(async (req) => {
  const r = await http(`/v1/userNameProofByName?name=${encodeURIComponent(req.query.name)}`);
  return { fid: r.fid };
}));

// Feed = newest casts from the accounts you follow (or one FID), each tagged
// with the app FID that requested the key that signed it.
app.get("/api/feed", wrap(async (req) => {
  need();
  const include = ids(req.query.include), exclude = ids(req.query.exclude);
  const per = Math.min(Number(req.query.per ?? 5), 25);
  const fids = req.query.fid ? [Number(req.query.fid)] : (await following(me.fid)).slice(-150);
  const casts = [];
  await Promise.all(fids.map(async (fid) => {
    try {
      const r = await http(`/v1/castsByFid?fid=${fid}&pageSize=${req.query.fid ? 50 : per}&reverse=true`);
      for (const m of r.messages ?? []) {
        if (!m.data.castAddBody) continue;
        casts.push({ fid, hash: m.hash, signer: m.signer, ts: m.data.timestamp, text: m.data.castAddBody.text,
          parent: m.data.castAddBody.parentCastId ?? null, embeds: m.data.castAddBody.embeds ?? [] });
      }
    } catch {}
  }));
  casts.sort((a, b) => b.ts - a.ts);
  const top = casts.slice(0, 200);
  await Promise.all(top.map(async (c) => { c.appFid = await appFidOf(c.fid, c.signer); }));
  const filtered = top.filter((c) => (!include.size || include.has(c.appFid)) && !exclude.has(c.appFid)).slice(0, 80);
  const apps = {};
  for (const c of top) apps[c.appFid ?? "unknown"] = (apps[c.appFid ?? "unknown"] ?? 0) + 1;
  await Promise.all(filtered.map(async (c) => { c.author = await profile(c.fid); }));
  await Promise.all(Object.keys(apps).filter((k) => k !== "unknown").map((k) => profile(Number(k))));
  return { casts: filtered, apps: Object.entries(apps).map(([fid, n]) => ({ fid, n, name: names.get(Number(fid))?.username ?? null })) };
}));

app.post("/api/cast", wrap(async (req) => {
  need();
  const { text, parentFid, parentHash } = req.body;
  const body = { text, embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: [], type: 0 };
  if (parentFid && parentHash) body.parentCastId = { fid: Number(parentFid), hash: hexBytes(parentHash) };
  return submit(unwrap(await makeCastAdd(body, opts, signer)));
}));
app.post("/api/follow", wrap(async (req) =>
  need() ?? submit(unwrap(await (req.body.undo ? makeLinkRemove : makeLinkAdd)({ type: "follow", targetFid: Number(req.body.fid) }, opts, signer)))));
app.post("/api/react", wrap(async (req) => {
  need();
  const type = req.body.type === "recast" ? ReactionType.RECAST : ReactionType.LIKE;
  return submit(unwrap(await makeReactionAdd({ type, targetCastId: { fid: Number(req.body.fid), hash: hexBytes(req.body.hash) } }, opts, signer)));
}));
// Confirm inclusion: a 200 from submitMessage only means "valid, relayed".
app.get("/api/check", wrap(async (req) => {
  try { await http(`/v1/castById?fid=${Number(req.query.fid)}&hash=${req.query.hash}`); return { merged: true }; }
  catch { return { merged: false }; }
}));

app.listen(cfg.port, "127.0.0.1", () => console.log(`client on http://127.0.0.1:${cfg.port}  (${me ? `fid ${me.fid}, app fid ${me.appFid}` : "not connected yet"}, node ${cfg.nodeHttp})`));
