import { drawQueuedCornerBadge, queuedCornerBadgeLayout, type QueuedCornerBadgeEntryState } from "./client-queue-badges.js";

export interface QueuedTileBadgeInput {
  px: number;
  py: number;
  size: number;
  isTrue3D: boolean;
  blocked: boolean;
  frontierOrdinal: number | undefined;
  settlementOrdinal: number | undefined;
  buildOrdinal: number | undefined;
  settlementState: QueuedCornerBadgeEntryState;
  buildState: QueuedCornerBadgeEntryState;
}

/** One implementation for the runtime's two tile-projection paths. */
export function drawQueuedTileBadges(ctx: CanvasRenderingContext2D, input: QueuedTileBadgeInput): void {
  const { px, py, size, isTrue3D } = input;
  drawQueuedCornerBadge(ctx, queuedCornerBadgeLayout({
    kind: "FRONTIER", ordinal: input.frontierOrdinal, px, py, size, isTrue3D, blocked: false
  }));
  drawQueuedCornerBadge(ctx, queuedCornerBadgeLayout({
    kind: "SETTLEMENT", ordinal: input.settlementOrdinal, px, py, size, isTrue3D,
    blocked: input.blocked, entryState: input.settlementState
  }));
  drawQueuedCornerBadge(ctx, queuedCornerBadgeLayout({
    kind: "BUILD", ordinal: input.buildOrdinal, px, py, size, isTrue3D,
    blocked: input.blocked, entryState: input.buildState
  }));
}
