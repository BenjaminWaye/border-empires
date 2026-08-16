import { EXPAND_REVEAL_RADIUS, EXPAND_REVEAL_TTL_MS } from "@border-empires/shared";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

export type PendingExpandReveal = { x: number; y: number; playerId: string; expiresAt: number };

export type ExpandRevealRuntimeInput = {
  now: () => number;
  pendingExpandReveals: PendingExpandReveal[];
  visibilityCoverage: Pick<VisibilityCoverageTracker, "addTemporaryReveal" | "removeTemporaryReveal">;
  visionTransitionCallbacks: VisibilityTransitionCallbacks;
};

/**
 * Fires on every resolved EXPAND (see runtime-lock-resolution.ts): grants the
 * claiming player a one-time EXPAND_REVEAL_TTL_MS vision pulse over
 * EXPAND_REVEAL_RADIUS tiles around the newly-claimed tile, then reverts to
 * normal fog-of-war (the tiles drop to "fogged" — last-known terrain
 * remembered, not blacked back out — same as any other vision loss). Unlike
 * the Watchtower's activation pulse this isn't gated on any tile feature or
 * one-time-per-tile flag — every EXPAND gets one, mirroring the same
 * addTemporaryReveal/removeTemporaryReveal primitive.
 */
export const activateExpandRevealAt = (input: ExpandRevealRuntimeInput, x: number, y: number, playerId: string): void => {
  const expiresAt = input.now() + EXPAND_REVEAL_TTL_MS;
  input.visibilityCoverage.addTemporaryReveal(playerId, x, y, EXPAND_REVEAL_RADIUS, input.visionTransitionCallbacks);
  input.pendingExpandReveals.push({ x, y, playerId, expiresAt });
};

/** Expires any expand reveal pulses whose TTL window has elapsed. */
export const tickExpandReveals = (input: ExpandRevealRuntimeInput, nowMs: number): void => {
  if (input.pendingExpandReveals.length === 0) return;
  const remaining: PendingExpandReveal[] = [];
  for (const entry of input.pendingExpandReveals) {
    if (entry.expiresAt > nowMs) {
      remaining.push(entry);
      continue;
    }
    input.visibilityCoverage.removeTemporaryReveal(entry.playerId, entry.x, entry.y, EXPAND_REVEAL_RADIUS, input.visionTransitionCallbacks);
  }
  input.pendingExpandReveals.length = 0;
  input.pendingExpandReveals.push(...remaining);
};
