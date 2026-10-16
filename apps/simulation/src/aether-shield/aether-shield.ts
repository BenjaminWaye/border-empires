// Aether Tower (Observatory) protection — the one rule for "is this tower
// shielding its owner's land right now", shared by every hostile Aether
// ability's target check (isTileShieldedByEnemyObservatory,
// runtime-ability-helpers.ts), Siphon's cast-time eligibility and its
// tower-comes-back-online end (siphon-mode/siphon-mode-lifecycle.ts), and the
// per-player AETHER_SHIELDS push the client paints its protection field from
// (aether-shield-broadcast.ts).
//
// A tower shields only while it is active, its owner holds the tower tile,
// it is off its own cast cooldown, and it is not resource-slot dormant. It
// covers only tiles its owner holds, within the fixed
// OBSERVATORY_PROTECTION_RADIUS (tech range bonuses widen casting, not the
// shield).
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type ObservatoryDormancyCheck = (playerId: string, tileKey: string, field: "observatory") => boolean;

/** Active, its owner holds the tower tile, and off its own cast cooldown. */
export const isObservatoryReady = (tile: DomainTileState | undefined, now: number): boolean => {
  const observatory = tile?.observatory;
  if (!tile || !observatory || observatory.status !== "active") return false;
  if (!tile.ownerId || observatory.ownerId !== tile.ownerId) return false;
  return (observatory.cooldownUntil ?? 0) <= now;
};

/** True when the tower on `tile` is shielding its owner's land at `now`: ready and not dormant. */
export const isObservatoryShielding = (
  tile: DomainTileState | undefined,
  now: number,
  isStructureDormant: ObservatoryDormancyCheck
): boolean => {
  if (!tile?.observatory || !isObservatoryReady(tile, now)) return false;
  return !isStructureDormant(tile.observatory.ownerId, simulationTileKey(tile.x, tile.y), "observatory");
};

/**
 * Siphon's victim-tower rule: ready, power ignored. A siphon moves the
 * victim's resource slots to the caster, so draining their CRYSTAL can be
 * what leaves their tower dormant -- counting dormancy here would let a
 * siphon keep the tower that should end it switched off for good.
 */
export const isObservatoryBlockingSiphon = isObservatoryReady;

/**
 * Visits every tile key in the OBSERVATORY_PROTECTION_RADIUS square around
 * (x, y), wrapped across the world seams. Stops early and returns true as
 * soon as `visit` returns true.
 */
export const someProtectionSquareKey = (x: number, y: number, visit: (tileKey: string) => boolean): boolean => {
  for (let dy = -OBSERVATORY_PROTECTION_RADIUS; dy <= OBSERVATORY_PROTECTION_RADIUS; dy += 1) {
    for (let dx = -OBSERVATORY_PROTECTION_RADIUS; dx <= OBSERVATORY_PROTECTION_RADIUS; dx += 1) {
      if (visit(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)))) return true;
    }
  }
  return false;
};

/**
 * True when (x, y) is held by `ownerId` and one of `ownerId`'s own towers
 * passes `isShieldingTower` (isObservatoryShielding, or
 * isObservatoryBlockingSiphon for Siphon). Scans the protection square
 * around the tile rather than every tile on the map.
 */
export const isTileShieldedByOwnersObservatory = (
  tiles: ReadonlyMap<string, DomainTileState>,
  isShieldingTower: (tower: DomainTileState) => boolean,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  if (tiles.get(simulationTileKey(x, y))?.ownerId !== ownerId) return false;
  return someProtectionSquareKey(x, y, (tileKey) => {
    const candidate = tiles.get(tileKey);
    if (candidate?.ownerId !== ownerId || candidate.observatory?.ownerId !== ownerId) return false;
    return isShieldingTower(candidate);
  });
};

/** A ready tower; `dormant` when unpowered, in which case it blocks Siphon only. */
export type ShieldingTower = { readonly x: number; readonly y: number; readonly ownerId: string; readonly dormant?: true };

/** Every ready tower, read from the runtime's active-Observatory index (not a full tile scan). */
export const collectReadyTowers = (
  activeObservatoriesByOwner: ReadonlyMap<string, ReadonlySet<string>>,
  tiles: ReadonlyMap<string, DomainTileState>,
  now: number,
  isStructureDormant: ObservatoryDormancyCheck
): ShieldingTower[] => {
  const towers: ShieldingTower[] = [];
  for (const [ownerId, tileKeys] of activeObservatoriesByOwner) {
    for (const tileKey of tileKeys) {
      const tile = tiles.get(tileKey);
      if (tile?.ownerId !== ownerId || !isObservatoryReady(tile, now)) continue;
      const dormant = isStructureDormant(ownerId, tileKey, "observatory");
      towers.push(dormant ? { x: tile.x, y: tile.y, ownerId, dormant: true } : { x: tile.x, y: tile.y, ownerId });
    }
  }
  return towers;
};
