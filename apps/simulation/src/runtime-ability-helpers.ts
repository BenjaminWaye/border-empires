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
  structureType: EconomicStructureType
): boolean {
  const tile = tiles.get(tileKey);
  const structure = tile?.economicStructure;
  if (!tile || !structure) return false;
  if (structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") return false;
  for (const candidate of tiles.values()) {
    const tower = candidate.economicStructure;
    if (!tower || tower.ownerId !== ownerId || tower.type !== "AETHER_TOWER" || tower.status !== "active") continue;
    if (wrappedChebyshev(candidate.x, candidate.y, tile.x, tile.y) <= AETHER_TOWER_RADIUS) return true;
  }
  return false;
}

export function isTileShieldedByEnemyAegisDome(
  tiles: ReadonlyMap<string, DomainTileState>,
  actorId: string,
  targetX: number,
  targetY: number
): boolean {
  for (const candidate of tiles.values()) {
    const dome = candidate.economicStructure;
    if (!dome || dome.type !== "AEGIS_DOME" || dome.status !== "active") continue;
    if (!dome.ownerId || dome.ownerId === actorId) continue;
    if (wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > AEGIS_DOME_PROTECTION_RADIUS) continue;
    if (isStructurePowered(tiles, dome.ownerId, simulationTileKey(candidate.x, candidate.y), "AEGIS_DOME")) return true;
  }
  return false;
}

export const AEGIS_LOCK_ACTIVE_UNTIL_KEY = "aegis_lock_active_until";
export const ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY = "astral_dock_launch_active_until";

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
  actorId: string,
  targetX: number,
  targetY: number
): boolean {
  for (const candidate of tiles.values()) {
    const s = candidate.economicStructure;
    if (!s || s.type !== "RADAR_SYSTEM" || s.status !== "active") continue;
    if (!s.ownerId || s.ownerId === actorId) continue;
    if (wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS) continue;
    if (isStructurePowered(tiles, s.ownerId, simulationTileKey(candidate.x, candidate.y), s.type)) return true;
  }
  return false;
}

export function observatoryCastRadiusFor(player: DomainPlayer | undefined): number {
  if (!player) return OBSERVATORY_CAST_RADIUS;
  return observatoryCastRadiusForPlayer(player, OBSERVATORY_CAST_RADIUS);
}

export function pickReadyOwnedObservatoryForTarget(input: {
  tiles: ReadonlyMap<string, DomainTileState>;
  playerId: string;
  targetX: number;
  targetY: number;
  now: number;
  range: number;
}): string | undefined {
  let bestKey: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [tileKey, tile] of input.tiles) {
    if (tile.ownerId !== input.playerId) continue;
    const obs = tile.observatory;
    if (!obs || obs.ownerId !== input.playerId || obs.status !== "active") continue;
    const distance = wrappedChebyshev(tile.x, tile.y, input.targetX, input.targetY);
    if (distance > input.range) continue;
    const cooldownUntil = obs.cooldownUntil ?? 0;
    if (cooldownUntil > input.now) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = tileKey;
    }
  }
  return bestKey;
}

export function pickReadyOwnedObservatoryAny(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  now: number
): string | undefined {
  let bestKey: string | undefined;
  let bestCooldownUntil = Number.POSITIVE_INFINITY;
  for (const [tileKey, tile] of tiles) {
    if (tile.ownerId !== playerId) continue;
    const obs = tile.observatory;
    if (!obs || obs.ownerId !== playerId || obs.status !== "active") continue;
    const cooldownUntil = obs.cooldownUntil ?? 0;
    if (cooldownUntil > now) continue;
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
  return [
    tiles.get(simulationTileKey(x, y - 1)),
    tiles.get(simulationTileKey(x + 1, y)),
    tiles.get(simulationTileKey(x, y + 1)),
    tiles.get(simulationTileKey(x - 1, y))
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
      IRON: target.strategicResources?.IRON ?? 0,
      CRYSTAL: target.strategicResources?.CRYSTAL ?? 0,
      SUPPLY: target.strategicResources?.SUPPLY ?? 0,
      SHARD: target.strategicResources?.SHARD ?? 0
    } satisfies Record<StrategicResourceKey, number>
  };
}
