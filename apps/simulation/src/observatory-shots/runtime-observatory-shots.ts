// The runtime's Aether Tower shot operations -- picking the tower a cast
// fires from, spending its shot, and the shield rule -- bound to the
// runtime's state. Extracted out of runtime.ts (over the repo's per-file line
// cap); the shot rules themselves live in @border-empires/shared
// aether-tower-shots.ts.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { isObservatoryShielding } from "../aether-shield/aether-shield.js";
import { observatoryMaxShotsForOwner } from "../runtime-ability-command-handlers.js";
import {
  isTileShieldedByEnemyObservatory,
  pickReadyOwnedObservatoryAny,
  pickReadyOwnedObservatoryForTarget
} from "../runtime-ability-helpers.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { spendObservatoryShot } from "./observatory-shot-spend.js";

export type RuntimeObservatoryShotsDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly territoryTileKeys: (playerId: string) => ReadonlySet<string>;
  readonly castRadiusFor: (playerId: string) => number;
  // The runtime's active-Observatory index, so shield checks scan the owner's few towers.
  readonly activeTowerKeysForOwner: (ownerId: string) => Iterable<string>;
  readonly isStructureDormant: (playerId: string, tileKey: string, field: "observatory") => boolean;
  readonly now: () => number;
  readonly replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  readonly tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  readonly emitEvent: (event: SimulationEvent) => void;
};

export type RuntimeObservatoryShots = {
  /** Shots each of `ownerId`'s towers holds right now. */
  readonly maxShotsFor: (ownerId: string) => number;
  /**
   * The owned, active tower within cast range of the target that fires a
   * targeted ability: the one with most shots left, then the closest
   * (pickReadyOwnedObservatoryForTarget). Undefined when none can fire.
   */
  readonly pickForTarget: (playerId: string, targetX: number, targetY: number, now: number) => string | undefined;
  /** For abilities with no spatial target (Reveal Empire Stats): any tower that can fire, most shots first. */
  readonly pickAny: (playerId: string, now: number) => string | undefined;
  readonly spend: (tileKey: string, now: number, commandId: string, playerId: string) => void;
  /** isObservatoryShielding on the runtime's clock, dormancy and owner capacity. */
  readonly isShielding: (tile: DomainTileState) => boolean;
  readonly isTileShieldedByEnemy: (actorId: string, targetX: number, targetY: number) => boolean;
};

export const createRuntimeObservatoryShots = (deps: RuntimeObservatoryShotsDeps): RuntimeObservatoryShots => {
  const maxShotsFor = (ownerId: string): number => observatoryMaxShotsForOwner(deps.players(), ownerId);
  return {
    maxShotsFor,
    pickForTarget: (playerId, targetX, targetY, now) =>
      pickReadyOwnedObservatoryForTarget({
        tiles: deps.tiles(),
        territoryTileKeys: deps.territoryTileKeys(playerId),
        playerId,
        targetX,
        targetY,
        now,
        range: deps.castRadiusFor(playerId),
        maxShots: maxShotsFor(playerId),
        isStructureDormant: deps.isStructureDormant
      }),
    pickAny: (playerId, now) =>
      pickReadyOwnedObservatoryAny(deps.tiles(), deps.territoryTileKeys(playerId), playerId, now, maxShotsFor(playerId), deps.isStructureDormant),
    spend: (tileKey, now, commandId, playerId) =>
      spendObservatoryShot(
        { tiles: deps.tiles(), replaceTileState: deps.replaceTileState, tileDeltaFromState: deps.tileDeltaFromState, emitEvent: deps.emitEvent },
        tileKey,
        maxShotsFor(playerId),
        now,
        commandId,
        playerId
      ),
    isShielding: (tile) => isObservatoryShielding(tile, deps.now(), deps.isStructureDormant, maxShotsFor),
    isTileShieldedByEnemy: (actorId, targetX, targetY) =>
      isTileShieldedByEnemyObservatory(deps.tiles(), deps.isStructureDormant, maxShotsFor, actorId, targetX, targetY, deps.now(), deps.activeTowerKeysForOwner)
  };
};
