// Progress-card builders for the two development-queue tiers:
//
// - "queued"  = server-confirmed, capped, durable (see packages/shared/src/dev-queue).
// - "planned" = client-local wishlist entry, not yet confirmed by the server.
//
// Extracted out of client-tile-menu-view.ts (which is already over the
// repo's 500-line file-growth cap) so this module can grow independently.
import type { Tile, TileMenuProgressView } from "../client-types.js";

type QueuedEntryLike = { kind: string; tileKey: string; label?: string; optimisticKind?: string };

export type DevQueueEntryLookupDeps = {
  keyFor: (x: number, y: number) => string;
  queuedDevelopmentEntryForTile: (tileKey: string) => QueuedEntryLike | undefined;
  /** 1-indexed position within its own list (queued or planned), or -1 if not found. */
  queuedSettlementIndexForTile: (tileKey: string) => number;
  queuedEntryIndexForTile: (tileKey: string) => number;
  /** "queued" (server-confirmed) or "planned" (client-local wishlist) -- defaults to "queued" for back-compat. */
  devQueueStateForTile?: (tileKey: string) => "planned" | "queued";
};

const remainingLabelFor = (queueState: "planned" | "queued", index: number): string => {
  if (index < 0) return queueState === "planned" ? "Planned" : "Queued";
  return queueState === "planned" ? `Planned #${index + 1}` : `Queue #${index + 1}`;
};

export const queuedSettlementProgressForTile = (
  tile: Tile,
  deps: DevQueueEntryLookupDeps
): TileMenuProgressView | undefined => {
  const entry = deps.queuedDevelopmentEntryForTile(deps.keyFor(tile.x, tile.y));
  if (!entry || entry.kind !== "SETTLE") return undefined;
  const index = deps.queuedSettlementIndexForTile(entry.tileKey);
  const isFirstInQueue = deps.queuedEntryIndexForTile(entry.tileKey) <= 0;
  const queueState = deps.devQueueStateForTile?.(entry.tileKey) ?? "queued";
  const isPlanned = queueState === "planned";
  return {
    title: isPlanned ? "Settlement planned" : "Settlement queued",
    detail: isPlanned
      ? "Waiting locally for gold/manpower and a free server queue slot before this is submitted."
      : "This frontier tile is confirmed by the server and will settle automatically -- even if you log off.",
    remainingLabel: remainingLabelFor(queueState, index),
    progress: 0,
    note: isPlanned
      ? "Planned actions live only on this device -- they are not durable and can be lost if you close the game before a server slot frees up. Jumping the queue will bump whichever tile is currently last in line back to Planned."
      : "Queued settlements reserve a durable server slot (max 20 per player) and can be cancelled before they start.",
    cancelLabel: isPlanned ? "Remove from plan" : "Cancel queued settlement",
    cancelActionId: "cancel_queued_settlement",
    queueState,
    ...(isFirstInQueue ? {} : { secondaryLabel: "Jump to front of queue", secondaryActionId: "move_queued_entry_to_front" as const })
  };
};

export const queuedBuildProgressForTile = (
  tile: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    queuedDevelopmentEntryForTile: (tileKey: string) => QueuedEntryLike | undefined;
    queuedEntryIndexForTile: (tileKey: string) => number;
    devQueueStateForTile?: (tileKey: string) => "planned" | "queued";
  }
): TileMenuProgressView | undefined => {
  const entry = deps.queuedDevelopmentEntryForTile(deps.keyFor(tile.x, tile.y));
  if (!entry || entry.kind !== "BUILD") return undefined;
  const baseTitle = entry.label?.replace(/\sat\s+\(.+\)$/, "") ?? "Build";
  const isFirstInQueue = deps.queuedEntryIndexForTile(entry.tileKey) <= 0;
  const queueState = deps.devQueueStateForTile?.(entry.tileKey) ?? "queued";
  const isPlanned = queueState === "planned";
  return {
    title: isPlanned ? `${baseTitle} planned` : `${baseTitle} queued`,
    detail: isPlanned
      ? "Waiting locally for a free server queue slot before this is submitted."
      : "This build is confirmed by the server and will start automatically -- even if you log off.",
    remainingLabel: isPlanned ? "Planned" : "Queued",
    progress: 0,
    note: isPlanned
      ? "Planned builds live only on this device until a server queue slot frees up. Jumping the queue will bump whichever tile is currently last in line back to Planned."
      : "Queued builds hold a durable server slot (max 20 per player) and can be cancelled before they start.",
    cancelLabel: isPlanned ? "Remove from plan" : "Cancel queued build",
    cancelActionId: "cancel_queued_build",
    queueState,
    ...(isFirstInQueue ? {} : { secondaryLabel: "Jump to front of queue", secondaryActionId: "move_queued_entry_to_front" as const })
  };
};

// Progress-card builders for the two client-local (non-development) queues:
//
// - waypoint queue (state.waypoint) -- each entry is a destination the
//   empire auto-expands toward; only index 0 is actively being pursued.
// - frontier action queue (state.actionQueue) -- raw FIFO of individual
//   claim/attack targets waiting for their turn to dispatch.
//
// Neither queue is server-durable (unlike developmentQueue), so there is no
// "planned vs queued" split here -- just queue position.
export const queuedWaypointProgressForTile = (
  tile: Tile,
  deps: {
    waypointIndexForTile: (x: number, y: number) => number;
    waypointCount: () => number;
  }
): TileMenuProgressView | undefined => {
  const index = deps.waypointIndexForTile(tile.x, tile.y);
  if (index < 0) return undefined;
  const isFirstInQueue = index === 0;
  const count = deps.waypointCount();
  return {
    title: isFirstInQueue ? "Waypoint active" : "Waypoint queued",
    detail: isFirstInQueue
      ? "This is the active waypoint destination -- the empire auto-claims frontier tiles toward it."
      : "This waypoint destination will be pursued once earlier waypoints are reached or cancelled.",
    remainingLabel: `Queue #${index + 1} of ${count}`,
    progress: 0,
    note: isFirstInQueue
      ? "Waypoints auto-claim frontier tiles toward this destination until it's reached or cancelled."
      : "Jumping the queue moves this waypoint ahead of the others.",
    cancelLabel: "Cancel waypoint",
    cancelActionId: "cancel_queued_waypoint",
    ...(isFirstInQueue ? {} : { secondaryLabel: "Jump to front of queue", secondaryActionId: "move_waypoint_to_front" as const })
  };
};

// "Then: settle" / "then: settle + build" entries queued behind whatever is
// currently active on this tile (usually an in-flight EXPAND capture) --
// see autoSettleTargets/autoBuildTargets and processAutoSettleTargets in
// client-action-flow.ts. Rendered as a small list under the primary
// progress card rather than as its own card, since a tile only ever shows
// one "progress" slot at a time.
export const queuedAutoSettleNextForTile = (
  tile: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    hasAutoSettleTarget: (tileKey: string) => boolean;
    autoBuildStructureLabelForTile: (tileKey: string) => string | undefined;
  }
): TileMenuProgressView["queuedNext"] => {
  const tileKey = deps.keyFor(tile.x, tile.y);
  if (!deps.hasAutoSettleTarget(tileKey)) return undefined;
  const buildLabel = deps.autoBuildStructureLabelForTile(tileKey);
  return [
    {
      title: buildLabel ? `Then: settle + build ${buildLabel}` : "Then: settle",
      detail: buildLabel
        ? "Once this tile is owned, it will automatically settle and start this build."
        : "Once this tile is owned, it will automatically settle.",
      cancelLabel: "Cancel queued settle",
      cancelActionId: "cancel_queued_auto_settle"
    }
  ];
};

export const queuedExpandProgressForTile = (
  tile: Tile,
  deps: {
    actionQueueIndexForTile: (x: number, y: number) => number;
    actionQueueLength: () => number;
  }
): TileMenuProgressView | undefined => {
  const index = deps.actionQueueIndexForTile(tile.x, tile.y);
  if (index < 0) return undefined;
  const isFirstInQueue = index === 0;
  const isAttack = Boolean(tile.ownerId);
  const kindLabel = isAttack ? "attack" : "expansion";
  return {
    title: isFirstInQueue ? `Queued ${kindLabel} -- next up` : `Queued ${kindLabel}`,
    detail: isFirstInQueue
      ? `This ${kindLabel} will be dispatched as soon as the current action finishes.`
      : `Waiting behind ${index} other queued frontier action${index === 1 ? "" : "s"}.`,
    remainingLabel: `Queue #${index + 1} of ${deps.actionQueueLength()}`,
    progress: 0,
    note: `Queued frontier ${kindLabel}s can be cancelled or reprioritized before they start.`,
    cancelLabel: `Cancel queued ${kindLabel}`,
    cancelActionId: "cancel_queued_expand",
    ...(isFirstInQueue ? {} : { secondaryLabel: "Jump to front of queue", secondaryActionId: "move_action_queue_entry_to_front" as const })
  };
};
