import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isSeaTerrain,
  type EconomicStructureType
} from "@border-empires/shared";
import {
  AEGIS_DOME_PROTECTION_RADIUS,
  AETHER_BRIDGE_MAX_SEA_TILES,
  AETHER_TOWER_RADIUS,
  OBSERVATORY_CAST_RADIUS,
  RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS
} from "@border-empires/game-domain";
import { observatoryCastRadiusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { ActiveAetherBridgeView, ActiveAetherWallView, AetherWallDirection, StrategicResourceKey } from "./runtime-types.js";

export function revealCapacityForPlayer(player: DomainPlayer, revealTargetCount: number): number {
  return player.techIds.has("cryptography") || revealTargetCount > 0 ? 1 : 0;
}

export function getAbilityCooldownUntil(
  abilityCooldowns: ReadonlyMap<string, ReadonlyMap<string, number>>,
  playerId: string,
  abilityKey: string
): number {
  return abilityCooldowns.get(playerId)?.get(abilityKey) ?? 0;
}

export function setAbilityCooldownUntil(
  abilityCooldowns: Map<string, Map<string, number>>,
  playerId: string,
  abilityKey: string,
  untilMs: number
): void {
  let map = abilityCooldowns.get(playerId);
  if (!map) {
    map = new Map();
    abilityCooldowns.set(playerId, map);
  }
  map.set(abilityKey, untilMs);
}

export function ownedLandWithinRange(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number,
  range: number
): boolean {
  for (let dy = -range; dy <= range; dy += 1) {
    for (let dx = -range; dx <= range; dx += 1) {
      const tile = tiles.get(simulationTileKey(x + dx, y + dy));
      if (tile?.ownerId === playerId && tile.terrain === "LAND") return true;
    }
  }
  return false;
}

export function wrappedChebyshev(ax: number, ay: number, bx: number, by: number): number {
  const dxRaw = Math.abs(ax - bx);
  const dyRaw = Math.abs(ay - by);
  const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
  const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
  return Math.max(dx, dy);
}

export function isStructurePowered(
  tiles: ReadonlyMap<string, DomainTileState>,
  ownerId: string,
  tileKey: string,
  structureType: EconomicStructureType,
  // §5.4: an Aether Tower itself demands a FOOD + CRYSTAL slot
  // (STRUCTURE_SLOT_REQUIREMENTS.AETHER_TOWER) and can go dormant like any
  // other structure — a dormant tower provides no bonus, including its own
  // powering radius, same as every other structure this class of check
  // gates (monument abilities, Observatory abilities). Optional so existing
  // callers that haven't threaded it through yet default to "nothing
  // dormant" rather than a hard type error.
  isStructureDormant: (playerId: string, tileKey: string, field: "economicStructure") => boolean = () => false
): boolean {
  const tile = tiles.get(tileKey);
  const structure = tile?.economicStructure;
  if (!tile || !structure) return false;
  if (structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") return false;
  for (const candidate of tiles.values()) {
    const tower = candidate.economicStructure;
    if (!tower || tower.ownerId !== ownerId || tower.type !== "AETHER_TOWER" || tower.status !== "active") continue;
    if (wrappedChebyshev(candidate.x, candidate.y, tile.x, tile.y) > AETHER_TOWER_RADIUS) continue;
    if (isStructureDormant(ownerId, simulationTileKey(candidate.x, candidate.y), "economicStructure")) continue;
    return true;
  }
  return false;
}

export function isTileShieldedByEnemyAegisDome(
  tiles: ReadonlyMap<string, DomainTileState>,
  isStructureDormant: (playerId: string, tileKey: string, field: "economicStructure") => boolean,
  actorId: string,
  targetX: number,
  targetY: number
): boolean {
  for (const candidate of tiles.values()) {
    const dome = candidate.economicStructure;
    if (!dome || dome.type !== "AEGIS_DOME" || dome.status !== "active") continue;
    if (!dome.ownerId || dome.ownerId === actorId) continue;
    if (wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > AEGIS_DOME_PROTECTION_RADIUS) continue;
    const domeKey = simulationTileKey(candidate.x, candidate.y);
    if (!isStructurePowered(tiles, dome.ownerId, domeKey, "AEGIS_DOME", isStructureDormant)) continue;
    if (isStructureDormant(dome.ownerId, domeKey, "economicStructure")) continue;
    return true;
  }
  return false;
}

export const AEGIS_LOCK_ACTIVE_UNTIL_KEY = "aegis_lock_active_until";
export const ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY = "astral_dock_launch_active_until";
export const IMPERIAL_WARD_ACTIVE_UNTIL_KEY = "imperial_ward_active_until";

// Emperor-endorsement bonus (galaxy meta-layer Phase 1): while active, no
// ATTACK lock may be created against any tile owned by `targetOwnerId` — a
// creation-time full-invulnerability block, unlike Aegis Lock's
// resolution-time "attack always loses" mechanism.
export function isTileWardedByImperialWard(
  abilityCooldowns: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: number,
  targetOwnerId: string | undefined
): boolean {
  if (!targetOwnerId) return false;
  return getAbilityCooldownUntil(abilityCooldowns, targetOwnerId, IMPERIAL_WARD_ACTIVE_UNTIL_KEY) > now;
}

export function isTileShieldedByAegisLock(
  tiles: ReadonlyMap<string, DomainTileState>,
  abilityCooldowns: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: number,
  actorId: string,
  targetX: number,
  targetY: number
): boolean {
  for (const candidate of tiles.values()) {
    const dome = candidate.economicStructure;
    if (!dome || dome.type !== "AEGIS_DOME" || dome.status !== "active") continue;
    if (!dome.ownerId || dome.ownerId === actorId) continue;
    if (wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > AEGIS_DOME_PROTECTION_RADIUS) continue;
    if (getAbilityCooldownUntil(abilityCooldowns, dome.ownerId, AEGIS_LOCK_ACTIVE_UNTIL_KEY) > now) return true;
  }
  return false;
}

export function isTileBombardBlockedByRadar(
  tiles: ReadonlyMap<string, DomainTileState>,
  isStructureDormant: (playerId: string, tileKey: string, field: "economicStructure") => boolean,
  actorId: string,
  targetX: number,
  targetY: number
): boolean {
  for (const candidate of tiles.values()) {
    const s = candidate.economicStructure;
    if (!s || s.type !== "RADAR_SYSTEM" || s.status !== "active") continue;
    if (!s.ownerId || s.ownerId === actorId) continue;
    if (wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS) continue;
    const radarKey = simulationTileKey(candidate.x, candidate.y);
    if (!isStructurePowered(tiles, s.ownerId, radarKey, s.type, isStructureDormant)) continue;
    if (isStructureDormant(s.ownerId, radarKey, "economicStructure")) continue;
    return true;
  }
  return false;
}

export function observatoryCastRadiusFor(player: DomainPlayer | undefined): number {
  if (!player) return OBSERVATORY_CAST_RADIUS;
  return observatoryCastRadiusForPlayer(player, OBSERVATORY_CAST_RADIUS);
}

// Watchtower Engine's own observatory reaches +10 tiles further than a
// built one — a fixed bonus that does NOT stack with tech/domain range
// effects (unlike a real Observatory's range, which does), so it's computed
// off the base radius directly rather than through observatoryCastRadiusFor.
export const WATCHTOWER_ENGINE_OBSERVATORY_RANGE = OBSERVATORY_CAST_RADIUS + 10;

const observatoryRangeForTile = (tile: DomainTileState, playerRange: number): number =>
  tile.naturalWonder?.type === "WATCHTOWER_ENGINE" ? WATCHTOWER_ENGINE_OBSERVATORY_RANGE : playerRange;

export function pickReadyOwnedObservatoryForTarget(input: {
  tiles: ReadonlyMap<string, DomainTileState>;
  territoryTileKeys: ReadonlySet<string>;
  playerId: string;
  targetX: number;
  targetY: number;
  now: number;
  range: number;
  // §5.4: an Observatory demands a CRYSTAL slot (STRUCTURE_SLOT_REQUIREMENTS)
  // and can go dormant like any other structure — a dormant one shouldn't be
  // pickable to cast an ability, same as isStructurePowered's Aether Tower
  // check gates the monument abilities.
  isStructureDormant: (playerId: string, tileKey: string, field: "observatory") => boolean;
}): string | undefined {
  let bestKey: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tileKey of input.territoryTileKeys) {
    const tile = input.tiles.get(tileKey);
    if (!tile || tile.ownerId !== input.playerId) continue;
    const obs = tile.observatory;
    if (!obs || obs.ownerId !== input.playerId || obs.status !== "active") continue;
    const distance = wrappedChebyshev(tile.x, tile.y, input.targetX, input.targetY);
    if (distance > observatoryRangeForTile(tile, input.range)) continue;
    const cooldownUntil = obs.cooldownUntil ?? 0;
    if (cooldownUntil > input.now) continue;
    if (input.isStructureDormant(input.playerId, tileKey, "observatory")) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = tileKey;
    }
  }
  return bestKey;
}

export function pickReadyOwnedObservatoryAny(
  tiles: ReadonlyMap<string, DomainTileState>,
  territoryTileKeys: ReadonlySet<string>,
  playerId: string,
  now: number,
  isStructureDormant: (playerId: string, tileKey: string, field: "observatory") => boolean
): string | undefined {
  let bestKey: string | undefined;
  let bestCooldownUntil = Number.POSITIVE_INFINITY;
  for (const tileKey of territoryTileKeys) {
    const tile = tiles.get(tileKey);
    if (!tile || tile.ownerId !== playerId) continue;
    const obs = tile.observatory;
    if (!obs || obs.ownerId !== playerId || obs.status !== "active") continue;
    const cooldownUntil = obs.cooldownUntil ?? 0;
    if (cooldownUntil > now) continue;
    if (isStructureDormant(playerId, tileKey, "observatory")) continue;
    if (cooldownUntil < bestCooldownUntil) {
      bestCooldownUntil = cooldownUntil;
      bestKey = tileKey;
    }
  }
  return bestKey;
}

export function isCoastalLand(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number): boolean {
  const tile = tiles.get(simulationTileKey(x, y));
  if (!tile || tile.terrain !== "LAND") return false;
  // Worldgen flips any sea tile touching land (including diagonally) to
  // LAND, so genuine open sea is never orthogonally adjacent to a land
  // tile — only diagonally. Check all 8 neighbors, not just the 4
  // orthogonal ones, or no real-world tile will ever read as coastal.
  return [
    tiles.get(simulationTileKey(x, y - 1)),
    tiles.get(simulationTileKey(x + 1, y - 1)),
    tiles.get(simulationTileKey(x + 1, y)),
    tiles.get(simulationTileKey(x + 1, y + 1)),
    tiles.get(simulationTileKey(x, y + 1)),
    tiles.get(simulationTileKey(x - 1, y + 1)),
    tiles.get(simulationTileKey(x - 1, y)),
    tiles.get(simulationTileKey(x - 1, y - 1))
  ].some((neighbor) => Boolean(neighbor?.terrain && isSeaTerrain(neighbor.terrain)));
}

export function seaTileCountBetween(
  tiles: ReadonlyMap<string, DomainTileState>,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number | undefined {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  if (steps <= 1) return 0;
  let seaTiles = 0;
  for (let index = 1; index < steps; index += 1) {
    const x = Math.round(ax + ((bx - ax) * index) / steps);
    const y = Math.round(ay + ((by - ay) * index) / steps);
    const tile = tiles.get(simulationTileKey(x, y));
    if (!tile || !isSeaTerrain(tile.terrain)) return undefined;
    seaTiles += 1;
  }
  return seaTiles;
}

export function closestAetherBridgeOrigin(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  targetX: number,
  targetY: number
): { x: number; y: number } | undefined {
  let best: { x: number; y: number; seaTiles: number; distance: number } | undefined;
  for (const tile of tiles.values()) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !isCoastalLand(tiles, tile.x, tile.y)) continue;
    const seaTiles = seaTileCountBetween(tiles, tile.x, tile.y, targetX, targetY);
    if (seaTiles === undefined || seaTiles > AETHER_BRIDGE_MAX_SEA_TILES) continue;
    const distance = Math.max(Math.abs(tile.x - targetX), Math.abs(tile.y - targetY));
    if (!best || seaTiles < best.seaTiles || (seaTiles === best.seaTiles && distance < best.distance)) {
      best = { x: tile.x, y: tile.y, seaTiles, distance };
    }
  }
  return best ? { x: best.x, y: best.y } : undefined;
}

export type AetherWallSegment = {
  baseX: number;
  baseY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export function wallSegments(originX: number, originY: number, direction: AetherWallDirection, length: 1 | 2 | 3): AetherWallSegment[] {
  const segments: AetherWallSegment[] = [];
  for (let index = 0; index < length; index += 1) {
    const baseX = direction === "N" || direction === "S" ? originX + index : originX;
    const baseY = direction === "E" || direction === "W" ? originY + index : originY;
    const toX = direction === "E" ? baseX + 1 : direction === "W" ? baseX - 1 : baseX;
    const toY = direction === "S" ? baseY + 1 : direction === "N" ? baseY - 1 : baseY;
    segments.push({ baseX, baseY, fromX: baseX, fromY: baseY, toX, toY });
  }
  return segments;
}

export function activeAetherBridgesForPlayer(
  bridgesByPlayer: Map<string, ActiveAetherBridgeView[]>,
  playerId: string,
  now: number
): ActiveAetherBridgeView[] {
  const active = (bridgesByPlayer.get(playerId) ?? []).filter((bridge) => bridge.endsAt > now);
  bridgesByPlayer.set(playerId, active);
  return active;
}

export function activeAetherWallsForPlayer(
  wallsByPlayer: Map<string, ActiveAetherWallView[]>,
  playerId: string,
  now: number
): ActiveAetherWallView[] {
  const active = (wallsByPlayer.get(playerId) ?? []).filter((wall) => wall.endsAt > now);
  wallsByPlayer.set(playerId, active);
  return active;
}

export function crossingBlockedByAetherWall(
  wallsByPlayer: ReadonlyMap<string, readonly ActiveAetherWallView[]>,
  now: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): boolean {
  for (const walls of wallsByPlayer.values()) {
    for (const wall of walls) {
      if (wall.endsAt <= now) continue;
      for (const segment of wallSegments(wall.origin.x, wall.origin.y, wall.direction, wall.length)) {
        if (
          (segment.fromX === fromX && segment.fromY === fromY && segment.toX === toX && segment.toY === toY) ||
          (segment.fromX === toX && segment.fromY === toY && segment.toX === fromX && segment.toY === fromY)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export function buildRevealEmpireStatsFromSummary(
  target: DomainPlayer,
  territoryTileCount: number,
  settledTileCount: number,
  townCount: number,
  revealedAt: number
): Record<string, unknown> {
  return {
    playerId: target.id,
    playerName: target.name ?? target.id,
    revealedAt,
    tiles: territoryTileCount,
    settledTiles: settledTileCount,
    frontierTiles: territoryTileCount - settledTileCount,
    controlledTowns: townCount,
    incomePerMinute: 0,
    techCount: target.techIds.size,
    gold: target.points,
    manpower: target.manpower,
    manpowerCap: Math.max(target.manpower, 100),
    strategicResources: {
      FOOD: target.strategicResources?.FOOD ?? 0,
      TITANIUM: target.strategicResources?.TITANIUM ?? 0,
      CRYSTAL: target.strategicResources?.CRYSTAL ?? 0,
      UMBRITE: target.strategicResources?.UMBRITE ?? 0,
      SHARD: target.strategicResources?.SHARD ?? 0
    } satisfies Record<StrategicResourceKey, number>
  };
}

export function buildRevealEmpireStats(
  tiles: Iterable<DomainTileState>,
  target: DomainPlayer,
  revealedAt: number
): Record<string, unknown> {
  let settledTiles = 0;
  let frontierTiles = 0;
  let controlledTowns = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== target.id) continue;
    if (tile.ownershipState === "SETTLED") settledTiles += 1;
    if (tile.ownershipState === "FRONTIER") frontierTiles += 1;
    if (tile.town) controlledTowns += 1;
  }
  return {
    playerId: target.id,
    playerName: target.name ?? target.id,
    revealedAt,
    tiles: settledTiles + frontierTiles,
    settledTiles,
    frontierTiles,
    controlledTowns,
    incomePerMinute: 0,
    techCount: target.techIds.size,
    gold: target.points,
    manpower: target.manpower,
    manpowerCap: Math.max(target.manpower, 100),
    strategicResources: {
      FOOD: target.strategicResources?.FOOD ?? 0,
      TITANIUM: target.strategicResources?.TITANIUM ?? 0,
      CRYSTAL: target.strategicResources?.CRYSTAL ?? 0,
      UMBRITE: target.strategicResources?.UMBRITE ?? 0,
      SHARD: target.strategicResources?.SHARD ?? 0
    } satisfies Record<StrategicResourceKey, number>
  };
}
