import type { ClientState } from "../client-state/client-state.js";
import { crestFor, musterFlagDesignFor } from "../client-cosmetics/client-cosmetics.js";
import { incomingFrontierClaimAt } from "../client-incoming-frontier-claim/client-incoming-frontier-claim.js";
import { drawIncomingAttackOverlay } from "./client-map-render-incoming-attack-overlay.js";
import { drawMusterSiegeBadge } from "./client-map-render-muster-siege-badge.js";

export type IncomingAttackTile = { wx: number; wy: number; px: number; py: number; size: number; resolvesAt: number };

/**
 * 2D canvas: one tile under incoming attack. Draws the attack overlay (with
 * the attacker's frontier-claim progress, if any) and, on your own besieged
 * muster flag, the siege badge pennant in your flag design and crest. Lifted
 * out of client-map-facade.ts unchanged.
 */
export const drawIncomingAttackTile = (
  ctx: CanvasRenderingContext2D,
  state: Pick<ClientState, "incomingAttacksByTile" | "tiles" | "me" | "playerCosmetics">,
  keyFor: (x: number, y: number) => string,
  colorOf: (ownerId: string) => string,
  tile: IncomingAttackTile
): void => {
  const { wx, wy, px, py, size, resolvesAt } = tile;
  const nowMs = Date.now();
  const key = keyFor(wx, wy);
  const claim = incomingFrontierClaimAt(state, key, nowMs);
  const claimOverlay = claim
    ? { color: claim.attackerId ? colorOf(claim.attackerId) : "#8a8f98", progress: (nowMs - claim.startAt) / Math.max(1, claim.resolvesAt - claim.startAt) }
    : undefined;
  drawIncomingAttackOverlay(ctx, wx, wy, px, py, size, resolvesAt, claimOverlay);
  const ownerId = state.tiles.get(key)?.muster?.ownerId;
  if (ownerId !== state.me || resolvesAt <= nowMs) return;
  drawMusterSiegeBadge(
    ctx,
    px,
    py,
    size,
    colorOf(ownerId),
    nowMs,
    musterFlagDesignFor(state, ownerId),
    crestFor(state, ownerId)
  );
};
