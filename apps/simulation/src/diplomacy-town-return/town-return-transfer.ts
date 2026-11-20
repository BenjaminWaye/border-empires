// Moves returned towns to their old owner as part of SETTLE_DIPLOMACY_TERMS,
// after townReturnProblem has cleared every one (so the deal applies whole).
//
// It follows the capture path (runtime-winning-capture.ts) where a peaceful
// handover means the same thing, and departs from it where it doesn't:
//   - structures on the tile change hands through capturedStructureFields,
//     exactly as on capture (unfinished builds are lost, active ones carry over);
//   - the town keeps its population: no capture loss or capture shock;
//   - it arrives SETTLED (garrisoned) -- it was the receiver's town, handed
//     back intact, not a raw FRONTIER grab that still needs settling;
//   - the capture hold and any frontier decay timer are cleared, they
//     protected the giver's hold on the tile.
// replaceTileState (runtime.ts writeTileState) does the rest that capture
// relies on: economy and summary caches, vision, reach-anchor activation for
// the receiver and the giver's deactivation. The TILE_DELTA_BATCH is the
// durable record event recovery replays after a restart.
import type { DomainTileState } from "@border-empires/game-domain";
import { townRefKey, type DiplomacyTownRef } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { capturedStructureFields } from "../capture-structures/capture-structures.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type TownReturnWriteContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

export const returnedTownState = (tile: DomainTileState, receiverId: string, now: number): DomainTileState => {
  const {
    captureHoldUntil: _captureHold,
    frontierDecayAt: _decayAt,
    frontierDecayKind: _decayKind,
    muster: _muster,
    ...rest
  } = tile;
  // The capture's growth shock ends with the handover (the town is back with its own empire).
  const town = rest.town ? (({ captureShockUntil: _shock, populationBeforeCapture: _before, ...kept }) => kept)(rest.town) : undefined;
  return { ...rest, ...(town ? { town } : {}), ...capturedStructureFields(tile, receiverId, now), ownerId: receiverId, ownershipState: "SETTLED" };
};

/** Hands each town to `receiverId` and tells both sides. Returns the tiles written. */
export const applyTownReturn = (
  ctx: TownReturnWriteContext,
  giverId: string,
  receiverId: string,
  towns: readonly DiplomacyTownRef[],
  commandId: string
): DomainTileState[] => {
  const written: DomainTileState[] = [];
  for (const town of towns) {
    const key = townRefKey(town);
    const tile = ctx.tiles.get(key);
    if (!tile) continue;
    const next = returnedTownState(tile, receiverId, ctx.now());
    ctx.replaceTileState(key, next, commandId);
    written.push(ctx.tiles.get(key) ?? next);
  }
  if (written.length === 0) return written;
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `${commandId}:towns`,
    playerId: receiverId,
    // Both sides need the new owner even where their fog would hide it: the
    // giver just lost the tile's vision, the receiver may not have it yet.
    tileDeltas: written.map((tile) => ({ ...ctx.tileDeltaFromState(tile), forceVisibleForPlayerId: [receiverId, giverId] }))
  });
  return written;
};
