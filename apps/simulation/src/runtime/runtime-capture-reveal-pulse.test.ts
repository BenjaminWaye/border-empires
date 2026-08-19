import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { buildPlayer } from "./runtime.test-helpers.js";

// Coverage for FRONTIER_STANDING_VISION_RADIUS (visibility-coverage-cache.ts):
// every FRONTIER tile — including one just captured via EXPAND or ATTACK —
// carries a flat, permanent +1 standing vision radius, replacing the old
// one-time discovery pulse (radius 3, 10s TTL) that snapped back to nothing
// once it expired. A tile 1 row beyond the capture becoming (and staying)
// visible can only be explained by the FRONTIER tile's own standing vision —
// neither the capturer's existing base-radius-1 territory nor a temporary
// pulse (removed) explains it.
type StripTile = {
  x: number;
  y: number;
  terrain: "LAND";
  ownerId?: string;
  ownershipState?: "SETTLED" | "FRONTIER";
  muster?: { ownerId: string; amount: number; mode: "HOLD" | "ADVANCE"; updatedAt: number };
};

// ATTACK is muster-gated (see runtime-muster-tick/muster-attack.test.ts):
// the origin tile needs a pre-staged manpower reservoir at least as large as
// the attack's manpower cost, rejected with INSUFFICIENT_MUSTER otherwise.
const ORIGIN_MUSTER_AMOUNT = 60;

const buildStrip = (): StripTile[] => {
  const tiles: StripTile[] = [];
  for (let x = 8; x <= 12; x += 1) {
    for (let y = 7; y <= 17; y += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  const at = (x: number, y: number): StripTile => tiles.find((tile) => tile.x === x && tile.y === y)!;
  Object.assign(at(10, 10), {
    ownerId: "player-2",
    ownershipState: "SETTLED",
    muster: { ownerId: "player-2", amount: ORIGIN_MUSTER_AMOUNT, mode: "HOLD", updatedAt: 1_000 }
  });
  Object.assign(at(10, 11), { ownerId: "player-1", ownershipState: "SETTLED" });
  // A second, far-away anchor tile for player-2: a failed ATTACK risks
  // counter-capture of the origin (per the README), and losing (10,10) as
  // player-2's only tile would eliminate + auto-respawn them elsewhere in
  // this small test world -- shifting their vision unpredictably and
  // defeating the "does the FRONTIER tile leak vision" assertions below.
  // Far enough from both the target (10,11) and the probed tile (10,12)
  // that its own base-radius-1 vision can't overlap either.
  Object.assign(at(8, 7), { ownerId: "player-2", ownershipState: "SETTLED" });
  return tiles;
};

describe("simulation runtime — FRONTIER standing vision", () => {
  it("a successful ATTACK grants the captured FRONTIER tile a permanent +1 standing vision radius, unaffected by time", async () => {
    vi.useFakeTimers();
    // randomValue=0 with a strong attacker guarantees attackerWon (winChance > 0).
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-2", buildPlayer("player-2", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1_000, defense: 1, income: 1, vision: 1 } })],
          ["player-1", buildPlayer("player-1", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1, defense: 1, income: 1, vision: 1 } })]
        ]),
        initialState: { tiles: buildStrip(), activeLocks: [] }
      });

      runtime.submitCommand({
        commandId: "human-attack-1",
        sessionId: "player-2",
        playerId: "player-2",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const captured = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 11);
      expect(captured?.ownerId).toBe("player-2");
      expect(captured?.ownershipState).toBe("FRONTIER");

      // (10,12): dy=1 from the captured tile (10,11) -- only the FRONTIER
      // tile's own standing vision (radius 1) reaches it. Base territory
      // (10,10) at radius 1 tops out at y=11.
      const nearbyTile = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 12);
      expect(nearbyTile).toBeDefined();

      // (10,13): dy=2 -- one tile past the FRONTIER standing radius, must
      // stay out of vision.
      const farTile = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 13);
      expect(farTile).toBeUndefined();

      // Unlike the old discovery pulse, this never expires -- advancing
      // time alone (no TTL to drive) leaves the FRONTIER tile's standing
      // vision exactly as it was.
      vi.advanceTimersByTime(60_000);
      const stillVisible = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 12);
      expect(stillVisible).toBeDefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("a failed ATTACK grants no vision at all around the (unchanged) target", async () => {
    vi.useFakeTimers();
    // randomValue=1 guarantees attackerWon=false whenever the defender has
    // any effective defense at all (winChance is always < 1 in that case).
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-2", buildPlayer("player-2", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1, defense: 1, income: 1, vision: 1 } })],
          ["player-1", buildPlayer("player-1", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1, defense: 1, income: 1, vision: 1 } })]
        ]),
        initialState: { tiles: buildStrip(), activeLocks: [] }
      });

      runtime.submitCommand({
        commandId: "human-attack-2",
        sessionId: "player-2",
        playerId: "player-2",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      // Ground-truth ownership check via the unfiltered export -- a failed
      // ATTACK can counter-capture the origin (per the README), which would
      // cost player-2 their only nearby vision source and drop (10,11) out
      // of their *visible* set even though it never changed hands. That's a
      // real, separate mechanic; querying fog-of-war-filtered state here
      // would conflate it with what this test actually cares about (whether
      // the capture happened).
      const targetTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(targetTile?.ownerId).toBe("player-1");

      const notVisible = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 12);
      expect(notVisible).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
