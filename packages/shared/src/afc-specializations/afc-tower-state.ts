export const isAetherTowerSuppressed = (tower: { suppressedUntil?: number | undefined } | undefined, now: number): boolean =>
  (tower?.suppressedUntil ?? 0) > now;
/** Resonance Hijack in progress on the target tower; the tower is suppressed until `endsAt`. */
export interface ObservatoryHijack { byPlayerId: string; casterX: number; casterY: number; startedAt: number; endsAt: number }
export const isObservatoryHijackActive = (tower: { hijack?: ObservatoryHijack | undefined } | undefined, now: number): boolean =>
  (tower?.hijack?.endsAt ?? 0) > now;
