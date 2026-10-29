import { aetherTowerNextShotAt, relicCastRadius, isAetherTowerSuppressed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { ownObservatoryMaxShots, ownObservatoryRange, type ObservatoryProgressionState } from "../client-observatory-rules/client-observatory-rules.js";

const wrappedDelta = (a: number, b: number, size: number): number => Math.min(Math.abs(a - b), size - Math.abs(a - b));

export const chebyshevDistanceWrapped = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(wrappedDelta(ax, bx, WORLD_WIDTH), wrappedDelta(ay, by, WORLD_HEIGHT));

type ObservatoryViewWithCooldown = NonNullable<Tile["observatory"]> & { cooldownUntil?: number };

export const observatoryProtectionActive = (tile: Pick<ObservatoryViewWithCooldown, "cooldownUntil" | "suppressedUntil">, nowMs: number): boolean =>
  (tile.cooldownUntil ?? 0) <= nowMs && !isAetherTowerSuppressed(tile, nowMs);

export const readyOwnedObservatoryCooldownRemainingMs = (
  tiles: Iterable<Tile>,
  me: string,
  target: Tile,
  nowMs: number,
  castRadius: number,
  // Shots each of `me`'s towers holds; omitted, readiness falls back to cooldownUntil.
  maxShots?: number
): number => {
  let earliestPositive: number | undefined;
  let hasInRange = false;
  for (const tile of tiles) {
    if (!tile.observatory || tile.observatory.status !== "active" || tile.ownerId !== me) continue;
    if (tile.fogged) continue;
    if (isAetherTowerSuppressed(tile.observatory, nowMs)) continue;
    if (tile.observatory.siphon) continue; // locked into Siphon until cancelled — can't cast anything else
    if (chebyshevDistanceWrapped(tile.x, tile.y, target.x, target.y) > relicCastRadius(tile.naturalWonder, castRadius)) continue;
    hasInRange = true;
    const readyAt = maxShots === undefined ? (tile.observatory.cooldownUntil ?? 0) : aetherTowerNextShotAt(tile.observatory, maxShots, nowMs);
    const remaining = Math.max(0, readyAt - nowMs);
    if (remaining <= 0) return 0;
    if (earliestPositive === undefined || remaining < earliestPositive) earliestPositive = remaining;
  }
  if (!hasInRange) return 0;
  return earliestPositive ?? 0;
};

/**
 * Ms until one of the local player's towers in range of `target` has a shot
 * (0 when one has a shot now, or none is in range) -- the same shot rule the
 * simulation's pickReadyOwnedObservatoryForTarget applies.
 */
export const ownTowerReadyInMs = (
  state: ObservatoryProgressionState & { readonly tiles: { values(): Iterable<Tile> }; readonly me: string },
  target: Tile,
  nowMs: number
): number => readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, target, nowMs, ownObservatoryRange(state), ownObservatoryMaxShots(state));

/** Ms until the local player's own tower on `tower` has a shot again (0 when it has one). */
export const ownTowerShotReadyInMs = (state: { readonly domainIds?: readonly string[] | undefined }, tower: Tile, nowMs: number): number =>
  tower.observatory ? Math.max(0, aetherTowerNextShotAt(tower.observatory, ownObservatoryMaxShots(state), nowMs) - nowMs) : 0;
