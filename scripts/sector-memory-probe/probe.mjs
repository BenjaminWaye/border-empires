// Probe client for the stack started by launch-stack.mjs: logs in N humans,
// joins each to the contest, has each tap one of their own tiles on an
// interval, and appends one metrics row to PROBE_DIR/timeline.jsonl every
// PROBE_SAMPLE_S seconds until PROBE_DURATION_S elapses.
//
// Env:
//   PROBE_DIR                 same directory launch-stack.mjs uses (required)
//   PROBE_HUMANS              humans to connect (default 40)
//   PROBE_DURATION_S          how long to stay connected (default 600)
//   PROBE_SAMPLE_S            metrics sampling period (default 10)
//   PROBE_DETAIL_INTERVAL_MS  how often each human taps a tile (default 5000)
//   WS_URL / SIM_METRICS_URL / GATEWAY_METRICS_URL  default to 127.0.0.1:13101 / :50052
import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/realtime-gateway/package.json", import.meta.url));
const WebSocket = require("ws");

const probeDir = process.env.PROBE_DIR;
if (!probeDir) throw new Error("PROBE_DIR is required");
const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:13101/ws";
const simMetricsUrl = process.env.SIM_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:13101/metrics";
const humanCount = Number(process.env.PROBE_HUMANS ?? 40);
const durationS = Number(process.env.PROBE_DURATION_S ?? 600);
const sampleS = Number(process.env.PROBE_SAMPLE_S ?? 10);
const detailIntervalMs = Number(process.env.PROBE_DETAIL_INTERVAL_MS ?? 5000);
const projectId = "border-empires-probe";
const privateKey = readFileSync(`${probeDir}/signing-key.pem`, "utf8");

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenFor = (uid, email) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid: "probe", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: uid, user_id: uid,
    email, email_verified: true, name: uid, iat: now, exp: now + 3600,
    firebase: { identities: { email: [email] }, sign_in_provider: "password" }
  })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const openPlayer = (uid) => new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  const player = { uid, socket, bytes: 0, errors: [], closed: undefined, ownTile: undefined, playerId: undefined };
  const timer = setTimeout(() => reject(new Error(`${uid}: no INIT within 120s`)), 120_000);
  socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token: tokenFor(uid, `${uid}@example.com`) })));
  socket.on("close", (code) => { player.closed = { code, at: Date.now() }; });
  socket.on("error", (error) => player.errors.push(String(error)));
  socket.on("message", (raw) => {
    const text = raw.toString();
    player.bytes += text.length;
    const type = /"type":"([A-Z_]+)"/.exec(text.slice(0, 200))?.[1] ?? "UNKNOWN";
    if (type === "ERROR") player.errors.push(text.slice(0, 200));
    // A fresh human only owns land after JOIN_SEASON, so the tile to tap is
    // learned from whichever message first carries one of their tiles.
    if (!player.ownTile && player.playerId && text.includes(`"ownerId":"${player.playerId}"`)) {
      const parsed = JSON.parse(text);
      const tiles = parsed.initialState?.tiles ?? parsed.tiles ?? parsed.updates ?? [];
      player.ownTile = tiles.find((tile) => tile.ownerId === player.playerId);
    }
    if (type === "INIT" && !player.playerId) {
      const init = JSON.parse(text);
      player.playerId = init.player?.id;
      player.ownTile = (init.initialState?.tiles ?? []).find((tile) => tile.ownerId === player.playerId);
      if (init.needsSeasonJoin) socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
      clearTimeout(timer);
      resolve(player);
    }
  });
});

const SIM_NAMES = [
  "sim_heap_used_mb", "sim_heap_total_mb", "sim_checkpoint_rss_mb", "sim_owned_tiles_total", "sim_max_empire_tiles",
  "sim_event_loop_max_ms", "sim_snapshot_cache_bytes", "sim_snapshot_cache_entries", "sim_inmemory_persistence_events",
  "sim_replay_recorded_command_history", "sim_cpu_percent"
];
const GATEWAY_NAMES = [
  "gateway_heap_used_mb", "gateway_heap_total_mb", "gateway_rss_mb", "gateway_ws_sessions", "gateway_event_loop_max_ms",
  "gateway_snapshot_cache_bytes", "gateway_snapshot_cache_entries"
];
const scrape = async (url, names) => {
  try {
    const text = await (await fetch(url, { signal: AbortSignal.timeout(4000) })).text();
    const out = {};
    for (const line of text.split("\n")) {
      const match = /^([a-z_]+)(\{[^}]*\})?\s+([0-9.eE+-]+)$/.exec(line);
      if (match && names.includes(match[1])) out[`${match[1]}${match[2] ?? ""}`] = Number(match[3]);
    }
    return out;
  } catch (error) {
    return { scrapeFailed: String(error) };
  }
};

const humans = [];
for (let index = 0; index < humanCount; index += 1) humans.push(await openPlayer(`probe-human-${index + 1}`));
console.log(`[probe] ${humans.length} humans connected`);
const taps = humans.map((player) => setInterval(() => {
  if (player.ownTile && player.socket.readyState === 1) {
    player.socket.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: player.ownTile.x, y: player.ownTile.y }));
  }
}, detailIntervalMs));

const startedAt = Date.now();
while (Date.now() - startedAt < durationS * 1000) {
  await sleep(sampleS * 1000);
  appendFileSync(`${probeDir}/timeline.jsonl`, `${JSON.stringify({
    at: Date.now(),
    humans: humans.length,
    humansWithLand: humans.filter((player) => player.ownTile).length,
    humansClosed: humans.filter((player) => player.closed).length,
    humanErrors: humans.reduce((sum, player) => sum + player.errors.length, 0),
    bytesToHumans: humans.reduce((sum, player) => sum + player.bytes, 0),
    sim: await scrape(simMetricsUrl, SIM_NAMES),
    gateway: await scrape(gatewayMetricsUrl, GATEWAY_NAMES)
  })}\n`);
}
for (const tap of taps) clearInterval(tap);
console.log(JSON.stringify({
  humans: humans.length,
  humansWithLand: humans.filter((player) => player.ownTile).length,
  humansClosed: humans.filter((player) => player.closed).length,
  errors: humans.flatMap((player) => player.errors).slice(0, 10)
}));
process.exit(0);
