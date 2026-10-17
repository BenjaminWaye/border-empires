// First-day manpower simulation (opt-in, never in CI): runs the real
// SimulationRuntime on a virtual clock with the real season-20ai world and AI
// planner, plus freshly-joined humans driven by the same planner during
// "online" sessions, and writes a per-empire time series (manpower, cap,
// regen, towns, territory) as JSON. Run: `pnpm --filter
// @border-empires/simulation sim:first-day` with the SIM_* env knobs below
// (see docs/agents/topics/agent-gameplay-testing.md).
//
// Caveat: humans are driven by the AI planner, which can't do what a skilled
// human does when reach runs out (garrison a plain border tile, then build a
// beacon on it), so the sim humans play like novices. The AI empires are the
// "engaged player" reference.
//
// The Probe casts below read SimulationRuntime internals for measurement
// only; nothing is written through them except the landing-reserve variant override.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS, LANDING_MANPOWER_RESERVE } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { createAiCommandProducer } from "../ai/ai-command-producer.js";
import type { RuntimePlayer } from "../runtime-types.js";

type Task = { at: number; seq: number; task: () => void };
class VirtualClock {
  now: number;
  private queue: Task[] = [];
  private seq = 0;
  constructor(start: number) { this.now = start; }
  schedule(at: number, task: () => void): void {
    const entry = { at, seq: this.seq++, task };
    let i = this.queue.length;
    while (i > 0 && (this.queue[i - 1]!.at > at || (this.queue[i - 1]!.at === at && this.queue[i - 1]!.seq > entry.seq))) i -= 1;
    this.queue.splice(i, 0, entry);
  }
  async runUntil(target: number): Promise<void> {
    for (;;) {
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.now = Math.max(this.now, next.at);
      next.task();
      await Promise.resolve();
    }
    this.now = Math.max(this.now, target);
  }
}

type Probe = {
  state: { players: Map<string, RuntimePlayer> };
  playerManpowerCap(player: RuntimePlayer): number;
  playerManpowerRegenPerMinute(player: RuntimePlayer): number;
  effectiveManpowerAt(player: RuntimePlayer, at: number): number;
  summaryForPlayer(id: string): { ownedTownTierByTile: Map<string, string>; territoryTileKeys: Set<string>; settledTileKeys?: Set<string> };
};

const HOUR = 3_600_000;
const MIN = 60_000;
const yieldNow = async (): Promise<void> => {};
const SIM_HOURS = Number(process.env.SIM_HOURS ?? "1");
const LABEL = process.env.SIM_LABEL ?? "baseline";
const OUT = process.env.SIM_OUT ?? join(tmpdir(), `first-day-sim-${LABEL}.json`);
const HUMANS = Number(process.env.SIM_HUMANS ?? "3");
// Human online sessions (start minute, length minutes) -- a first session
// plus four return visits across the day.
const SESSIONS: Array<[number, number]> = JSON.parse(process.env.SIM_SESSIONS ?? "[[0,60],[240,20],[480,20],[720,20],[1380,20]]");

it("first-day sim", async () => {
  const startedAt = Date.now();
  const clock = new VirtualClock(Date.UTC(2026, 9, 1, 12));
  const runtime = new SimulationRuntime({
    seedProfile: "season-20ai",
    now: () => clock.now,
    scheduleSoon: (task) => clock.schedule(clock.now, task),
    scheduleAfter: (delay, task) => clock.schedule(clock.now + delay, task)
  });
  const probe = runtime as unknown as Probe;
  const aiIds = [...probe.state.players.values()].filter((p) => p.isAi).map((p) => p.id);
  const humanIds = Array.from({ length: HUMANS }, (_, i) => `sim-human-${i + 1}`);
  for (const id of humanIds) {
    runtime.ensurePlayerHasSpawnTerritory(id);
    runtime.ensurePlayerHasAfc(id);
    // A new player who answers the join prompt with every auto-garrison category on.
    probe.state.players.get(id)!.autoSettle = { ...DEFAULT_AUTO_SETTLE_PREFS };
  }
  const t0 = clock.now;
  // Variant control for the one-time landing reserve (landing-manpower-reserve.ts):
  // settle everyone once (grants the reserve), then SIM_LANDING_RESERVE=0
  // takes it back to compare against the old start.
  runtime.exportState();
  if (process.env.SIM_LANDING_RESERVE === "0") {
    for (const p of probe.state.players.values()) {
      if (p.id.startsWith("barbarian-")) continue;
      p.manpower = Math.min(probe.playerManpowerCap(p), Math.max(0, p.manpower - LANDING_MANPOWER_RESERVE));
      delete p.waystationManpowerOverflow;
    }
  }
  console.log(LABEL, "start manpower", JSON.stringify([humanIds[0]!, aiIds[0]!].map((id) => [id, Math.round(probe.state.players.get(id)!.manpower)])));
  console.log(LABEL, "world ready in", Date.now() - startedAt, "ms; ais", aiIds.length, "humans", humanIds.length);
  const spent = new Map<string, number>();
  const lastMp = new Map<string, number>();
  const countInto = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };
  const aiDiag = new Map<string, number>();
  const aiBump = (k: string) => countInto(aiDiag, k);
  const ai = createAiCommandProducer({
    runtime, aiPlayerIds: aiIds, submitCommand: async (c) => runtime.submitCommand(c), now: () => clock.now, tickIntervalMs: 250,
    onCommand: ({ commandType }) => aiBump(`cmd:${commandType}`),
    onRejectedCommand: ({ commandType, rejectionCode }) => aiBump(`rej:${commandType}:${rejectionCode}`),
    onNoCommand: (d) => aiBump(`none:${String(d.noCommandReason ?? "?")}`)
  });
  const diag = new Map<string, Map<string, number>>();
  const bump = (id: string, k: string) => { const m = diag.get(id) ?? new Map<string, number>(); countInto(m, k); diag.set(id, m); };
  const human = createAiCommandProducer({
    runtime, aiPlayerIds: humanIds, submitCommand: async (c) => runtime.submitCommand(c), now: () => clock.now, tickIntervalMs: 1_000,
    onCommand: ({ playerId, commandType }) => bump(playerId, `cmd:${commandType}`),
    onRejectedCommand: ({ playerId, commandType, rejectionCode }) => bump(playerId, `rej:${commandType}:${rejectionCode}`),
    onNoCommand: (d) => bump(d.playerId, `none:${String(d.noCommandReason ?? "?")}`)
  });
  const online = (): boolean => SESSIONS.some(([start, len]) => clock.now >= t0 + start * MIN && clock.now < t0 + (start + len) * MIN);
  const rows: Array<Record<string, number | string | boolean>> = [];
  const sample = () => {
    for (const id of [...humanIds, ...aiIds]) {
      const p = probe.state.players.get(id)!;
      const s = probe.summaryForPlayer(id);
      const mp = probe.effectiveManpowerAt(p, clock.now);
      rows.push({
        label: LABEL, id, ai: Boolean(p.isAi), minute: Math.round((clock.now - t0) / MIN),
        mp: Math.round(mp), cap: Math.round(probe.playerManpowerCap(p)), regen: Number(probe.playerManpowerRegenPerMinute(p).toFixed(3)),
        towns: s.ownedTownTierByTile.size, territory: s.territoryTileKeys.size, online: !p.isAi && online()
      });
    }
  };
  // Track manpower spend: any drop in spendable manpower between samples.
  const trackSpend = () => {
    for (const id of [...humanIds, ...aiIds]) {
      const p = probe.state.players.get(id)!;
      const mp = probe.effectiveManpowerAt(p, clock.now);
      const prev = lastMp.get(id);
      if (prev !== undefined && mp < prev) spent.set(id, (spent.get(id) ?? 0) + (prev - mp));
      lastMp.set(id, mp);
    }
  };
  sample();
  let nextAi = t0, nextHuman = t0, next30 = t0, next15 = t0, next60 = t0, nextSample = t0 + 5 * MIN, nextSpend = t0 + 5_000;
  while (clock.now < t0 + SIM_HOURS * HOUR) {
    const target = Math.min(nextAi, nextHuman, next30, next15, next60, nextSample, nextSpend);
    await clock.runUntil(target);
    const elapsedMin = (clock.now - t0) / MIN;
    const aiTick = elapsedMin < 120 ? 250 : 2_000;
    if (clock.now >= nextAi) { await ai.tick(); nextAi += aiTick; }
    if (clock.now >= nextHuman) { if (online()) await human.tick(); nextHuman += 1_000; }
    if (clock.now >= next15) { await runtime.applyPassiveIncomeAsync(clock.now, 24 * HOUR, yieldNow); next15 += 15_000; }
    if (clock.now >= next30) { await runtime.tickTerritoryAutomation(clock.now, yieldNow); next30 += 30_000; }
    if (clock.now >= next60) { runtime.tickPopulationGrowth(clock.now); await runtime.tickTileShedding(clock.now, yieldNow); next60 += 60_000; }
    if (clock.now >= nextSpend) { trackSpend(); nextSpend += 5_000; }
    if (clock.now >= nextSample) {
      sample();
      nextSample += 5 * MIN;
      if (Math.round(elapsedMin) % 60 === 0) {
        const h = humanIds.map((id) => rows.filter((r) => r.id === id).at(-1)!);
        console.log(LABEL, `t=${Math.round(elapsedMin)}m wall=${Math.round((Date.now() - startedAt) / 1000)}s`, h.map((r) => `${r.id}:mp${r.mp}/cap${r.cap} towns${r.towns}`).join(" | "));
      }
    }
  }
  for (const [id, m] of diag) console.log(LABEL, "diag", id, JSON.stringify([...m].sort((a, b) => b[1] - a[1]).slice(0, 8)));
  console.log(LABEL, "ai diag (all AIs)", JSON.stringify([...aiDiag].sort((a, b) => b[1] - a[1]).slice(0, 16)));
  ai.close(); human.close();
  writeFileSync(OUT, JSON.stringify({ label: LABEL, sessions: SESSIONS, spent: [...spent], rows }));
  console.log(LABEL, "done; wrote", OUT, "wall", Math.round((Date.now() - startedAt) / 1000), "s");
}, 12 * HOUR);
