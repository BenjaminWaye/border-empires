/**
 * Unit tests for frontier-tile index correctness (frontier decay mechanic removed in PR #623).
 * The updateFrontierDecay function was removed; tests that covered it are deleted.
 * Retained: activeFortAnchorsByOwner and frontierTilesByOwner index correctness.
 */
import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { DomainTileState } from "@border-empires/game-domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePlayer = (id: string, points = 10_000_000, manpower = 1_000) => ({
  id,
  isAi: false,
  points,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const landTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND" as const,
  ...extra
});

// ---------------------------------------------------------------------------
// Unit tests: activeFortAnchorsByOwner correctness
// ---------------------------------------------------------------------------

describe("activeFortAnchorsByOwner index correctness", () => {
  it("fort tiles are NOT registered in activeFortAnchorsByOwner", () => {
    const NOW_MS = 1_000_000;

    const runtime = new SimulationRuntime({
      now: () => NOW_MS,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      seedTiles: new Map([
        ["10,10", landTile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", fort: { ownerId: "p1", status: "active" } })]
      ])
    });

    const anchorsMap = (runtime as unknown as { activeFortAnchorsByOwner: Map<string, Map<string, number>> }).activeFortAnchorsByOwner;

    // Forts no longer register as anchors — only towns do
    expect(anchorsMap.get("p1")?.has("10,10")).toBeFalsy();
  });

  it("frontierTilesByOwner index stays correct across replaceTileState calls", () => {
    const NOW_MS = 1_000_000;

    const runtime = new SimulationRuntime({
      now: () => NOW_MS,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      seedTiles: new Map([
        ["5,5", landTile(5, 5, { ownerId: "p1", ownershipState: "FRONTIER" })]
      ])
    });

    const frontierMap = (runtime as unknown as { frontierTilesByOwner: Map<string, Set<string>> }).frontierTilesByOwner;

    // Initial: p1 has 1 frontier tile
    expect(frontierMap.get("p1")?.has("5,5")).toBe(true);

    // Settle the tile → remove from frontier index
    const rts = (runtime as unknown as { replaceTileState: (k: string, t: DomainTileState, c?: string) => void }).replaceTileState;
    rts.call(runtime, "5,5", landTile(5, 5, { ownerId: "p1", ownershipState: "SETTLED" }), "test-settle");

    expect(frontierMap.get("p1")?.has("5,5")).toBeFalsy();

    // Re-frontier it
    rts.call(runtime, "5,5", landTile(5, 5, { ownerId: "p1", ownershipState: "FRONTIER" }), "test-refrontier");
    expect(frontierMap.get("p1")?.has("5,5")).toBe(true);

    // Expire it (no owner)
    rts.call(runtime, "5,5", landTile(5, 5), "test-expire");
    expect(frontierMap.get("p1")?.has("5,5")).toBeFalsy();
  });
});
