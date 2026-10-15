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

/** True when the tower on `tile` is shielding its owner's land at `now`. */
export const isObservatoryShielding = (
  tile: DomainTileState | undefined,
  now: number,
  isStructureDormant: ObservatoryDormancyCheck
): boolean => {
  const observatory = tile?.observatory;
  if (!tile || !observatory || observatory.status !== "active") return false;
  if (!tile.ownerId || observatory.ownerId !== tile.ownerId) return false;
  if ((observatory.cooldownUntil ?? 0) > now) return false;
  return !isStructureDormant(observatory.ownerId, simulationTileKey(tile.x, tile.y), "observatory");
};

/**
 * True when (x, y) is held by `ownerId` and one of `ownerId`'s own towers
 * shields it. Scans the protection square around the tile rather than every
 * tile on the map.
 */
export const isTileShieldedByOwnersObservatory = (
  tiles: ReadonlyMap<string, DomainTileState>,
  isStructureDormant: ObservatoryDormancyCheck,
  ownerId: string,
  x: number,
  y: number,
  now: number
): boolean => {
  if (tiles.get(simulationTileKey(x, y))?.ownerId !== ownerId) return false;
  for (let dy = -OBSERVATORY_PROTECTION_RADIUS; dy <= OBSERVATORY_PROTECTION_RADIUS; dy += 1) {
    for (let dx = -OBSERVATORY_PROTECTION_RADIUS; dx <= OBSERVATORY_PROTECTION_RADIUS; dx += 1) {
      const candidate = tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
      if (candidate?.ownerId !== ownerId || candidate.observatory?.ownerId !== ownerId) continue;
      if (isObservatoryShielding(candidate, now, isStructureDormant)) return true;
    }
  }
  return false;
};

export type ShieldingTower = { readonly x: number; readonly y: number; readonly ownerId: string };

/** Every tower shielding right now, read from the runtime's active-Observatory index (not a full tile scan). */
export const collectShieldingTowers = (
  activeObservatoriesByOwner: ReadonlyMap<string, ReadonlySet<string>>,
  tiles: ReadonlyMap<string, DomainTileState>,
  now: number,
  isStructureDormant: ObservatoryDormancyCheck
): ShieldingTower[] => {
  const towers: ShieldingTower[] = [];
  for (const [ownerId, tileKeys] of activeObservatoriesByOwner) {
    for (const tileKey of tileKeys) {
      const tile = tiles.get(tileKey);
      if (tile?.ownerId === ownerId && isObservatoryShielding(tile, now, isStructureDormant)) towers.push({ x: tile.x, y: tile.y, ownerId });
    }
  }
  return towers;
};
