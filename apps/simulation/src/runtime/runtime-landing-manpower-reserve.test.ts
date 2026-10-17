import { describe, expect, it } from "vitest";
import { LANDING_MANPOWER_RESERVE, lastManpowerRefillAtMs, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildPlayer } from "./runtime.test-helpers.js";
import type { RuntimePlayer } from "../runtime-types.js";

const NOW = 40 * MANPOWER_REFILL_WINDOW_MS + 5_000_000;
const MINUTE = 60_000;

const runtimeWith = (now: () => number, players: RuntimePlayer[]): SimulationRuntime =>
  new SimulationRuntime({
    now,
    initialPlayers: new Map(players.map((player) => [player.id, player])),
    seedTiles: new Map(),
    initialState: { tiles: [], activeLocks: [] }
  });

const manpowerOf = (runtime: SimulationRuntime, id: string): number => runtime.exportState().players.find((player) => player.id === id)?.manpower ?? Number.NaN;

// Playtest: a new player who spends freely ran out within ~15-20 minutes, and
// a regen boost can't help the first session (regen pays out once per 4-hour
// window). Every new empire -- human or AI, for fairness -- lands with a
// one-time manpower reserve on top of its start, allowed above the cap.
describe("landing manpower reserve", () => {
  it("is granted once to every new empire, human and AI, on top of its starting manpower and above the cap", () => {
    const runtime = runtimeWith(() => NOW, [
      buildPlayer("human-1", { manpower: 720, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP }),
      buildPlayer("ai-1", { isAi: true, manpower: 720, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })
    ]);
    expect(manpowerOf(runtime, "human-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
    expect(manpowerOf(runtime, "ai-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
    expect(manpowerOf(runtime, "human-1")).toBeGreaterThan(STARTING_CAPITAL_MANPOWER_CAP);
    // Later settles don't grant it again.
    expect(manpowerOf(runtime, "human-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
  });

  it("is granted on top of a full cap when a new empire's manpower was never set", () => {
    const runtime = runtimeWith(() => NOW, [buildPlayer("human-1", { manpower: Number.NaN })]);
    const probe = runtime as unknown as { playerManpowerCap(player: RuntimePlayer): number; state: { players: Map<string, RuntimePlayer> } };
    const cap = probe.playerManpowerCap(probe.state.players.get("human-1")!);
    expect(manpowerOf(runtime, "human-1")).toBe(cap + LANDING_MANPOWER_RESERVE);
    expect(manpowerOf(runtime, "human-1")).toBe(cap + LANDING_MANPOWER_RESERVE);
  });

  it("is never granted to an empire that already existed, or to barbarians", () => {
    const runtime = runtimeWith(() => NOW, [
      buildPlayer("veteran", { manpower: 300, manpowerUpdatedAt: NOW - 3 * MINUTE, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP }),
      buildPlayer("barbarian-1", { isAi: true, manpower: 50 })
    ]);
    expect(manpowerOf(runtime, "veteran")).toBe(300);
    expect(manpowerOf(runtime, "barbarian-1")).toBe(50);
  });

  it("doesn't change regen, and regen pauses while the reserve keeps manpower above the cap", () => {
    const boundary = lastManpowerRefillAtMs("human-1", NOW);
    let now = boundary + 1_000;
    const runtime = runtimeWith(() => now, [buildPlayer("human-1", { manpower: 720, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]);
    expect(manpowerOf(runtime, "human-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
    now = boundary + MANPOWER_REFILL_WINDOW_MS + 1_000; // a full refill window later, nothing spent
    expect(manpowerOf(runtime, "human-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
    const regen = (runtime as unknown as { playerManpowerRegenPerMinute(player: RuntimePlayer): number; state: { players: Map<string, RuntimePlayer> } });
    expect(regen.playerManpowerRegenPerMinute(regen.state.players.get("human-1")!)).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, 10);
  });

  it("survives a snapshot round trip without being granted a second time", () => {
    const runtime = runtimeWith(() => NOW, [buildPlayer("human-1", { manpower: 720, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]);
    runtime.exportState();
    const recovered = createPlayersFromRecoveredState(runtime.exportSnapshotSections().initialState)?.get("human-1");
    expect(recovered?.manpower).toBe(720 + LANDING_MANPOWER_RESERVE);
    expect(recovered?.manpowerUpdatedAt).toBe(NOW);
    const restarted = runtimeWith(() => NOW + MINUTE, [recovered!]);
    expect(manpowerOf(restarted, "human-1")).toBe(720 + LANDING_MANPOWER_RESERVE);
  });
});
