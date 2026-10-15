import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { TILE_OVERLAY_WIRE_FIELDS } from "@border-empires/sim-protocol";

import { applySimulationEventsToRecoveredState, type RecoveredSimulationState } from "./event-recovery.js";

const overlays = {
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
} satisfies Partial<DomainTileState>;

const baseState = (tile: RecoveredSimulationState["tiles"][number]): RecoveredSimulationState => ({
  tiles: [tile],
  activeLocks: [],
  players: [],
  pendingSettlements: [],
  playerYieldCollectionEpochByPlayer: []
});

const recoverTile = (state: RecoveredSimulationState, tileDelta: Record<string, unknown> | undefined) => {
  const recovered = applySimulationEventsToRecoveredState(
    state,
    tileDelta
      ? [{ eventType: "TILE_DELTA_BATCH", commandId: "cmd-1", playerId: "player-1", tileDeltas: [{ x: 10, y: 10, ...tileDelta }] }]
      : []
  );
  const tile = recovered.tiles.find((candidate) => candidate.x === 10 && candidate.y === 10);
  if (!tile) throw new Error("tile missing after recovery");
  return tile;
};

const loadedTile = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, ...overlays };
const bareTile = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const };

describe("event recovery keeps every tile overlay", () => {
  // Regression: cloneRecoveredTile hand-listed overlays and had no muster
  // line, so every restart (snapshot -> accumulator -> finalize) dropped
  // every active muster flag the snapshot had saved.
  it.each(TILE_OVERLAY_WIRE_FIELDS)("keeps a snapshotted $key with no replayed events", ({ key }) => {
    expect(recoverTile(baseState(loadedTile), undefined)[key]).toEqual(overlays[key]);
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("replays a $camel set by a tile delta", ({ key, camel }) => {
    expect(recoverTile(baseState(bareTile), { [camel]: JSON.stringify(overlays[key]) })[key]).toEqual(overlays[key]);
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("replays an empty $camel as an explicit clear", ({ key, camel }) => {
    expect(recoverTile(baseState(loadedTile), { [camel]: "" })[key]).toBeUndefined();
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("keeps $key when a delta does not touch it", ({ key }) => {
    expect(recoverTile(baseState(loadedTile), { ownerId: "player-1" })[key]).toEqual(overlays[key]);
  });
});
