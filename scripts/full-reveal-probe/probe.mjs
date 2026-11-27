// Probe client for the stack started by launch-stack.mjs.
//
// Logs in a fog admin and one ordinary (fogged) bystander, measures a fogged
// baseline, then reveals the whole map for the admin and keeps measuring.
// Writes one JSON report to PROBE_OUTPUT (default: stdout only).
//
// Env:
//   PROBE_DIR            same directory launch-stack.mjs wrote signing-key.pem to
//   WS_URL               default ws://127.0.0.1:13101/ws
//   SIM_METRICS_URL      default http://127.0.0.1:50052/metrics
//   GATEWAY_METRICS_URL  default http://127.0.0.1:13101/metrics
//   PROBE_BASELINE_S     fogged seconds before the reveal (default 60)
//   PROBE_REVEAL_S       seconds to observe after the reveal (default 180)
//   PROBE_BYSTANDERS     fogged humans polling tile detail (default 1)
//   PROBE_DETAIL_INTERVAL_MS  how often each of them taps a tile (default 500)
//   PROBE_REVEALERS      sockets of the fog admin that reveal the map (default 1;
//                        only the admin account may reveal during a live season)
//   PROBE_ADMIN_EMAIL    default fog-admin@example.com
import { createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/realtime-gateway/package.json", import.meta.url));
const WebSocket = require("ws");

const probeDir = process.env.PROBE_DIR;
if (!probeDir) throw new Error("PROBE_DIR is required");
const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:13101/ws";
const simMetricsUrl = process.env.SIM_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:13101/metrics";
const baselineS = Number(process.env.PROBE_BASELINE_S ?? 60);
const revealS = Number(process.env.PROBE_REVEAL_S ?? 180);
const bystanderCount = Number(process.env.PROBE_BYSTANDERS ?? 1);
const detailIntervalMs = Number(process.env.PROBE_DETAIL_INTERVAL_MS ?? 500);
const revealerCount = Number(process.env.PROBE_REVEALERS ?? 1);
const adminEmail = process.env.PROBE_ADMIN_EMAIL ?? "fog-admin@example.com";
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

const openPlayer = (uid, email) => new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  const player = { uid, socket, bytesByType: {}, countByType: {}, listeners: new Set(), init: undefined, errors: [], closed: undefined };
  const timer = setTimeout(() => reject(new Error(`${uid}: no INIT within 120s`)), 120_000);
  socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token: tokenFor(uid, email) })));
  socket.on("close", (code) => { player.closed = { code, at: Date.now() }; });
  socket.on("error", (error) => player.errors.push(String(error)));
  socket.on("message", (raw) => {
    const text = raw.toString();
    const type = /"type":"([A-Z_]+)"/.exec(text.slice(0, 200))?.[1] ?? "UNKNOWN";
    player.bytesByType[type] = (player.bytesByType[type] ?? 0) + text.length;
    player.countByType[type] = (player.countByType[type] ?? 0) + 1;
    if (type === "ERROR") player.errors.push(text.slice(0, 200));
    for (const listener of player.listeners) listener(type, text);
    // A fresh human only owns land after JOIN_SEASON, so the tile to poll is
    // learned from whichever message first carries one of their tiles.
    if (!player.ownTile && player.playerId && text.includes(`"ownerId":"${player.playerId}"`)) {
      const parsed = JSON.parse(text);
      const tiles = parsed.initialState?.tiles ?? parsed.tiles ?? parsed.updates ?? [];
      player.ownTile = tiles.find((tile) => tile.ownerId === player.playerId);
    }
    if (type === "INIT" && !player.init) {
      player.init = JSON.parse(text);
      player.playerId = player.init.player?.id;
      player.ownTile = (player.init.initialState?.tiles ?? []).find((tile) => tile.ownerId === player.playerId);
      if (player.init.needsSeasonJoin) socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
      clearTimeout(timer);
      resolve(player);
    }
  });
});

const scrape = async (url, names) => {
  try {
    const text = await (await fetch(url, { signal: AbortSignal.timeout(4000) })).text();
    const out = {};
    for (const line of text.split("\n")) {
      const match = /^([a-z_]+)(\{[^}]*\})?\s+([0-9.eE+-]+)$/.exec(line);
      if (match && names.some((name) => match[1] === name)) out[`${match[1]}${match[2] ?? ""}`] = Number(match[3]);
    }
    return out;
  } catch (error) {
    return { scrapeFailed: String(error) };
  }
};
const SIM_NAMES = ["sim_event_loop_max_ms", "sim_heap_used_mb", "sim_event_loop_delay_ms"];
const GATEWAY_NAMES = ["gateway_event_loop_max_ms", "gateway_heap_used_mb", "gateway_rss_mb", "gateway_ws_sessions"];

// A fogged human asks for the detail of a tile they own twice a second. The
// gateway answers from its cache first and then again with the simulation's
// fresh copy; the second answer is the full client -> gateway -> simulation ->
// gateway -> client round trip, which is what a player feels when tapping a tile.
const DETAIL_TIMEOUT_MS = 15_000;
const startTileDetailPoll = (player, samples) => {
  let pendingAt;
  let answers = 0;
  player.listeners.add((type) => {
    if (type !== "TILE_DELTA" || pendingAt === undefined) return;
    answers += 1;
    if (answers < 2) return;
    samples.push({ at: Date.now(), ms: Date.now() - pendingAt });
    pendingAt = undefined;
  });
  return setInterval(() => {
    if (pendingAt !== undefined && Date.now() - pendingAt < DETAIL_TIMEOUT_MS) return;
    if (pendingAt !== undefined) samples.push({ at: Date.now(), ms: DETAIL_TIMEOUT_MS, timedOut: true });
    const own = player.ownTile;
    if (!own || player.socket.readyState !== 1) return;
    pendingAt = Date.now();
    answers = 0;
    player.socket.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: own.x, y: own.y }));
  }, detailIntervalMs);
};

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const summarise = (samples, from, to) => {
  const values = samples.filter((sample) => sample.at >= from && sample.at < to).map((sample) => sample.ms);
  return { count: values.length, timedOut: samples.filter((sample) => sample.at >= from && sample.at < to && sample.timedOut).length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.max(...values) : null };
};

const admin = await openPlayer("probe-fog-admin", adminEmail);
const extraRevealers = [];
for (let index = 1; index < revealerCount; index += 1) extraRevealers.push(await openPlayer("probe-fog-admin", adminEmail));
const bystanders = [];
for (let index = 0; index < bystanderCount; index += 1) {
  bystanders.push(await openPlayer(`probe-human-${index + 1}`, `probe-human-${index + 1}@example.com`));
}
await sleep(3000);
const detailSamples = [];
const polls = bystanders.map((player) => startTileDetailPoll(player, detailSamples));
const timeline = [];
const tick = setInterval(async () => {
  timeline.push({ at: Date.now(), sim: await scrape(simMetricsUrl, SIM_NAMES), gateway: await scrape(gatewayMetricsUrl, GATEWAY_NAMES), adminBytes: Object.values(admin.bytesByType).reduce((a, b) => a + b, 0) });
}, 5000);

const startedAt = Date.now();
await sleep(baselineS * 1000);
const revealAt = Date.now();
const baselineBytes = { ...admin.bytesByType };
admin.socket.send(JSON.stringify({ type: "REQUEST_REVEAL_MAP" }));
// The gateway allows one reveal request per player every 5 s.
for (const revealer of extraRevealers) {
  await sleep(5500);
  revealer.socket.send(JSON.stringify({ type: "REQUEST_REVEAL_MAP" }));
}
await sleep(Math.max(0, revealS * 1000 - (Date.now() - revealAt)));
const endedAt = Date.now();
clearInterval(tick);
for (const poll of polls) clearInterval(poll);

const revealBytes = {};
for (const [type, bytes] of Object.entries(admin.bytesByType)) revealBytes[type] = bytes - (baselineBytes[type] ?? 0);
const maxOf = (rows, pick) => rows.reduce((max, row) => Math.max(max, pick(row) ?? 0), 0);
const phase = (from, to) => {
  const rows = timeline.filter((row) => row.at >= from && row.at < to);
  return {
    seconds: Math.round((to - from) / 1000),
    tileDetailRoundTripMs: summarise(detailSamples, from, to),
    simEventLoopMaxMs: maxOf(rows, (row) => row.sim.sim_event_loop_max_ms),
    simHeapUsedMaxMb: maxOf(rows, (row) => row.sim.sim_heap_used_mb),
    gatewayEventLoopMaxMs: maxOf(rows, (row) => row.gateway.gateway_event_loop_max_ms),
    gatewayHeapUsedMaxMb: maxOf(rows, (row) => row.gateway.gateway_heap_used_mb),
    rssMaxMb: maxOf(rows, (row) => row.gateway.gateway_rss_mb),
    metricScrapeFailures: rows.filter((row) => row.sim.scrapeFailed || row.gateway.scrapeFailed).length
  };
};
const report = {
  testedAt: new Date().toISOString(),
  humans: bystanders.length,
  humansWithLand: bystanders.filter((player) => player.ownTile).length,
  revealedSockets: revealerCount,
  extraRevealersCompleted: extraRevealers.filter((player) => player.countByType.REVEAL_MAP_END === 1).length,
  extraRevealerErrors: extraRevealers.flatMap((player) => player.errors).slice(0, 10),
  baseline: { ...phase(startedAt, revealAt), adminBytesByType: baselineBytes },
  revealed: { ...phase(revealAt, endedAt), adminBytesByType: revealBytes, adminMessageCounts: admin.countByType },
  adminErrors: admin.errors, adminClosed: admin.closed,
  bystanderErrors: bystanders.flatMap((player) => player.errors).slice(0, 10),
  bystandersClosed: bystanders.filter((player) => player.closed).length,
  timeline
};
if (process.env.PROBE_OUTPUT) writeFileSync(process.env.PROBE_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, timeline: undefined }, null, 2));
process.exit(0);
