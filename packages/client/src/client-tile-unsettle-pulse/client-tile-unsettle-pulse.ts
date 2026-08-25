import type { ClientState } from "../client-state/client-state.js";

// Defensive cap on reachLossPulseQueue in case a frame is skipped (tab
// backgrounded, map not mounted yet) — the queue is drained every render
// frame in the common case, so this only guards against pathological growth.
const REACH_LOSS_PULSE_QUEUE_MAX = 64;

export type TileOwnershipSnapshot = {
  ownerId?: string | undefined;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | undefined;
};

/**
 * True when a tile just unsettled (SETTLED -> FRONTIER) while staying with
 * the SAME owner — the "fell out of reach" signature (a beacon/fort lost or
 * disabled, the reach border retracted around it — see
 * reassessBorderOnAnchorDeactivation in packages/shared/src/reach/reach.ts)
 * as opposed to a capture, where ownerId also changes. Both paths go through
 * the server's identical unsettle transition, so this is a best-effort
 * client-side inference, not a distinct wire signal — good enough for a
 * purely cosmetic pulse.
 */
export const isReachLossUnsettleTransition = (
  previous: TileOwnershipSnapshot | undefined,
  resolved: TileOwnershipSnapshot | undefined
): boolean =>
  Boolean(
    previous?.ownershipState === "SETTLED" &&
      resolved?.ownershipState === "FRONTIER" &&
      resolved.ownerId &&
      previous.ownerId === resolved.ownerId
  );

/** Queues a one-shot collapse-pulse spawn at (x, y), capped defensively. */
export const queueReachLossPulse = (state: ClientState, x: number, y: number): void => {
  if (state.reachLossPulseQueue.length >= REACH_LOSS_PULSE_QUEUE_MAX) return;
  state.reachLossPulseQueue.push({ x, y });
};
