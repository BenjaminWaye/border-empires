import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { WATCHTOWER_REVEAL_RADIUS, WATCHTOWER_REVEAL_TTL_MS } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

export type PendingWatchtowerReveal = { tileKey: string; x: number; y: number; playerId: string; expiresAt: number };

export type WatchtowerRevealRuntimeInput = {
  now: () => number;
  tiles: Map<string, DomainTileState>;
  pendingWatchtowerReveals: PendingWatchtowerReveal[];
  visibilityCoverage: Pick<VisibilityCoverageTracker, "addTemporaryReveal" | "removeTemporaryReveal">;
  visionTransitionCallbacks: VisibilityTransitionCallbacks;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

/**
 * Activates a dormant watchtower the first time a player expands onto its
 * tile: flips it to activated, grants that player a one-time temporary
 * vision footprint over the surrounding WATCHTOWER_REVEAL_RADIUS area (via
 * the same enter/leave callback plumbing normal territory vision uses, so
 * the existing FOG-of-war delta broadcast picks it up automatically), and
 * queues its expiry for tickWatchtowerReveals. No-op if the tile has no
 * watchtower or it was already activated (one-time only, never re-fires).
 */
export const activateWatchtowerAt = (
  input: WatchtowerRevealRuntimeInput,
  targetKey: string,
  x: number,
  y: number,
  playerId: string,
  commandId: string
): void => {
  const tile = input.tiles.get(targetKey);
  if (!tile?.watchtower || tile.watchtower.activated) return;
  const revealUntil = input.now() + WATCHTOWER_REVEAL_TTL_MS;
  const updated: DomainTileState = { ...tile, watchtower: { activated: true, activatedByPlayerId: playerId, revealUntil } };
  input.replaceTileState(targetKey, updated, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updated)] });
  input.visibilityCoverage.addTemporaryReveal(playerId, x, y, WATCHTOWER_REVEAL_RADIUS, input.visionTransitionCallbacks);
  input.pendingWatchtowerReveals.push({ tileKey: targetKey, x, y, playerId, expiresAt: revealUntil });
};

/** Expires any watchtower reveal pulses whose 10s window has elapsed. */
export const tickWatchtowerReveals = (input: WatchtowerRevealRuntimeInput, nowMs: number): void => {
  if (input.pendingWatchtowerReveals.length === 0) return;
  const remaining: PendingWatchtowerReveal[] = [];
  for (const entry of input.pendingWatchtowerReveals) {
    if (entry.expiresAt > nowMs) {
      remaining.push(entry);
      continue;
    }
    input.visibilityCoverage.removeTemporaryReveal(entry.playerId, entry.x, entry.y, WATCHTOWER_REVEAL_RADIUS, input.visionTransitionCallbacks);
    const tile = input.tiles.get(entry.tileKey);
    if (tile?.watchtower?.revealUntil) {
      const cleared: DomainTileState = { ...tile, watchtower: { ...tile.watchtower, revealUntil: undefined } };
      input.replaceTileState(entry.tileKey, cleared);
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `watchtower-expire:${entry.tileKey}:${nowMs}`,
        playerId: entry.playerId,
        tileDeltas: [input.tileDeltaFromState(cleared)]
      });
    }
  }
  input.pendingWatchtowerReveals.length = 0;
  input.pendingWatchtowerReveals.push(...remaining);
};
