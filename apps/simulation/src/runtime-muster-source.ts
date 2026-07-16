import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

/** State {@link resolveMusterSource} reads to find an eligible muster tile. */
export type RuntimeMusterSourceContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  musterTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  musterReservedByKey: ReadonlyMap<string, number>;
};

/**
 * Find a tile owned by `actorId` with at least `requiredMuster` available
 * manpower, preferring (in order): the origin tile itself, `preferredKey`
 * (already distance-verified by the advance-system BFS), then the nearest
 * eligible muster tile within Chebyshev distance 10 (world-wrapped).
 */
export function resolveMusterSource(
  actorId: string,
  originKey: string,
  requiredMuster: number,
  preferredKey: string | undefined,
  context: RuntimeMusterSourceContext
): { sourceKey: string; available: number } | undefined {
  const { tiles, musterTilesByOwner, musterReservedByKey } = context;
  const origin = tiles.get(originKey);
  if (!origin) return undefined;

  // Fast path: origin tile's own muster suffices.
  if (origin.muster?.ownerId === actorId) {
    const reserved = musterReservedByKey.get(originKey) ?? 0;
    const available = origin.muster.amount - reserved;
    if (available >= requiredMuster) return { sourceKey: originKey, available };
  }

  // Advance-system preferred key: skip distance check since the BFS
  // already verified connectivity through owned territory.
  if (preferredKey && preferredKey !== originKey) {
    const preferred = tiles.get(preferredKey);
    if (preferred?.muster?.ownerId === actorId) {
      const reserved = musterReservedByKey.get(preferredKey) ?? 0;
      const available = preferred.muster.amount - reserved;
      if (available >= requiredMuster) return { sourceKey: preferredKey, available };
    }
  }

  const musterKeys = musterTilesByOwner.get(actorId);
  if (!musterKeys) return undefined;

  let bestKey: string | undefined;
  let bestDist = Infinity;

  for (const tileKey of musterKeys) {
    if (tileKey === originKey) continue; // already checked above
    if (tileKey === preferredKey) continue; // already checked above
    const tile = tiles.get(tileKey);
    if (!tile?.muster || tile.muster.ownerId !== actorId) continue;
    const reserved = musterReservedByKey.get(tileKey) ?? 0;
    const available = tile.muster.amount - reserved;
    if (available < requiredMuster) continue;

    // Chebyshev distance with world wrapping.
    const dx = Math.min(Math.abs(tile.x - origin.x), WORLD_WIDTH - Math.abs(tile.x - origin.x));
    const dy = Math.min(Math.abs(tile.y - origin.y), WORLD_HEIGHT - Math.abs(tile.y - origin.y));
    const dist = Math.max(dx, dy);
    if (dist <= 10 && dist < bestDist) {
      bestDist = dist;
      bestKey = tileKey;
    }
  }

  if (!bestKey) return undefined;
  const tile = tiles.get(bestKey)!;
  const reserved = musterReservedByKey.get(bestKey) ?? 0;
  return { sourceKey: bestKey, available: tile.muster!.amount - reserved };
}
