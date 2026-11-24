// Summarises one probe run directory (stack.log, process-samples.jsonl,
// thread-heaps.jsonl, play-timeline.jsonl or timeline.jsonl) as JSON:
// checkpoint cadence and the memory seen at each checkpoint attempt, process
// memory and CPU per time bucket, and the play probe's figures.
//
// Usage: node summarize-run.mjs <run-dir> [bucket-minutes=10] [from-minute=0]
//
// Checkpoints are read from the simulation's own log lines. A checkpoint
// counts as "regular" when it was started with fewer pending events than
// SIMULATION_CHECKPOINT_FORCE_AFTER_EVENTS (4000), "forced" otherwise.
// "wouldDeferAtHeapMb" replays the heap watermark against the heap logged at
// every attempt, so other limits can be judged without another run.
import { existsSync, readFileSync } from "node:fs";

const [dir, bucketArg = "10", fromArg = "0"] = process.argv.slice(2);
if (!dir) throw new Error("usage: summarize-run.mjs <run-dir> [bucket-minutes] [from-minute]");
const bucketMs = Number(bucketArg) * 60_000;
const jsonl = (name) => existsSync(`${dir}/${name}`)
  ? readFileSync(`${dir}/${name}`, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const mb = (bytes) => Math.round(bytes / 1048576);
const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const avg = (values) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

// --- checkpoints, from stack.log -------------------------------------------
const phases = [];
let open;
for (const raw of existsSync(`${dir}/stack.log`) ? readFileSync(`${dir}/stack.log`, "utf8").split("\n") : []) {
  // Lines may carry an "HH:MM:SS " prefix or `docker logs -t`'s ISO timestamp.
  const stamped = /^(?:\d{4}-\d\d-\d\dT)?(\d\d:\d\d:\d\d)(?:\.\d+Z)? /.exec(raw);
  const stamp = stamped?.[1];
  const line = stamped ? raw.slice(stamped[0].length) : raw;
  const phase = /^\s+phase: '([a-z_]+)'/.exec(line)?.[1];
  if (phase) { open = { phase, stamp }; continue; }
  if (!open) continue;
  const field = /^\s+([A-Za-z]+): (\d+)/.exec(line);
  if (field) { open[field[1]] = Number(field[2]); continue; }
  if (/^\} simulation checkpoint (phase|deferred)/.test(line)) phases.push(open);
  open = undefined;
}
const attempts = phases.filter((entry) => entry.phase === "before_load" || entry.phase === "skipped_high_memory");
const started = phases.filter((entry) => entry.phase === "before_load");
const saved = phases.filter((entry) => entry.phase === "after_save");
const deferred = phases.filter((entry) => entry.phase === "skipped_high_memory");
const seconds = (stamp) => stamp.split(":").reduce((total, part) => total * 60 + Number(part), 0);
const gaps = [];
for (let index = 1; index < saved.length; index += 1) {
  if (!saved[index].stamp) break;
  gaps.push((seconds(saved[index].stamp) - seconds(saved[index - 1].stamp) + 86400) % 86400);
}
const eventGaps = [];
for (let index = 1; index < saved.length; index += 1) eventGaps.push(saved[index].lastAppliedEventId - saved[index - 1].lastAppliedEventId);
const checkpoints = {
  saved: saved.length,
  startedRegular: started.filter((entry) => entry.pendingEvents < 4000).length,
  startedForced: started.filter((entry) => entry.pendingEvents >= 4000).length,
  deferredForMemory: deferred.length,
  lastEventId: saved.at(-1)?.lastAppliedEventId ?? null,
  eventsBetweenSaves: { p50: percentile(eventGaps, 0.5), p95: percentile(eventGaps, 0.95), max: eventGaps.length ? Math.max(...eventGaps) : null },
  secondsBetweenSaves: { p50: percentile(gaps, 0.5), p95: percentile(gaps, 0.95), max: gaps.length ? Math.max(...gaps) : null },
  atAttempt: {
    rssMb: { p50: mb(percentile(attempts.map((entry) => entry.rssBytes), 0.5) ?? 0), max: mb(Math.max(0, ...attempts.map((entry) => entry.rssBytes))) },
    heapUsedMb: { p50: mb(percentile(attempts.map((entry) => entry.heapUsedBytes), 0.5) ?? 0), p95: mb(percentile(attempts.map((entry) => entry.heapUsedBytes), 0.95) ?? 0), max: mb(Math.max(0, ...attempts.map((entry) => entry.heapUsedBytes))) }
  },
  wouldDeferAtHeapMb: Object.fromEntries([480, 520, 560, 600, 640, 680, 720].map((limit) => [limit, attempts.filter((entry) => mb(entry.heapUsedBytes) >= limit).length])),
  wouldDeferAtRssMb: Object.fromEntries([700, 1000, 1250, 1500].map((limit) => [limit, attempts.filter((entry) => mb(entry.rssBytes) >= limit).length])),
  gracefulStop: /graceful stop.*ms=(\d+)/.exec(existsSync(`${dir}/stack.log`) ? readFileSync(`${dir}/stack.log`, "utf8") : "")?.[1] ?? null
};

// --- per-bucket series ------------------------------------------------------
const samples = jsonl("process-samples.jsonl");
const heaps = jsonl("thread-heaps.jsonl");
// On a scaled clock (clock-warp-preload.cjs) the stack stamps its samples in
// game time, so the play probe's rows are placed by game time too, every
// bucket is game minutes, and CPU (real CPU time over game time) is scaled back.
const clockScale = existsSync(`${dir}/clock.json`) ? JSON.parse(readFileSync(`${dir}/clock.json`, "utf8")).scale : 1;
const play = jsonl("play-timeline.jsonl").concat(jsonl("timeline.jsonl")).map((row) => ({ ...row, at: row.gameNow ?? row.at }));
const startAt = (samples[0]?.at ?? play[0]?.at ?? 0) + Number(fromArg) * 60_000;
// Thread 1 is the simulation worker (see thread-names.jsonl).
const simHeaps = heaps.filter((row) => row.threadId === 1);
const otherHeapsAt = new Map();
for (const row of heaps) {
  if (row.threadId === 1) continue;
  const key = Math.floor(row.at / 10_000);
  otherHeapsAt.set(key, (otherHeapsAt.get(key) ?? 0) + row.usedMb);
}
const buckets = [];
const endAt = Math.max(samples.at(-1)?.at ?? 0, play.at(-1)?.at ?? 0);
for (let from = startAt; from < endAt; from += bucketMs) {
  const within = (row) => row.at >= from && row.at < from + bucketMs;
  const rss = samples.filter(within).map((row) => row.rssMb);
  const cpu = samples.filter(within).map((row) => row.processCpuPct * clockScale);
  const sim = simHeaps.filter(within).map((row) => row.usedMb);
  const rows = play.filter(within);
  const last = rows.at(-1);
  const metric = (name) => rows.map((row) => row.sim?.[name]).filter((value) => typeof value === "number");
  buckets.push({
    minute: Math.round((from - startAt) / 60_000) + Number(fromArg),
    gameHours: last?.gameNow && play[0]?.gameNow ? +((last.gameNow - play[0].gameNow) / 3_600_000).toFixed(1) : undefined,
    rssMb: { avg: avg(rss), max: rss.length ? Math.max(...rss) : null },
    simHeapUsedMb: { avg: avg(sim), min: sim.length ? Math.round(Math.min(...sim)) : null, max: sim.length ? Math.round(Math.max(...sim)) : null },
    cpuPctOfOneCore: { avg: avg(cpu), p95: percentile(cpu, 0.95), max: cpu.length ? Math.max(...cpu) : null },
    gatewayLoopMaxMs: Math.max(0, ...samples.filter(within).map((row) => row.gatewayLoopMaxMs)),
    ownedTiles: last?.sim?.sim_owned_tiles_total,
    maxEmpireTiles: last?.sim?.sim_max_empire_tiles,
    simLoopDelayP95Ms: percentile(metric('sim_event_loop_delay_ms{quantile="p95"}'), 0.5),
    simLoopMaxMs: metric("sim_event_loop_max_ms").length ? Math.max(...metric("sim_event_loop_max_ms")) : null,
    aiTickP95Ms: percentile(metric('sim_tick_duration_ms{source="ai",quantile="p95"}'), 0.5),
    aiTickIntervalMs: percentile(metric("sim_ai_current_tick_interval_ms"), 0.5),
    checkpointExportP95Ms: percentile(metric('sim_checkpoint_export_ms{quantile="p95"}'), 0.5),
    tapP95Ms: percentile(rows.map((row) => row.tap?.p95).filter((value) => typeof value === "number"), 0.5),
    tapMaxMs: Math.max(0, ...rows.map((row) => row.tap?.max ?? 0)),
    humansReady: last?.humansReady ?? last?.humans,
    accepted: last?.accepted,
    reconnects: last?.reconnects
  });
}
const lastPlay = play.at(-1);
console.log(JSON.stringify({
  dir,
  clockScale,
  minutes: Math.round((endAt - startAt) / 60_000),
  checkpoints,
  otherThreadsHeapMb: { p50: Math.round(percentile([...otherHeapsAt.values()], 0.5) ?? 0), max: Math.round(Math.max(0, ...otherHeapsAt.values())) },
  final: lastPlay ? { sent: lastPlay.sent, accepted: lastPlay.accepted, errors: lastPlay.errors, reconnects: lastPlay.reconnects, reconnectFailures: lastPlay.reconnectFailures, unexpectedCloses: lastPlay.unexpectedCloses, loginMs: lastPlay.loginMs, reveal: lastPlay.reveal, humanTilesKnown: lastPlay.humanTilesKnown } : undefined,
  buckets
}, null, 1));
