// Probe client for the stack started by launch-stack.mjs in which the humans
// play: each one sends real game commands on an interval (claim, attack,
// garrison, build, research, diplomacy), moves its viewport, and drops its
// connection and logs back in from time to time. Optionally one human is the
// fog admin and reveals the whole map. Appends one row to
// PROBE_DIR/play-timeline.jsonl every PROBE_SAMPLE_S seconds.
//
// The humans are simple bots, not players: they pick any legal-looking action
// from what their own session has been sent, and the server rejects the ones
// that are not legal. That is real command load, not real play.
//
// Env:
//   PROBE_DIR                 same directory launch-stack.mjs uses (required)
//   PROBE_HUMANS              humans to connect (default 40)
//   PROBE_DURATION_S          how long to run, in real seconds (default 600)
//   PROBE_SAMPLE_S            metrics sampling period, real seconds (default 30)
//   PROBE_ACT_INTERVAL_MS     game time between one human's commands (default 6000)
//   PROBE_RECONNECT_EVERY_S   game time between one human's reconnects (default 900; 0 = never)
//   PROBE_REVEAL_AFTER_S      real seconds until human 1, logged in as the fog admin,
//                             reveals the map (unset = nobody reveals)
//   PROBE_TAP_INTERVAL_MS     real time between tile-detail latency taps by 5 humans (default 5000)
//   PROBE_PORT_BASE           gateway port; metrics are on +2 (default 13101)
//
// "Game time" follows PROBE_DIR/clock.json when the stack runs on a scaled
// clock (clock-warp-preload.cjs), so humans keep the same pace per game minute.
import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { normalizeTile, tileKey } from "../rewrite-local-soak-candidates.mjs";

const require = createRequire(new URL("../../apps/realtime-gateway/package.json", import.meta.url));
const WebSocket = require("ws");

const probeDir = process.env.PROBE_DIR;
if (!probeDir) throw new Error("PROBE_DIR is required");
const portBase = Number(process.env.PROBE_PORT_BASE ?? 13101);
const wsUrl = `ws://127.0.0.1:${portBase}/ws`;
const simMetricsUrl = `http://127.0.0.1:${portBase + 2}/metrics`;
const gatewayMetricsUrl = `http://127.0.0.1:${portBase}/metrics`;
const humanCount = Number(process.env.PROBE_HUMANS ?? 40);
const durationS = Number(process.env.PROBE_DURATION_S ?? 600);
const sampleS = Number(process.env.PROBE_SAMPLE_S ?? 30);
const actIntervalMs = Number(process.env.PROBE_ACT_INTERVAL_MS ?? 6000);
const reconnectEveryS = Number(process.env.PROBE_RECONNECT_EVERY_S ?? 900);
const revealAfterS = process.env.PROBE_REVEAL_AFTER_S === undefined ? undefined : Number(process.env.PROBE_REVEAL_AFTER_S);
const tapIntervalMs = Number(process.env.PROBE_TAP_INTERVAL_MS ?? 5000);
const adminEmail = process.env.PROBE_ADMIN_EMAIL ?? "fog-admin@example.com";
const projectId = "border-empires-probe";
const privateKey = readFileSync(`${probeDir}/signing-key.pem`, "utf8");

const readClock = () => {
  try {
    const clock = JSON.parse(readFileSync(`${probeDir}/clock.json`, "utf8"));
    return { scale: clock.scale, now: clock.warpedMs + (Date.now() - clock.realMs) * clock.scale };
  } catch {
    return { scale: 1, now: Date.now() };
  }
};
const clockScale = readClock().scale;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenFor = (uid, email) => {
  const now = Math.floor(readClock().now / 1000);
  const body = `${b64({ alg: "RS256", kid: "probe", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: uid, user_id: uid,
    email, email_verified: true, name: uid, iat: now - 5, exp: now + 3600,
    firebase: { identities: { email: [email] }, sign_in_provider: "password" }
  })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const counters = { sent: {}, accepted: 0, queued: 0, errors: {}, errorSamples: {}, reconnects: 0, reconnectFailures: 0, unexpectedCloses: 0, loginMs: [] };
const bump = (bucket, key) => { bucket[key] = (bucket[key] ?? 0) + 1; };
const tapSamples = [];
const reveal = { requestedAt: undefined, endedAt: undefined, chunks: 0, bytes: 0, errors: [] };

const connect = (human) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  human.socket = socket;
  human.ready = false;
  const timer = setTimeout(() => { socket.terminate(); reject(new Error(`${human.uid}: no INIT within 120s`)); }, 120_000);
  socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token: tokenFor(human.uid, human.email) })));
  socket.on("error", (error) => bump(counters.errors, `socket:${String(error.code ?? error.message).slice(0, 40)}`));
  socket.on("close", () => {
    clearTimeout(timer);
    if (human.socket === socket && !human.closing) counters.unexpectedCloses += 1;
    if (human.socket === socket) human.ready = false;
  });
  socket.on("message", (raw) => {
    const text = raw.toString();
    human.bytes += text.length;
    const type = /"type":"([A-Z_]+)"/.exec(text.slice(0, 200))?.[1] ?? "UNKNOWN";
    if (type === "REVEAL_MAP_CHUNK") { reveal.chunks += 1; reveal.bytes += text.length; return; }
    if (type === "REVEAL_MAP_END") { reveal.endedAt = Date.now(); return; }
    if (type === "ACTION_ACCEPTED") { counters.accepted += 1; return; }
    if (type === "COMMAND_QUEUED") { counters.queued += 1; return; }
    if (type === "TILE_DELTA" && human.tapPendingAt !== undefined) {
      // The gateway answers a tap from its cache and then with the simulation's
      // fresh copy; the second answer is the full round trip a player feels.
      human.tapAnswers += 1;
      if (human.tapAnswers >= 2) { tapSamples.push({ at: Date.now(), ms: Date.now() - human.tapPendingAt }); human.tapPendingAt = undefined; }
      return;
    }
    if (type === "ERROR") {
      const message = JSON.parse(text);
      bump(counters.errors, message.code ?? "UNKNOWN");
      counters.errorSamples[message.code] ??= String(message.message).slice(0, 120);
      if (String(message.code).startsWith("REVEAL") || message.message === "reveal map unavailable") reveal.errors.push(message.code);
      return;
    }
    if (type === "REACH_UPDATE") {
      human.reach = new Set(JSON.parse(text).tileKeys ?? []);
      return;
    }
    if (type === "TECH_UPDATE") {
      const message = JSON.parse(text);
      if (Array.isArray(message.techChoices)) human.techChoices = message.techChoices.map((choice) => choice.id ?? choice);
      return;
    }
    if (type === "TILE_DELTA_BATCH" || type === "INIT") {
      const message = JSON.parse(text);
      for (const tile of message.initialState?.tiles ?? message.tiles ?? []) {
        const next = normalizeTile(tile);
        const key = tileKey(next.x, next.y);
        human.tiles.set(key, { ...(human.tiles.get(key) ?? {}), ...next, ...(tile.ownerId === null ? { ownerId: undefined, ownershipState: undefined } : {}) });
      }
      if (type !== "INIT") return;
      human.playerId = message.player?.id;
      human.home = message.player?.homeTile;
      human.techChoices = (message.techChoices ?? []).map((choice) => choice.id ?? choice);
      human.rivals = (message.leaderboard?.overall ?? []).filter((row) => row.id !== human.playerId).map((row) => ({ id: row.id, name: row.name }));
      if (message.needsSeasonJoin) socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
      clearTimeout(timer);
      counters.loginMs.push(Date.now() - startedAt);
      human.ready = true;
      resolve(human);
    }
  });
});

const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 320;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const send = (human, payload) => {
  if (!human.ready || human.socket.readyState !== 1) return;
  bump(counters.sent, payload.type);
  human.socket.send(JSON.stringify(payload));
};
const ownTiles = (human) => [...human.tiles.values()].filter((tile) => tile.ownerId === human.playerId);

// One command per call, rotating through what a player does. Frontier moves
// (claim, attack) are the most common; the rest keep the House developing.
const act = (human) => {
  human.turn += 1;
  const owned = ownTiles(human);
  if (owned.length === 0) return;
  const roll = human.turn % 12;
  if (roll === 3) {
    const frontier = owned.filter((tile) => tile.ownershipState === "FRONTIER");
    if (frontier.length > 0) { const tile = pick(frontier); return send(human, { type: "SETTLE", x: tile.x, y: tile.y }); }
  }
  if (roll === 5 && human.techChoices.length > 0) return send(human, { type: "CHOOSE_TECH", techId: pick(human.techChoices) });
  if (roll === 7) {
    const settled = owned.filter((tile) => tile.ownershipState === "SETTLED" && !tile.economicStructureType && !tile.townType);
    if (settled.length > 0) {
      const tile = pick(settled);
      const structureType = pick(["RELAY_BEACON", "RELAY_BEACON", "PALISADE", "HYDROGARDEN"]);
      return send(human, { type: "BUILD_ECONOMIC_STRUCTURE", x: tile.x, y: tile.y, structureType });
    }
  }
  if (roll === 9 && human.home) {
    const centre = pick(owned);
    return send(human, { type: "SUBSCRIBE_CHUNKS", cx: Math.floor(centre.x / 64), cy: Math.floor(centre.y / 64), radius: 1 });
  }
  if (roll === 11 && human.turn % 120 === 11 && human.rivals.length > 0) {
    const rival = pick(human.rivals);
    return send(human, Math.random() < 0.5
      ? { type: "TRUCE_REQUEST", targetPlayerName: rival.name, durationHours: 12 }
      : { type: "ALLIANCE_REQUEST", targetPlayerName: rival.name, targetPlayerId: rival.id });
  }
  // Claim free land inside the House's reach, or attack a neighbour's tile.
  // Reach is what the server last sent (REACH_UPDATE); attacks are not reach-gated.
  const candidates = [];
  for (const tile of owned) {
    for (const [dx, dy] of NEIGHBOURS) {
      const toX = (tile.x + dx + WORLD_WIDTH) % WORLD_WIDTH;
      const toY = (tile.y + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
      const key = tileKey(toX, toY);
      if (human.badTargets.has(key)) continue;
      const target = human.tiles.get(key);
      if (target && target.terrain && target.terrain !== "LAND") continue;
      if (target?.ownerId === human.playerId) continue;
      if (target?.ownerId) candidates.push({ type: "ATTACK", fromX: tile.x, fromY: tile.y, toX, toY });
      else if (human.reach.has(key)) candidates.push({ type: "EXPAND", fromX: tile.x, fromY: tile.y, toX, toY });
    }
  }
  if (candidates.length === 0) { human.badTargets.clear(); return; }
  // An attack needs manpower mustered at a flag on the border first.
  const attacks = candidates.filter((candidate) => candidate.type === "ATTACK");
  if (roll === 1 && attacks.length > 0) {
    const front = pick(attacks);
    return send(human, { type: "SET_MUSTER", x: front.fromX, y: front.fromY, mode: "ADVANCE", targetX: front.toX, targetY: front.toY });
  }
  const expands = candidates.filter((candidate) => candidate.type === "EXPAND");
  // Mostly claim while there is land to claim; attack one time in four.
  const next = pick(expands.length > 0 && Math.random() < 0.75 ? expands : candidates);
  // A target that is refused is not offered again until the list runs dry.
  human.badTargets.add(tileKey(next.toX, next.toY));
  human.clientSeq += 1;
  send(human, { ...next, clientSeq: human.clientSeq, commandId: `probe-${human.uid}-${Date.now()}-${human.clientSeq}` });
};

const reconnect = async (human) => {
  human.closing = true;
  human.socket.close();
  await sleep(1000 + Math.random() * 4000);
  human.closing = false;
  try {
    await connect(human);
    counters.reconnects += 1;
    if (human.revealer && reveal.requestedAt !== undefined) send(human, { type: "REQUEST_REVEAL_MAP" });
  } catch (error) {
    counters.reconnectFailures += 1;
    bump(counters.errors, `reconnect:${String(error.message).slice(0, 40)}`);
    setTimeout(() => void reconnect(human), 10_000);
  }
};

const SIM_NAMES = [
  "sim_heap_used_mb", "sim_heap_total_mb", "sim_checkpoint_rss_mb", "sim_checkpoint_export_ms", "sim_owned_tiles_total",
  "sim_max_empire_tiles", "sim_barbarian_tiles", "sim_event_loop_max_ms", "sim_event_loop_delay_ms", "sim_tick_duration_ms",
  "sim_ai_current_tick_interval_ms", "sim_ai_tick_throttled_total", "sim_cpu_percent", "sim_gc_pause_ms",
  "sim_writer_queue_depth", "sim_event_store_write_ms", "sim_replay_recorded_command_history", "sim_inmemory_persistence_events",
  "sim_ai_queue_backlog_ms", "sim_human_interactive_backlog_ms", "sim_snapshot_cache_bytes", "sim_snapshot_cache_entries"
];
const GATEWAY_NAMES = [
  "gateway_heap_used_mb", "gateway_heap_total_mb", "gateway_rss_mb", "gateway_ws_sessions", "gateway_event_loop_max_ms",
  "gateway_event_loop_delay_ms", "gateway_cpu_percent", "gateway_snapshot_cache_bytes", "gateway_snapshot_cache_entries",
  "gateway_command_submit_latency_ms", "gateway_websocket_disconnect_total"
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
const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

const humans = [];
for (let index = 0; index < humanCount; index += 1) {
  const uid = `probe-human-${index + 1}`;
  const revealer = index === 0 && revealAfterS !== undefined;
  const human = {
    uid, email: revealer ? adminEmail : `${uid}@example.com`, revealer, socket: undefined, ready: false, closing: false,
    bytes: 0, tiles: new Map(), playerId: undefined, home: undefined, techChoices: [], rivals: [], reach: new Set(), badTargets: new Set(),
    turn: Math.floor(Math.random() * 12), clientSeq: 0, tapPendingAt: undefined, tapAnswers: 0
  };
  humans.push(await connect(human));
}
console.log(`[late-probe] ${humans.length} humans connected, clock scale ${clockScale}`);

const realActMs = actIntervalMs / clockScale;
for (const human of humans) {
  setTimeout(() => setInterval(() => act(human), realActMs), Math.random() * realActMs);
  if (reconnectEveryS > 0 && !human.revealer) {
    const realReconnectMs = (reconnectEveryS * 1000) / clockScale;
    setTimeout(() => setInterval(() => void reconnect(human), realReconnectMs), Math.random() * realReconnectMs);
  }
}
for (const human of humans.slice(-5)) {
  setInterval(() => {
    if (!human.ready) return;
    if (human.tapPendingAt !== undefined && Date.now() - human.tapPendingAt < 15_000) return;
    if (human.tapPendingAt !== undefined) tapSamples.push({ at: Date.now(), ms: 15_000, timedOut: true });
    const own = ownTiles(human)[0];
    if (!own) return;
    human.tapPendingAt = Date.now();
    human.tapAnswers = 0;
    human.socket.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: own.x, y: own.y }));
  }, tapIntervalMs);
}
if (revealAfterS !== undefined) {
  setTimeout(() => { reveal.requestedAt = Date.now(); send(humans[0], { type: "REQUEST_REVEAL_MAP" }); }, revealAfterS * 1000);
}

const startedAt = Date.now();
let lastSampleAt = startedAt;
while (Date.now() - startedAt < durationS * 1000) {
  await sleep(sampleS * 1000);
  const taps = tapSamples.filter((sample) => sample.at >= lastSampleAt);
  lastSampleAt = Date.now();
  const tileCounts = humans.map((human) => ownTiles(human).length);
  appendFileSync(`${probeDir}/play-timeline.jsonl`, `${JSON.stringify({
    at: Date.now(),
    gameNow: Math.round(readClock().now),
    humansReady: humans.filter((human) => human.ready).length,
    humanTilesKnown: { min: Math.min(...tileCounts), median: percentile(tileCounts, 0.5), max: Math.max(...tileCounts) },
    bytesToHumans: humans.reduce((sum, human) => sum + human.bytes, 0),
    sent: { ...counters.sent }, accepted: counters.accepted, queued: counters.queued, errors: { ...counters.errors }, errorSamples: { ...counters.errorSamples },
    reconnects: counters.reconnects, reconnectFailures: counters.reconnectFailures, unexpectedCloses: counters.unexpectedCloses,
    loginMs: { p50: percentile(counters.loginMs, 0.5), p95: percentile(counters.loginMs, 0.95), max: Math.max(...counters.loginMs) },
    tap: { count: taps.length, timedOut: taps.filter((sample) => sample.timedOut).length, p50: percentile(taps.map((sample) => sample.ms), 0.5), p95: percentile(taps.map((sample) => sample.ms), 0.95), max: taps.length ? Math.max(...taps.map((sample) => sample.ms)) : null },
    reveal: { ...reveal, errors: reveal.errors.slice(0, 5) },
    sim: await scrape(simMetricsUrl, SIM_NAMES),
    gateway: await scrape(gatewayMetricsUrl, GATEWAY_NAMES)
  })}\n`);
}
console.log(JSON.stringify({ humans: humans.length, ready: humans.filter((human) => human.ready).length, counters: { ...counters, loginMs: undefined }, reveal }));
process.exit(0);
