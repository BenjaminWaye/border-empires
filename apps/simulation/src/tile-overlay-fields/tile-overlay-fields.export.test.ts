import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { TILE_OVERLAY_WIRE_FIELDS } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

// Regression: the full-world export (exportState / exportStateAsync -- what a
// season-ended or spectator full-visibility login is built from) hand-listed
// overlay fields and left out watchtowerJson and waystationJson, so watchtowers
// and waystations vanished from the map in that view.
const loadedTile: DomainTileState = {
  x: 20,
  y: 20,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  shardSite: { kind: "CACHE", amount: 5 },
  naturalWonder: { type: "DEEPWATER_ENGINE" },
  fort: { ownerId: "player-1", status: "active" },
  observatory: { ownerId: "player-1", status: "active" },
  siegeBattery: { ownerId: "player-1", status: "active" },
  economicStructure: { ownerId: "player-1", type: "ORE_REFINERY", status: "active" },
  sabotage: { ownerId: "player-2", endsAt: 10_000, outputMultiplier: 0.5 },
  watchtower: { activated: true, activatedByPlayerId: "player-1" },
  waystation: { activated: false },
  muster: { ownerId: "player-1", amount: 10, mode: "HOLD", updatedAt: 0 },
  afc: { ownerId: "player-1", status: "active", activatedAt: 0 }
};

const runtimeWithLoadedTile = (): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter: () => undefined,
    initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
    seedTiles: new Map(),
    initialState: { tiles: [loadedTile], activeLocks: [] }
  });

const exportedTile = (tiles: ReturnType<SimulationRuntime["exportState"]>["tiles"]) => {
  const tile = tiles.find((candidate) => candidate.x === loadedTile.x && candidate.y === loadedTile.y);
  if (!tile) throw new Error("loaded tile missing from export");
  return tile;
};

describe("full-world export overlays", () => {
  it.each(TILE_OVERLAY_WIRE_FIELDS)("exportState carries $camel", ({ key, camel }) => {
    const tile = exportedTile(runtimeWithLoadedTile().exportState().tiles);
    expect(tile[camel]).toBe(JSON.stringify(loadedTile[key]));
  });

  it("exportStateAsync carries every overlay", async () => {
    const tile = exportedTile((await runtimeWithLoadedTile().exportStateAsync(async () => undefined)).tiles);
    for (const { key, camel } of TILE_OVERLAY_WIRE_FIELDS) {
      expect(tile[camel], camel).toBe(JSON.stringify(loadedTile[key]));
    }
  });
});
