// Measures whether taking a backup snapshot of the live database stalls the
// game. Run it against the stack started by run-stack-in-image.sh (ideally with
// humans playing, see soak.sh): it records a quiet baseline, then runs the
// snapshot step of deploy/bin/backup inside the container -- the way the hourly
// timer does in production -- several times, and compares the windows.
// Local measurement only; it touches no live environment.
//
// Usage: node scripts/sector-memory-probe/backup-stall-probe.mjs <run-dir> [method]
//   run-dir  the PROBE_DIR of the running stack (holds be.db and stack.log)
//   method   "paced" (default): deploy/bin/backup-snapshot.mjs, what deploy/bin/backup
//            runs; "vacuum-into": the old single-statement VACUUM INTO, for comparison
// Env:
//   PROBE_NAME         container name (default be-probe-<port>)
//   PROBE_PORT_BASE    gateway port; sim metrics are on +2 (default 13101)
//   BACKUP_PROBE_RUNS  snapshots to take (default 5)
//   BACKUP_PROBE_GAP_S quiet seconds before the first and after each snapshot (default 60)
//   BACKUP_PROBE_ARGS  extra flags for backup-snapshot.mjs, e.g. "--rate-mb=32 --check"
//   BACKUP_PROBE_PARALLEL  snapshots started at once each time (default 1; 2 reproduces the
//                      overlapping timer + manual run of 2026-10-02)
//   BACKUP_PROBE_MAX_STALL_MS  exit 1 if a snapshot window's worst stall exceeds this
//                      (default 1000; the watchdog kills at 30000)
//
// What it measures, per window (baseline, each snapshot, the minute after it):
//   - /healthz latency, polled every 250 ms: a stall of the gateway main thread,
//     which is what the 30 s watchdog sees
//   - the simulation thread's event-loop max and AI tick p99 (scraped every second)
//   - the WAL file's peak size (a long read transaction stops checkpoints from
//     recycling it) and the [sqlite-snapshot-store] slow checkpoint / event_loop_blocked
//     lines the stack logged during the window
// Writes <run-dir>/backup-stall-probe-<method>-x<parallel>.json and prints a summary.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const runDir = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(path.join(runDir, "be.db"))) {
  console.error("usage: backup-stall-probe.mjs <run-dir> [method]  (run-dir must hold be.db)");
  process.exit(2);
}
const method = process.argv[3] ?? "paced";
const portBase = Number(process.env.PROBE_PORT_BASE ?? 13101);
const container = process.env.PROBE_NAME ?? `be-probe-${portBase}`;
const runs = Number(process.env.BACKUP_PROBE_RUNS ?? 5);
const gapS = Number(process.env.BACKUP_PROBE_GAP_S ?? 60);
const parallel = Number(process.env.BACKUP_PROBE_PARALLEL ?? 1);
const maxStallMs = Number(process.env.BACKUP_PROBE_MAX_STALL_MS ?? 1000);
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const dbPath = path.join(runDir, "be.db");
const walPath = `${dbPath}-wal`;

const samples = [];
const record = (kind, value) => samples.push({ at: Date.now(), kind, value });
let sampling = true;

const pollHealth = async () => {
  while (sampling) {
    const t0 = performance.now();
    try {
      const res = await fetch(`http://127.0.0.1:${portBase}/healthz`, { signal: AbortSignal.timeout(60_000) });
      await res.arrayBuffer();
      record("healthzMs", performance.now() - t0);
    } catch {
      record("healthzMs", performance.now() - t0);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

const metric = (text, name) => {
  const line = text.split("\n").find((l) => l.startsWith(name + " ") || l.startsWith(name + "{"));
  return line ? Number(line.slice(line.lastIndexOf(" ") + 1)) : undefined;
};

const pollMetrics = async () => {
  while (sampling) {
    try {
      const text = await (await fetch(`http://127.0.0.1:${portBase + 2}/metrics`, { signal: AbortSignal.timeout(30_000) })).text();
      record("simLoopMaxMs", metric(text, "sim_event_loop_max_ms"));
      record("aiTickP99Ms", metric(text, 'sim_tick_duration_ms{source="ai",quantile="p99"}'));
    } catch {
      // the scrape itself stalling shows up in the healthz series
    }
    try {
      record("walBytes", existsSync(walPath) ? statSync(walPath).size : 0);
    } catch {
      // WAL can vanish between exists and stat
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

const sleep = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

const runSnapshot = (out) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const args =
      method === "vacuum-into"
        ? ["exec", "-e", "NODE_OPTIONS=", container, "nice", "-n", "19", "node", "-e",
            `new (require("node:sqlite").DatabaseSync)(${JSON.stringify(dbPath)}).exec("VACUUM INTO '${out}'")`]
        : ["exec", "-e", "NODE_OPTIONS=", container, "nice", "-n", "19", "node",
            path.join(repoRoot, "deploy/bin/backup-snapshot.mjs"), dbPath, `${out}.zst`,
            ...(process.env.BACKUP_PROBE_ARGS ?? "").split(" ").filter(Boolean)];
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, ms: Date.now() - t0, output: output.trim().split("\n").slice(-3).join(" | ") }));
  });

const stackLogLines = () => {
  const file = path.join(runDir, "stack.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => /slow checkpoint phase|event_loop_blocked|watchdog/.test(l))
    .map((l) => ({ at: Date.parse(l.slice(0, 30)), line: l.slice(31, 260) }))
    .filter((l) => Number.isFinite(l.at));
};

const summarize = (label, from, to) => {
  const pick = (kind) => samples.filter((s) => s.kind === kind && s.at >= from && s.at <= to && s.value !== undefined).map((s) => s.value);
  const max = (xs) => (xs.length ? Math.round(Math.max(...xs)) : null);
  const p99 = (xs) => (xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.99))]) : null);
  const health = pick("healthzMs");
  return {
    label,
    seconds: Math.round((to - from) / 1000),
    healthzMaxMs: max(health),
    healthzP99Ms: p99(health),
    simLoopMaxMs: max(pick("simLoopMaxMs")),
    aiTickP99MaxMs: max(pick("aiTickP99Ms")),
    walPeakMb: Math.round((max(pick("walBytes")) ?? 0) / 1048576),
    stackLog: stackLogLines().filter((l) => l.at >= from && l.at <= to).map((l) => l.line)
  };
};

const healthLoop = pollHealth();
const metricsLoop = pollMetrics();
const windows = [];
let t = Date.now();
await sleep(gapS);
windows.push(summarize("baseline", t, Date.now()));
for (let i = 1; i <= runs; i += 1) {
  const outs = Array.from({ length: parallel }, (_, j) => path.join(runDir, `backup-probe-${i}-${j}.db`));
  t = Date.now();
  const results = await Promise.all(outs.map((out) => runSnapshot(out)));
  const result = { code: Math.max(...results.map((r) => r.code ?? 1)), ms: Math.max(...results.map((r) => r.ms)), output: results.map((r) => r.output).join(" || ") };
  windows.push({ ...summarize(`snapshot ${i}`, t, Date.now()), exitCode: result.code, snapshotMs: result.ms, output: result.output });
  for (const out of outs) for (const file of [out, `${out}.zst`]) rmSync(file, { force: true });
  t = Date.now();
  await sleep(gapS);
  windows.push(summarize(`after ${i}`, t, Date.now()));
}
sampling = false;
await Promise.all([healthLoop, metricsLoop]);

const snapshotWindows = windows.filter((w) => w.label.startsWith("snapshot") || w.label.startsWith("after"));
const worst = Math.max(...snapshotWindows.map((w) => Math.max(w.healthzMaxMs ?? 0, w.simLoopMaxMs ?? 0)));
const report = { method, container, runs, parallel, gapS, dbMb: Math.round(statSync(dbPath).size / 1048576), worstStallMs: worst, windows };
writeFileSync(path.join(runDir, `backup-stall-probe-${method}-x${parallel}.json`), JSON.stringify(report, null, 2));
console.log(`method=${method} db=${report.dbMb}MB worst stall during/after snapshots=${worst}ms (limit ${maxStallMs}ms)`);
for (const w of windows) {
  console.log(
    `${w.label.padEnd(11)} ${String(w.seconds).padStart(4)}s healthz max ${w.healthzMaxMs}ms p99 ${w.healthzP99Ms}ms | sim loop max ${w.simLoopMaxMs}ms | ai tick p99 ${w.aiTickP99MaxMs}ms | wal ${w.walPeakMb}MB` +
      (w.snapshotMs !== undefined ? ` | snapshot ${w.snapshotMs}ms exit ${w.exitCode}` : "") +
      (w.stackLog.length ? `\n            log: ${w.stackLog.slice(0, 3).join("\n                 ")}` : "")
  );
}
process.exit(worst > maxStallMs ? 1 : 0);
