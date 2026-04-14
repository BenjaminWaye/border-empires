import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { OBSERVATORY_CAST_RADIUS, OBSERVATORY_PROTECTION_RADIUS } from "./client-constants.js";
import type { Tile } from "./client-types.js";

const wrappedDelta = (a: number, b: number, size: number): number => Math.min(Math.abs(a - b), size - Math.abs(a - b));

export const chebyshevDistanceWrapped = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(wrappedDelta(ax, bx, WORLD_WIDTH), wrappedDelta(ay, by, WORLD_HEIGHT));

type ObservatoryViewWithCooldown = NonNullable<Tile["observatory"]> & { cooldownUntil?: number };

export type OwnedObservatoryCastState = {
  hasInRange: boolean;
  cooldownRemainingMs: number;
};

export const observatoryProtectionActive = (tile: Pick<ObservatoryViewWithCooldown, "cooldownUntil">, nowMs: number): boolean =>
  (tile.cooldownUntil ?? 0) <= nowMs;

export const hostileObservatoryProtectingTileAt = (
  tiles: Iterable<Tile>,
  me: string,
  allies: string[],
  target: Tile,
  nowMs: number
): Tile | undefined => {
  for (const candidate of tiles) {
    if (!candidate.observatory || candidate.observatory.status !== "active") continue;
    if (!candidate.ownerId || candidate.ownerId === me || allies.includes(candidate.ownerId)) continue;
    if (candidate.fogged) continue;
    if (!observatoryProtectionActive(candidate.observatory, nowMs)) continue;
    if (chebyshevDistanceWrapped(candidate.x, candidate.y, target.x, target.y) <= OBSERVATORY_PROTECTION_RADIUS) return candidate;
  }
  return undefined;
};

export const readyOwnedObservatoryCooldownRemainingMs = (
  tiles: Iterable<Tile>,
  me: string,
  target: Tile,
  nowMs: number
): number => {
  return ownedObservatoryCastStateForTarget(tiles, me, target, nowMs).cooldownRemainingMs;
};

export const ownedObservatoryCastStateForTarget = (
  tiles: Iterable<Tile>,
  me: string,
  target: Tile,
  nowMs: number
): OwnedObservatoryCastState => {
  let earliestPositive: number | undefined;
  let hasInRange = false;
  for (const tile of tiles) {
    if (!tile.observatory || tile.observatory.status !== "active" || tile.ownerId !== me) continue;
    if (tile.fogged) continue;
    if (chebyshevDistanceWrapped(tile.x, tile.y, target.x, target.y) > OBSERVATORY_CAST_RADIUS) continue;
    hasInRange = true;
    const remaining = Math.max(0, (tile.observatory.cooldownUntil ?? 0) - nowMs);
    if (remaining <= 0) return { hasInRange: true, cooldownRemainingMs: 0 };
    if (earliestPositive === undefined || remaining < earliestPositive) earliestPositive = remaining;
  }
  return { hasInRange, cooldownRemainingMs: hasInRange ? (earliestPositive ?? 0) : 0 };
};

export const observatoryBackedAbilityCooldownRemainingMs = (
  castState: OwnedObservatoryCastState,
  syncedAbilityReadyAt: number | undefined,
  nowMs: number
): number => Math.max(castState.cooldownRemainingMs, Math.max(0, (syncedAbilityReadyAt ?? 0) - nowMs));
