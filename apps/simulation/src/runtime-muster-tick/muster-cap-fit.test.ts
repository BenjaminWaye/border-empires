import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { musterCapLevelToFit, musterFlagCap } from "@border-empires/shared";
import { parseUpgradeMusterCapPayload } from "../runtime-command-parsers.js";

// The attack slider (March To, Launch Attack) goes up to the whole manpower
// pool, but a flag only ever stages up to its own cap. Committing more than
// that cap used to park the attack on a flag that could never fill
// ("Mustering 0/N" forever) -- these pin the flag expanding to fit instead.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 1_000_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// Three towns lift the manpower cap well clear of a fresh flag's cap, so
// there is room to expand into.
const buildRuntime = () =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } },
        { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } },
        { x: 14, y: 10, terrain: "LAND", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

let seq = 0;
const submit = async (runtime: SimulationRuntime, type: "SET_MUSTER" | "UPGRADE_MUSTER_CAP", payload: Record<string, unknown>) => {
  seq += 1;
  runtime.submitCommand({ commandId: `cmd-${seq}`, sessionId: "session-1", playerId: "player-1", clientSeq: seq, issuedAt: 1_000, type, payloadJson: JSON.stringify(payload) });
  await Promise.resolve();
};

const flag = (runtime: SimulationRuntime) => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === 10 && entry.y === 10);
  return tile?.musterJson ? (JSON.parse(tile.musterJson) as { capLevel?: number; commitManpower?: number }) : undefined;
};

const manpowerCapOf = (runtime: SimulationRuntime): number => runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpowerCap;

describe("musterCapLevelToFit", () => {
  it("returns the smallest level whose cap holds the amount, never lowering an existing level", () => {
    // cap 3000: share 300, base max(150, 300) = 300, so level n holds 300 + 300n.
    expect(musterCapLevelToFit(3_000, 0, 200)).toBe(0);
    expect(musterCapLevelToFit(3_000, 0, 301)).toBe(1);
    expect(musterCapLevelToFit(3_000, 0, 900)).toBe(2);
    expect(musterCapLevelToFit(3_000, 4, 200)).toBe(4);
    for (const required of [301, 450, 899, 900, 901, 2_999]) {
      const level = musterCapLevelToFit(3_000, 0, required);
      expect(musterFlagCap(3_000, level)).toBeGreaterThanOrEqual(required);
      expect(level === 0 || musterFlagCap(3_000, level - 1) < required).toBe(true);
    }
  });

  it("clamps an amount above the manpower cap to the cap itself", () => {
    const level = musterCapLevelToFit(1_000, 0, 50_000);
    expect(musterFlagCap(1_000, level)).toBe(1_000);
    expect(musterFlagCap(1_000, level - 1)).toBeLessThan(1_000);
  });
});

describe("muster flag capacity fits the committed manpower", () => {
  it("SET_MUSTER with a commitment above the flag's cap expands the flag to hold it", async () => {
    const runtime = buildRuntime();
    const manpowerCap = manpowerCapOf(runtime);
    const commit = Math.floor(manpowerCap * 0.45);
    expect(musterFlagCap(manpowerCap, 0)).toBeLessThan(commit);

    await submit(runtime, "SET_MUSTER", { x: 10, y: 10, mode: "MARCH", targetX: 14, targetY: 10, commitManpower: commit });

    const muster = flag(runtime)!;
    expect(muster.commitManpower).toBe(commit);
    expect(musterFlagCap(manpowerCap, muster.capLevel)).toBeGreaterThanOrEqual(commit);
  });

  it("SET_MUSTER without a bigger commitment leaves capacity alone, and keeps earlier Expand Capacity presses", async () => {
    const runtime = buildRuntime();
    await submit(runtime, "SET_MUSTER", { x: 10, y: 10, mode: "HOLD" });
    expect(flag(runtime)!.capLevel).toBeUndefined();

    await submit(runtime, "UPGRADE_MUSTER_CAP", { x: 10, y: 10 });
    await submit(runtime, "UPGRADE_MUSTER_CAP", { x: 10, y: 10 });
    // Switching mode used to rebuild the flag without capLevel, silently
    // throwing both presses away.
    await submit(runtime, "SET_MUSTER", { x: 10, y: 10, mode: "ADVANCE" });
    expect(flag(runtime)!.capLevel).toBe(2);
  });

  it("UPGRADE_MUSTER_CAP with fitManpower expands just far enough, and is a no-op once it fits", async () => {
    const runtime = buildRuntime();
    const manpowerCap = manpowerCapOf(runtime);
    await submit(runtime, "SET_MUSTER", { x: 10, y: 10, mode: "HOLD" });

    const required = Math.floor(manpowerCap * 0.62);
    await submit(runtime, "UPGRADE_MUSTER_CAP", { x: 10, y: 10, fitManpower: required });
    const level = flag(runtime)!.capLevel!;
    expect(level).toBe(musterCapLevelToFit(manpowerCap, 0, required));
    expect(musterFlagCap(manpowerCap, level)).toBeGreaterThanOrEqual(required);

    await submit(runtime, "UPGRADE_MUSTER_CAP", { x: 10, y: 10, fitManpower: Math.floor(required / 2) });
    expect(flag(runtime)!.capLevel).toBe(level);
  });
});

describe("parseUpgradeMusterCapPayload", () => {
  // Regression: a malformed fitManpower was silently dropped, so a "fit if
  // needed" request came out as an unconditional +1 Expand Capacity press.
  it("rejects a present-but-invalid fitManpower instead of treating it as a plain press", () => {
    for (const fitManpower of [0, -5, "900", null]) {
      expect(parseUpgradeMusterCapPayload(JSON.stringify({ x: 1, y: 2, fitManpower }))).toBeNull();
    }
    expect(parseUpgradeMusterCapPayload(JSON.stringify({ x: 1, y: 2, fitManpower: 900 }))).toEqual({ x: 1, y: 2, fitManpower: 900 });
    expect(parseUpgradeMusterCapPayload(JSON.stringify({ x: 1, y: 2 }))).toEqual({ x: 1, y: 2 });
  });
});
