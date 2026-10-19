export const isAetherTowerSuppressed = (tower: { suppressedUntil?: number | undefined } | undefined, now: number): boolean =>
  (tower?.suppressedUntil ?? 0) > now;
