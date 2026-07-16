// Ports legacy `packages/server/src/ai/intent-latch.ts` to the rewrite.
//
// Why this exists:
//   Legacy AI committed to multi-step plans across ticks via this latch:
//   "I'm doing X, target tile Y, until time T, unless my territory shape
//   changes (territoryVersion bump) or my target stops being valid." The
//   latch also reserves the target tile between AIs so two of them don't
//   both spend their gold trying to claim the same neutral land.
//
//   The Phase-3 worker-thread split ported the GOAP planner but not the
//   latch, so rewrite AIs replanned every 250ms with no memory of "I'm
//   already doing this" and could clobber each other's frontier targets.
//
//   Rewrite reuses `tileCollectionVersion` (per-player monotonic counter
//   incremented in `runtime.ts:markPlannerPlayerTileCollectionDirty`) as
//   the equivalent of legacy's territoryVersion — same shape, same
//   semantics, already wired through `PlannerPlayerView.tileCollectionVersion`.

export type AiLatchedIntentKind = "frontier" | "structure";

export type AiLatchedIntent = {
  playerId: string;
  actionKey: string;
  kind: AiLatchedIntentKind;
  startedAt: number;
  wakeAt: number;
  territoryVersion: number;
  targetTileKey?: string;
  originTileKey?: string;
};

export type AiTargetReservation = {
  playerId: string;
  actionKey: string;
  tileKey: string;
  createdAt: number;
  wakeAt: number;
};

export type AiIntentLatchState = {
  intentsByPlayer: Map<string, AiLatchedIntent>;
  reservationsByTile: Map<string, AiTargetReservation>;
};

export type AiLatchedIntentProbe =
  | { status: "none" }
  | { status: "waiting"; intent: AiLatchedIntent }
  | { status: "expired" | "invalidated"; reason: string };

export const createAiIntentLatchState = (): AiIntentLatchState => ({
  intentsByPlayer: new Map(),
  reservationsByTile: new Map()
});

const clearExpiredReservation = (
  state: AiIntentLatchState,
  tileKey: string,
  nowMs: number
): AiTargetReservation | undefined => {
  const reservation = state.reservationsByTile.get(tileKey);
  if (!reservation) return undefined;
  if (reservation.wakeAt > nowMs) return reservation;
  state.reservationsByTile.delete(tileKey);
  return undefined;
};

export const releaseAiLatchedIntent = (state: AiIntentLatchState, playerId: string): void => {
  const existing = state.intentsByPlayer.get(playerId);
  if (existing?.targetTileKey) {
    const reservation = state.reservationsByTile.get(existing.targetTileKey);
    if (reservation?.playerId === playerId) {
      state.reservationsByTile.delete(existing.targetTileKey);
    }
  }
  state.intentsByPlayer.delete(playerId);
};

export const clearAllAiLatchedIntents = (state: AiIntentLatchState): void => {
  state.intentsByPlayer.clear();
  state.reservationsByTile.clear();
};

export const reserveAiTarget = (
  state: AiIntentLatchState,
  reservation: AiTargetReservation,
  nowMs: number
): boolean => {
  const existing = clearExpiredReservation(state, reservation.tileKey, nowMs);
  if (existing && existing.playerId !== reservation.playerId) return false;
  state.reservationsByTile.set(reservation.tileKey, reservation);
  return true;
};

export const latchAiIntent = (state: AiIntentLatchState, intent: AiLatchedIntent): void => {
  releaseAiLatchedIntent(state, intent.playerId);
  state.intentsByPlayer.set(intent.playerId, intent);
};

export const reservationHeldByOtherAi = (
  state: AiIntentLatchState,
  playerId: string,
  tileKey: string,
  nowMs: number
): boolean => {
  const reservation = clearExpiredReservation(state, tileKey, nowMs);
  return Boolean(reservation && reservation.playerId !== playerId);
};

export const probeAiLatchedIntent = (
  state: AiIntentLatchState,
  {
    playerId,
    nowMs,
    territoryVersion,
    targetStillValid
  }: {
    playerId: string;
    nowMs: number;
    territoryVersion: number;
    targetStillValid?: (intent: AiLatchedIntent) => boolean;
  }
): AiLatchedIntentProbe => {
  const intent = state.intentsByPlayer.get(playerId);
  if (!intent) return { status: "none" };
  if (intent.wakeAt <= nowMs) {
    releaseAiLatchedIntent(state, playerId);
    return { status: "expired", reason: "wake_window_elapsed" };
  }
  if (intent.territoryVersion !== territoryVersion) {
    releaseAiLatchedIntent(state, playerId);
    return { status: "invalidated", reason: "territory_version_changed" };
  }
  if (intent.targetTileKey && reservationHeldByOtherAi(state, playerId, intent.targetTileKey, nowMs)) {
    releaseAiLatchedIntent(state, playerId);
    return { status: "invalidated", reason: "target_reserved_by_other_ai" };
  }
  if (targetStillValid && !targetStillValid(intent)) {
    releaseAiLatchedIntent(state, playerId);
    return { status: "invalidated", reason: "target_no_longer_valid" };
  }
  return { status: "waiting", intent };
};
