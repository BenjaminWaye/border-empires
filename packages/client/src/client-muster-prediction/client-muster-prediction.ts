import type { Tile } from "../client-types.js";

// Muster accumulation only advances server-side once per sparse tick (or
// less often — see runtime-muster-tick.ts), and the client only learns the
// new amount when that tick's tile delta arrives, so a naive read of
// `muster.amount` holds flat for a long stretch then jumps. This tracks the
// last observed server sample per muster tile and linearly interpolates
// between samples so progress visibly ticks in between, instead of freezing.
//
// Originally lived only in client-capture-effects.ts as
// `extrapolatedMusterAmount` (capture/pending-attack overlay); generalized
// here so the tile menu, manpower panel, and 3D fill ratio all predict from
// one path instead of duplicating (and potentially diverging).
export type MusterRateSample = {
  // The server-reported amount and its `updatedAt` timestamp this sample was
  // anchored on — used only to detect a fresh server sample arriving
  // (`prev.at !== updatedAt`), never to compute elapsed time (see
  // `receivedAt` below).
  amount: number;
  at: number;
  // Local wall-clock time this sample was *received*, i.e. Date.now() at the
  // moment of re-anchoring. Elapsed time for interpolation is measured from
  // here, not from the server's `updatedAt` — anchoring on a server
  // timestamp and diffing against a local clock would corrupt the estimate
  // whenever the client's clock is skewed from the server's. Anchoring
  // locally costs a small, conservative under-count (the network latency
  // between the server computing `updatedAt` and the client receiving it),
  // which is an acceptable trade for never overshooting.
  receivedAt: number;
  ratePerMs: number;
};

export type MusterRateCache = Map<string, MusterRateSample>;

export const createMusterRateCache = (): MusterRateCache => new Map();

/**
 * Predicts a muster flag's current staged amount by interpolating between
 * server samples using its accrual rate.
 *
 * Rate source: prefers the server-computed `muster.ratePerMin` (see
 * tickMuster in apps/simulation) when present; falls back to a rate derived
 * from the last two observed samples otherwise (e.g. a flag that hasn't
 * been through a tick yet, or an older server build that hasn't shipped
 * ratePerMin).
 *
 * Clamping: the predicted amount never exceeds `cap` (the caller decides
 * what cap applies — musterFlagCap for the flag's own ceiling, or a target's
 * `requiredMusterForTarget` for the pending-attack overlay), and never
 * implies drawing down more than `manpowerPool` beyond the last known
 * amount, since further accrual can only come from the player's currently
 * available manpower pool.
 *
 * Ownership: stops predicting (returns the raw server amount, uninterpolated)
 * once `tile.ownerId !== me` — a captured/lost tile's flag is no longer this
 * player's to extrapolate, and capture already emits an immediate
 * authoritative delta to both parties, so there's nothing useful to bridge.
 */
export const predictedMusterAmount = (
  rateByTile: MusterRateCache,
  musterTileKey: string,
  tile: Pick<Tile, "ownerId" | "muster"> | undefined,
  me: string,
  cap: number,
  manpowerPool: number,
  nowMs: number = Date.now()
): number => {
  if (!tile?.muster || tile.ownerId !== me) {
    rateByTile.delete(musterTileKey);
    return tile?.muster?.amount ?? 0;
  }

  const { amount, updatedAt, ratePerMin } = tile.muster;
  const prev = rateByTile.get(musterTileKey);

  if (!prev || prev.at !== updatedAt) {
    // A fresh server sample landed (or this is the first one) — re-anchor.
    // Prefer the server's own rate; fall back to deriving one from the
    // previous sample when the server hasn't supplied ratePerMin.
    const derivedRatePerMs =
      prev && updatedAt > prev.at ? Math.max(0, (amount - prev.amount) / (updatedAt - prev.at)) : 0;
    const ratePerMs = ratePerMin !== undefined ? Math.max(0, ratePerMin) / 60_000 : derivedRatePerMs;
    rateByTile.set(musterTileKey, { amount, at: updatedAt, receivedAt: nowMs, ratePerMs });
    return Math.min(amount, cap);
  }

  const elapsedMs = Math.max(0, nowMs - prev.receivedAt);
  const growthCeiling = Math.min(cap, prev.amount + Math.max(0, manpowerPool));
  return Math.min(growthCeiling, prev.amount + prev.ratePerMs * elapsedMs);
};
