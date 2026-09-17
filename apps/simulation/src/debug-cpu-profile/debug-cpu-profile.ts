// On-demand V8 CPU profile of the simulation thread, served from the sim's
// loopback metrics server as /debug/cpu-profile (see process-bootstrap.ts).
//
// Why: the event_loop_blocked diagnostic only attributes time to work that
// was explicitly wrapped in the main-thread task tracker. In the 2026-09-17
// prod stall every multi-second block reported ~2ms of tracked tasks -- the
// other ~3s was invisible. A sampling profile is the only tool that names the
// actual hot frames without guessing which code path to instrument next.
//
// The raw .cpuprofile is written to /data (open it in Chrome DevTools >
// Performance > Load profile), and the response body carries a self-time
// top-N so the answer is readable straight from `flyctl ssh` without needing
// sftp -- which has been unreliable in practice for pulling files off the box.
//
// Overhead: V8's sampling profiler (~1ms interval) is cheap enough to run on a
// live box for a few seconds; it does NOT pause the loop the way a heap
// snapshot does. Still ops-only -- don't wire this into anything periodic.

import fs from "node:fs";
import path from "node:path";
import { Session, type Profiler } from "node:inspector";

export const DEFAULT_CPU_PROFILE_MS = 5_000;
export const MAX_CPU_PROFILE_MS = 60_000;
const TOP_N = 60;

export type CpuProfileHotFrame = {
  functionName: string;
  url: string;
  line: number;
  selfMs: number;
  selfPct: number;
};

export type CpuProfileSummary = {
  ok: true;
  durationMs: number;
  sampledMs: number;
  path: string;
  bytes: number;
  topSelf: CpuProfileHotFrame[];
};

const inspectorPost = <T>(session: Session, method: string, params?: object): Promise<T> =>
  new Promise((resolve, reject) => {
    session.post(method, params ?? {}, (err, result) => (err ? reject(err) : resolve(result as T)));
  });

/** Aggregates self time per function (name + url:line) from a V8 Profiler.Profile. */
export const summarizeCpuProfile = (profile: Profiler.Profile): { sampledMs: number; topSelf: CpuProfileHotFrame[] } => {
  const selfByNode = new Map<number, number>();
  const timeDeltas = profile.timeDeltas ?? [];
  const samples = profile.samples ?? [];
  let totalUs = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const dt = timeDeltas[i] ?? 0;
    totalUs += dt;
    const nodeId = samples[i];
    if (nodeId === undefined) continue;
    selfByNode.set(nodeId, (selfByNode.get(nodeId) ?? 0) + dt);
  }
  const byFrame = new Map<string, CpuProfileHotFrame>();
  for (const node of profile.nodes) {
    const selfUs = selfByNode.get(node.id) ?? 0;
    if (selfUs === 0) continue;
    const cf = node.callFrame;
    const key = `${cf.functionName}|${cf.url}|${cf.lineNumber}`;
    const existing = byFrame.get(key);
    if (existing) {
      existing.selfMs += selfUs / 1000;
    } else {
      byFrame.set(key, {
        functionName: cf.functionName || "(anonymous)",
        url: cf.url,
        line: cf.lineNumber + 1,
        selfMs: selfUs / 1000,
        selfPct: 0
      });
    }
  }
  const totalMs = totalUs / 1000;
  const topSelf = [...byFrame.values()]
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, TOP_N)
    .map((f) => ({ ...f, selfMs: Math.round(f.selfMs * 10) / 10, selfPct: totalMs > 0 ? Math.round((f.selfMs / totalMs) * 1000) / 10 : 0 }));
  return { sampledMs: Math.round(totalMs), topSelf };
};

/** Runs the sampling profiler on the calling thread for `durationMs`, writes
 * the raw profile under `outDir`, and returns a self-time summary. */
export const captureCpuProfile = async (durationMs: number, outDir = "/data"): Promise<CpuProfileSummary> => {
  const clampedMs = Math.max(250, Math.min(MAX_CPU_PROFILE_MS, Math.floor(durationMs)));
  const session = new Session();
  session.connect();
  try {
    await inspectorPost(session, "Profiler.enable");
    await inspectorPost(session, "Profiler.setSamplingInterval", { interval: 1000 });
    await inspectorPost(session, "Profiler.start");
    await new Promise((resolve) => setTimeout(resolve, clampedMs));
    const { profile } = await inspectorPost<{ profile: Profiler.Profile }>(session, "Profiler.stop");
    const outPath = path.join(outDir, `sim-${Date.now()}.cpuprofile`);
    fs.writeFileSync(outPath, JSON.stringify(profile));
    const { sampledMs, topSelf } = summarizeCpuProfile(profile);
    return { ok: true, durationMs: clampedMs, sampledMs, path: outPath, bytes: fs.statSync(outPath).size, topSelf };
  } finally {
    session.disconnect();
  }
};

/** Parses `?ms=` off a /debug/cpu-profile request URL. */
export const parseCpuProfileDurationMs = (url: string): number => {
  const match = /[?&]ms=(\d+)/.exec(url);
  return match ? Number(match[1]) : DEFAULT_CPU_PROFILE_MS;
};
