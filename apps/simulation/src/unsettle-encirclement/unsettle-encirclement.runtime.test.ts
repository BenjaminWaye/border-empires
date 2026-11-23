import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { player } from "../encirclement/encirclement-runtime.test-helpers.js";

// Regression: capturing a rival town pulls its settled neighbours into the
// captor's reach, which drops them to FRONTIER (the reach "unsettle"). Combat's
// encirclement pass only seeded from the captured tile and its 8 neighbours,
// so an unsettled tile two steps from the town -- wrapped in the captor's land
// and cut off from its owner -- stayed the loser's FRONTIER instead of falling
// to the captor.

type SeedTile = {
  x: number;
  y: number;
  terrain: "LAND";
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED";
  town?: { name?: string; type: "MARKET" | "FARMING"; populationTier: "SETTLEMENT" | "TOWN" };
  muster?: { ownerId: string; amount: number; mode: "HOLD"; updatedAt: number };
};

const settled = (x: number, y: number, ownerId: string): SeedTile => ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

const runTownCapture = async (tiles: SeedTile[]): Promise<SimulationRuntime> => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", player("player-1")],
      ["player-2", player("player-2")]
    ]),
    initialState: { tiles, activeLocks: [] }
  });
  runtime.submitCommand({
    commandId: "cmd-town-capture",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "ATTACK",
    payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 20, toY: 21 })
  });
  await Promise.resolve();
  vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
  return runtime;
};

const tileAt = (runtime: SimulationRuntime, x: number, y: number) =>
  runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y);

// player-1: a settlement at (20,19) supplying the attack origin (20,20).
// player-2: the target town (20,21), and a settled tile at (22,21) -- two
// steps east of the town, outside combat's seed ring -- that player-1's land
// already wraps on every side. Far land keeps player-2 alive.
const baseTiles = (aroundTarget: SeedTile[]): SeedTile[] => [
  { ...settled(20, 19, "player-1"), town: { type: "MARKET", populationTier: "SETTLEMENT" } },
  { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } },
  { ...settled(20, 21, "player-2"), town: { name: "Rival Town", type: "FARMING", populationTier: "TOWN" } },
  settled(22, 21, "player-2"),
  ...aroundTarget,
  { ...settled(60, 60, "player-2"), town: { type: "MARKET", populationTier: "SETTLEMENT" } }
];

describe("encirclement of tiles unsettled by a town capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("hands the captor a settled tile its capture unsettled and its land surrounds", async () => {
    const ring = [[21, 20], [22, 20], [23, 20], [21, 21], [23, 21], [21, 22], [22, 22], [23, 22]] as const;
    const runtime = await runTownCapture(baseTiles(ring.map(([x, y]) => settled(x, y, "player-1"))));

    expect(tileAt(runtime, 20, 21)?.ownerId).toBe("player-1");
    expect(tileAt(runtime, 22, 21)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
  });

  it("leaves an unsettled tile its owner when it still touches the owner's settled land", async () => {
    // (23,21) stays player-2's settled land outside player-1's reach-overtake,
    // so (22,21) keeps supply even if unsettled.
    const ring = [[21, 20], [22, 20], [23, 20], [21, 21], [21, 22], [22, 22], [23, 22]] as const;
    const runtime = await runTownCapture([
      ...baseTiles(ring.map(([x, y]) => settled(x, y, "player-1"))),
      settled(23, 21, "player-2"),
      settled(24, 21, "player-2"),
      { ...settled(25, 21, "player-2"), town: { type: "MARKET", populationTier: "SETTLEMENT" } }
    ]);

    expect(tileAt(runtime, 20, 21)?.ownerId).toBe("player-1");
    expect(tileAt(runtime, 22, 21)?.ownerId).toBe("player-2");
  });
});
