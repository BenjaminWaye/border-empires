/**
 * Perf gate for the stale-client-origin dock-crossing fallback.
 *
 * findOwnedDockOriginForCrossing previously scanned every tile in the world
 * (~202k in prod) to find a dock tile the acting player owns, as a fallback
 * when the client submitted an origin tile it no longer owns (stale local
 * state, or a genuine dock-crossing attack). This runs inline inside
 * dispatchRuntimeCommand in the human_interactive lane, so it directly
 * blocked other players' commands for the duration of a full world scan.
 *
 * SCALE-INVARIANCE GATE (not an absolute-ms gate — wall-clock thresholds for
 * a few ms of work are noisy under GC/CI load, and a synthetic microbench
 * with flat tile objects is fast enough at prod-scale (~200k tiles) that
 * the gap alone is not a reliable signal — see git history for the
 * measurement). At 1000x world-size (2,000 vs 2,000,000 tiles) an O(world)
 * regression produces a clear, non-flaky double-digit-ms gap; an
 * own-territory lookup stays flat regardless of world size.
 */
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string, isAi = false) => ({
  id,
  isAi,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const staleDockCrossingDurationMs = async (bulkTileCount: number): Promise<number> => {
  const tiles: DomainTileState[] = [];
  for (let i = 0; i < bulkTileCount; i++) {
    tiles.push({ x: i, y: 9_000, terrain: "LAND", ownerId: "bulk-player", ownershipState: "SETTLED" });
  }
  // player-1's own (small) territory, including the dock tile the fallback
  // must find without scanning the bulk-player's tiles above.
  tiles.push(
    { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
    { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    // A stale-origin tile: exists, but is not owned by player-1 and is not
    // adjacent to the target — forces the adjacent-tile fallback to miss
    // and fall through to findOwnedDockOriginForCrossing.
    { x: 999, y: 999, terrain: "LAND" },
    { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
    { x: 51, y: 50, terrain: "LAND" }
  );

  const runtime = new SimulationRuntime({
    now: () => 1_000,
    seedTiles: new Map(),
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["bulk-player", makePlayer("bulk-player", true)]
    ]),
    initialState: {
      tiles,
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      activeLocks: []
    }
  });

  const seen: string[] = [];
  runtime.onEvent((event) => {
    seen.push(event.eventType);
  });

  runtime.submitCommand({
    commandId: "cmd-stale-dock-expand",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "EXPAND",
    // fromX/fromY is stale — the client thinks it owns (999,999), but it
    // doesn't. The runtime must recover via the dock-crossing fallback.
    payloadJson: JSON.stringify({ fromX: 999, fromY: 999, toX: 51, toY: 50 })
  });

  const startedAt = performance.now();
  await Promise.resolve();
  const durationMs = performance.now() - startedAt;

  expect(seen[0]).toBe("COMMAND_ACCEPTED");
  return durationMs;
};

describe("dock-crossing origin fallback perf gate", () => {
  it("resolves in roughly constant time regardless of world size (own-territory lookup, not a full world scan)", async () => {
    const smallDurationMs = await staleDockCrossingDurationMs(2_000);
    const largeDurationMs = await staleDockCrossingDurationMs(2_000_000);

    // A 1000x larger world must not cost meaningfully more: 8ms leaves
    // headroom for CI/GC noise while still catching a regression to a full
    // O(world) scan (measured ~15.5ms delta on the pre-fix implementation).
    expect(largeDurationMs).toBeLessThan(smallDurationMs + 8);
  });
});
