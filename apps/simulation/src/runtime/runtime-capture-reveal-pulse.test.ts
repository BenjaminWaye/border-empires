import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { buildPlayer } from "./runtime.test-helpers.js";

// Coverage for the discovery-pulse reveal (runtime-expand-reveal-tick.ts):
// every successful capture — EXPAND onto neutral land or ATTACK onto enemy
// land — grants a temporary EXPAND_REVEAL_RADIUS (3) vision pulse around the
// newly-owned tile. A captured tile always lands as FRONTIER for the new
// owner, which carries only radius-0 (self-tile) standing vision, so a tile
// 3 rows beyond the capture becoming visible can only be explained by the
// pulse — neither the capturer's existing base-radius-1 territory nor the
// captured tile's own standing vision reaches that far.
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
  // defeating the "does the pulse leak vision" assertions below. Far enough
  // from both the target (10,11) and the probed tile (10,14) that its own
  // base-radius-1 vision can't overlap either.
  Object.assign(at(8, 7), { ownerId: "player-2", ownershipState: "SETTLED" });
  return tiles;
};

describe("simulation runtime — capture reveal pulse", () => {
  it("a successful ATTACK reveals a tile 3 rows beyond the captured tile, temporarily", async () => {
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

      // (10,14): dy=3 from the captured tile (10,11) — only the pulse
      // (radius 3) reaches it. Base territory (10,10) at radius 1 tops out
      // at y=11; the captured FRONTIER tile itself contributes radius 0.
      const pulsedTile = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 14);
      expect(pulsedTile).toBeDefined();

      // Past the pulse's 10s TTL, the tile drops out of live visibility again.
      // tickExpandReveals is driven externally by a setInterval in
      // simulation-service.ts (see runtime-expand-reveal-tick.ts), not by
      // anything internal to SimulationRuntime -- vi.advanceTimersByTime
      // alone doesn't process the expiry, so it has to be called directly.
      // now: () => 1_000 above is a fixed stub (not tied to the fake-timer
      // clock either), so the explicit nowMs argument here is what actually
      // pushes the pulse's tracked expiresAt (computed off that same fixed
      // 1_000) into the past.
      runtime.tickExpandReveals(1_000 + 10_000 + 100);
      const afterExpiry = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 14);
      expect(afterExpiry).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("a failed ATTACK does not grant a reveal pulse", async () => {
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

      const notPulsed = runtime.exportVisibleStateForPlayer("player-2").tiles.find((t) => t.x === 10 && t.y === 14);
      expect(notPulsed).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
