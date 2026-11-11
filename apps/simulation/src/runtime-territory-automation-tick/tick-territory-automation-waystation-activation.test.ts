/**
 * Regression test: a dormant waystation sitting next to a settled town used to
 * be free-claimed by tickTerritoryAutomation without ever activating, leaving it
 * "Dormant" under its owner forever (activation is one-shot and only the
 * lock-resolution and reach-auto-claim paths called it). The same tick now
 * activates it. The boot sweep must NOT activate an already-owned dormant
 * waystation: a restart used to erase activation (see snapshot-compaction.ts),
 * so the sweep re-rolled every owned waystation's reward on every deploy.
 */
import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { RANDOM_FOR } from "../runtime-waystation-activation.test-helpers.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";

const PLAYER_ID = "player-1";
const NOW_MS = 1_000_000;

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 1_000_000,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }
});

const landTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra });

const buildRuntime = (waystationOwnerId: string | undefined): SimulationRuntime => {
  const tiles: DomainTileState[] = [
    landTile(50, 50, {
      ownerId: PLAYER_ID,
      ownershipState: "SETTLED",
      town: { populationTier: "CITY", connectedTownBonus: 0, goldPerMinute: 5, cap: 2400, isFed: true, supportCurrent: 3, supportMax: 4 }
    })
  ];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const isWaystation = dx === 1 && dy === 0;
      tiles.push(
        landTile(50 + dx, 50 + dy, isWaystation ? { waystation: { activated: false }, ...(waystationOwnerId ? { ownerId: waystationOwnerId, ownershipState: "FRONTIER" as const } : {}) } : {})
      );
    }
  }
  const runtime = new SimulationRuntime({
    now: () => NOW_MS,
    initialPlayers: new Map([[PLAYER_ID, makePlayer(PLAYER_ID)]]),
    seedTiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])),
    seedDocks: []
  });
  runtime.exportPlayerDebugSnapshot(); // settle the one-time manpower cap grant
  const raw = (runtime as unknown as { state: { players: Map<string, { manpower: number }> } }).state.players.get(PLAYER_ID)!;
  raw.manpower = 1_000_000;
  return runtime;
};

const waystationAt = (runtime: SimulationRuntime) =>
  (runtime as unknown as { state: { tiles: Map<string, DomainTileState> } }).state.tiles.get("51,50")!;

describe("tickTerritoryAutomation waystation activation", () => {
  it("converts a resource waystation it auto-claims and streams the new site", () => {
    const runtime = buildRuntime(undefined);
    expect(waystationAt(runtime).waystation?.activated).toBe(false);
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));
    const random = vi.spyOn(Math, "random").mockReturnValue(RANDOM_FOR.RESOURCE_TILE);

    try {
      runtime.tickTerritoryAutomation(NOW_MS);
    } finally {
      random.mockRestore();
    }

    expect(waystationAt(runtime)).toMatchObject({
      ownerId: PLAYER_ID,
      resource: "FARM",
      waystation: { activated: true, activatedByPlayerId: PLAYER_ID, grantedEffect: "RESOURCE_TILE" }
    });
    expect(events.flatMap((event) => event.eventType === "TILE_DELTA_BATCH" ? event.tileDeltas : [])).toContainEqual(
      expect.objectContaining({ x: 51, y: 50, resource: "FARM", waystationJson: expect.stringContaining('"activated":true') })
    );
    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 51, y: 50, resource: "FARM" }));
  });

  it("does not re-roll an already-owned dormant waystation on the first tick (regression: +1000 manpower per deploy)", () => {
    const runtime = buildRuntime(PLAYER_ID);
    expect(waystationAt(runtime).waystation?.activated).toBe(false);

    runtime.tickTerritoryAutomation(NOW_MS);

    expect(waystationAt(runtime).waystation?.activated).toBe(false);
  });
});
