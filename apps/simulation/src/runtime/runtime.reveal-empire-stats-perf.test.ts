/**
 * Perf gate for REVEAL_EMPIRE_STATS.
 *
 * Two separate O(world-tiles) scans lived in this single command's path:
 *  1. buildRevealEmpireStats iterated `this.tiles.values()` — every tile in
 *     the world (~202k in prod) — to count one target player's own
 *     settled/frontier/town stats, even though that data is already tracked
 *     incrementally in the player's runtime summary.
 *  2. pickReadyOwnedObservatoryAny (required to even attempt the reveal —
 *     shared with several other ability commands) also scanned every world
 *     tile to find any owned, active, off-cooldown observatory, instead of
 *     the acting player's own territory. This was the larger of the two
 *     costs measured here.
 * This command runs in the human_interactive lane, so a full world scan on
 * every call directly added to the queue-drain time other human commands
 * were waiting behind.
 *
 * SCALE-INVARIANCE GATE (not an absolute-ms gate — wall-clock thresholds for
 * a few ms of work are noisy under GC/CI load, and a synthetic microbench
 * with flat tile objects is fast enough at prod-scale (~200k tiles) that
 * the gap alone is not a reliable signal — see git history for the
 * measurement). At 1000x world-size (2,000 vs 2,000,000 tiles) an O(world)
 * regression produces a clear, non-flaky double-digit-ms gap; a
 * summary-backed O(target-territory) lookup stays flat regardless of world
 * size, since it only touches the target player's own territory.
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
  allies: new Set<string>(),
  strategicResources: { CRYSTAL: 1_000 }
});

const revealEmpireStatsDurationMs = async (bulkTileCount: number): Promise<number> => {
  const tiles: DomainTileState[] = [];
  for (let i = 0; i < bulkTileCount; i++) {
    tiles.push({ x: i, y: 9_000, terrain: "LAND", ownerId: "bulk-player", ownershipState: "SETTLED" });
  }
  tiles.push(
    { x: 0, y: 0, terrain: "LAND", ownerId: "target-player", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
    { x: 1, y: 0, terrain: "LAND", ownerId: "target-player", ownershipState: "SETTLED" },
    { x: 2, y: 0, terrain: "LAND", ownerId: "target-player", ownershipState: "FRONTIER" },
    // Viewer needs a ready owned observatory to be allowed to reveal.
    { x: 10, y: 0, terrain: "LAND", ownerId: "viewer", ownershipState: "SETTLED", observatory: { ownerId: "viewer", status: "active" } }
  );

  const viewer = { ...makePlayer("viewer"), techIds: new Set<string>(["surveying"]) };
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["viewer", viewer],
      ["target-player", makePlayer("target-player")],
      ["bulk-player", makePlayer("bulk-player", true)]
    ]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });

  const playerMessages: Array<Record<string, unknown>> = [];
  runtime.onEvent((event) => {
    if (event.eventType === "PLAYER_MESSAGE") playerMessages.push(JSON.parse(event.payloadJson) as Record<string, unknown>);
  });

  runtime.submitCommand({
    commandId: "reveal-stats-perf",
    sessionId: "session-1",
    playerId: "viewer",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "REVEAL_EMPIRE_STATS",
    payloadJson: JSON.stringify({ targetPlayerId: "target-player" })
  });

  const startedAt = performance.now();
  await Promise.resolve();
  const durationMs = performance.now() - startedAt;

  expect(playerMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "REVEAL_EMPIRE_STATS_RESULT",
        stats: expect.objectContaining({
          playerId: "target-player",
          tiles: 3,
          settledTiles: 2,
          frontierTiles: 1,
          controlledTowns: 1
        })
      })
    ])
  );

  return durationMs;
};

describe("REVEAL_EMPIRE_STATS perf gate", () => {
  it("resolves in roughly constant time regardless of world size (summary-backed, not a full world scan)", async () => {
    const smallDurationMs = await revealEmpireStatsDurationMs(2_000);
    const largeDurationMs = await revealEmpireStatsDurationMs(2_000_000);

    // A 1000x larger world must not cost meaningfully more: 8ms leaves
    // headroom for CI/GC noise while still catching a regression to a full
    // O(world) scan (measured ~41ms delta on the pre-fix implementation).
    expect(largeDurationMs).toBeLessThan(smallDurationMs + 8);
  });
});
