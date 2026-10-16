import { describe, expect, it } from "vitest";
import {
  lastManpowerRefillAtMs,
  MANPOWER_REFILL_WINDOW_MS,
  STARTER_MANPOWER_BOOST_DURATION_MS,
  STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE
} from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildPlayer } from "./runtime.test-helpers.js";
import type { RuntimePlayer } from "../runtime-types.js";

const NOW = 40 * MANPOWER_REFILL_WINDOW_MS + 5_000_000;
const MINUTE = 60_000;

type Probe = { state: { players: Map<string, RuntimePlayer> }; playerManpowerRegenPerMinute(player: RuntimePlayer): number };

const runtimeWith = (now: () => number, players: RuntimePlayer[]): SimulationRuntime =>
  new SimulationRuntime({
    now,
    initialPlayers: new Map(players.map((player) => [player.id, player])),
    seedTiles: new Map(),
    initialState: { tiles: [], activeLocks: [] }
  });

const playerIn = (runtime: SimulationRuntime, id: string): RuntimePlayer => (runtime as unknown as Probe).state.players.get(id)!;
const regenOf = (runtime: SimulationRuntime, id: string): number =>
  (runtime as unknown as Probe).playerManpowerRegenPerMinute(playerIn(runtime, id));

// Playtest feedback: a new empire's first day was one ~20 minute burst and
// then a long wait. Every new empire -- human or AI, for fairness -- now
// regenerates faster for its first 24 hours.
describe("first-day manpower boost", () => {
  it("starts for every new empire, human and AI, at its first manpower settle", () => {
    const runtime = runtimeWith(() => NOW, [buildPlayer("human-1"), buildPlayer("ai-1", { isAi: true })]);
    runtime.exportState();
    for (const id of ["human-1", "ai-1"]) {
      expect(playerIn(runtime, id).starterManpowerBoost).toEqual({
        until: NOW + STARTER_MANPOWER_BOOST_DURATION_MS,
        regenPerMinute: STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE
      });
      expect(regenOf(runtime, id)).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE, 10);
    }
  });

  it("is never granted to an empire that already existed, or to barbarians", () => {
    const runtime = runtimeWith(() => NOW, [buildPlayer("veteran", { manpowerUpdatedAt: NOW - 3 * MINUTE }), buildPlayer("barbarian-1", { isAi: true })]);
    runtime.exportState();
    expect(playerIn(runtime, "veteran").starterManpowerBoost).toBeUndefined();
    expect(playerIn(runtime, "barbarian-1").starterManpowerBoost).toBeUndefined();
    expect(regenOf(runtime, "veteran")).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, 10);
  });

  it("ends after 24 hours", () => {
    let now = NOW;
    const runtime = runtimeWith(() => now, [buildPlayer("human-1")]);
    runtime.exportState();
    now = NOW + STARTER_MANPOWER_BOOST_DURATION_MS - MINUTE;
    expect(regenOf(runtime, "human-1")).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE, 10);
    now = NOW + STARTER_MANPOWER_BOOST_DURATION_MS;
    expect(regenOf(runtime, "human-1")).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, 10);
  });

  it("pays out through the normal refill window, at the boosted rate", () => {
    const boundary = lastManpowerRefillAtMs("human-1", NOW);
    let now = boundary + 1_000;
    const runtime = runtimeWith(() => now, [buildPlayer("human-1", { manpower: 0, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]);
    runtime.exportState(); // first settle: boost stamped, nothing paid yet
    now = boundary + MANPOWER_REFILL_WINDOW_MS + 1_000;
    const paid = runtime.exportState().players.find((player) => player.id === "human-1")?.manpower ?? 0;
    const windowMinutes = (MANPOWER_REFILL_WINDOW_MS - 1_000) / MINUTE;
    expect(paid).toBeCloseTo(
      Math.min(STARTING_CAPITAL_MANPOWER_CAP, (STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE) * windowMinutes),
      6
    );
  });

  it("survives a snapshot round trip, so a restart doesn't cancel it", () => {
    const runtime = runtimeWith(() => NOW, [buildPlayer("human-1")]);
    runtime.exportState();
    const recovered = createPlayersFromRecoveredState(runtime.exportSnapshotSections().initialState)?.get("human-1");
    expect(recovered?.starterManpowerBoost).toEqual({ until: NOW + STARTER_MANPOWER_BOOST_DURATION_MS, regenPerMinute: STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE });
  });
});
