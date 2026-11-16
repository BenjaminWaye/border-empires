import type { DomainTileState } from "@border-empires/game-domain";
import { razedWreckFieldsOnCapture } from "@border-empires/shared";
import { capturedStructureFields } from "../capture-structures/capture-structures.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

const BARBARIAN_PLAYER_ID = "barbarian-1";

export type EncirclementPocketCaptureContext = {
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

/**
 * Whether `claimantId` may take the frontier an enemy capture just cut off.
 * Only a real player who now holds one of the changed tiles qualifies: every
 * cut-off component is seeded from a changed tile or its neighbours, so it
 * touches that tile and stays supplied through it once handed over.
 * Barbarians never claim pockets (their land is SETTLED-only and ownerless
 * on loss), and a changed tile the claimant no longer holds (e.g. a
 * barbarian defender's tile released back to neutral) gives no claim.
 */
export const canClaimEncirclementPocket = (
  tiles: ReadonlyMap<string, DomainTileState>,
  claimantId: string | undefined,
  cutOffPlayerId: string,
  changedKeys: readonly string[]
): claimantId is string =>
  Boolean(claimantId) &&
  claimantId !== cutOffPlayerId &&
  claimantId !== BARBARIAN_PLAYER_ID &&
  changedKeys.some((key) => tiles.get(key)?.ownerId === claimantId);

/**
 * Hands cut-off FRONTIER tiles to the player whose capture cut them off,
 * instead of releasing them to neutral (which left an empty, unclaimable
 * pocket inside the captor's lines). The tile lands as the captor's
 * FRONTIER, with buildings following the ordinary capture rules
 * (capturedStructureFields) and any muster flag or sabotage dropped. No
 * capture hold is granted: these tiles were never fought over.
 *
 * Town tiles are not taken: a town changing hands runs the capture
 * aftermath (population loss, settlement relocation) that only a real
 * ATTACK resolves, so they keep the neutral release. Returns the deltas
 * for the tiles taken and the keys left for the caller to release.
 */
export function captureEncirclementPocket(
  context: EncirclementPocketCaptureContext,
  keys: Iterable<string>,
  claimantId: string,
  commandId: string,
  nowMs: number
): { tileDeltas: SimulationTileWireDelta[]; releaseKeys: string[] } {
  const tileDeltas: SimulationTileWireDelta[] = [];
  const releaseKeys: string[] = [];
  for (const key of keys) {
    const tile = context.tiles.get(key);
    if (!tile || tile.ownershipState !== "FRONTIER") continue;
    if (tile.town) {
      releaseKeys.push(key);
      continue;
    }
    const captured: DomainTileState = {
      ...tile,
      ownerId: claimantId,
      ownershipState: "FRONTIER",
      frontierDecayAt: undefined,
      frontierDecayKind: undefined,
      captureHoldUntil: undefined,
      healAt: undefined,
      muster: undefined,
      sabotage: undefined,
      ...capturedStructureFields(tile, claimantId, nowMs),
      ...razedWreckFieldsOnCapture(tile, nowMs)
    };
    context.replaceTileState(key, captured, commandId);
    tileDeltas.push(context.tileDeltaFromState(captured));
  }
  return { tileDeltas, releaseKeys };
}
