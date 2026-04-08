import type { Observatory, TileKey } from "@border-empires/shared";

type ObservatoryCooldownCandidate = Pick<Observatory, "observatoryId" | "tileKey" | "cooldownUntil"> & {
  x: number;
  y: number;
};

export const observatoryCooldownReadyAt = (observatory: Pick<Observatory, "cooldownUntil">): number => observatory.cooldownUntil ?? 0;

export const observatoryProtectionActive = (observatory: Pick<Observatory, "cooldownUntil">, nowMs: number): boolean =>
  observatoryCooldownReadyAt(observatory) <= nowMs;

export const pickReadyObservatoryForTarget = (
  observatories: ObservatoryCooldownCandidate[],
  targetX: number,
  targetY: number,
  nowMs: number,
  distanceBetween: (ax: number, ay: number, bx: number, by: number) => number
): ObservatoryCooldownCandidate | undefined => {
  let best: ObservatoryCooldownCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const observatory of observatories) {
    if (observatoryCooldownReadyAt(observatory) > nowMs) continue;
    const distance = distanceBetween(observatory.x, observatory.y, targetX, targetY);
    if (distance < bestDistance || (distance === bestDistance && observatory.tileKey < (best?.tileKey ?? ""))) {
      best = observatory;
      bestDistance = distance;
    }
  }
  return best;
};

export const soonestObservatoryReadyAt = (
  observatories: Array<Pick<Observatory, "cooldownUntil"> & { tileKey: TileKey }>
): number | undefined => {
  let earliest: number | undefined;
  for (const observatory of observatories) {
    const readyAt = observatoryCooldownReadyAt(observatory);
    if (earliest === undefined || readyAt < earliest) earliest = readyAt;
  }
  return earliest;
};
