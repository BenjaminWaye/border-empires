import { cancelUnsentMusterTransits } from "../client-muster-transit/client-muster-transit.js";
import { gatewayBuildWirePayload } from "../client-queue-logic/client-queue-logic.js";
import { visibleShardSiteForTile } from "../client-shard-rain-pings/client-shard-rain-pings.js";
import { showVisibleActionWarning, type VisibleActionWarningDeps } from "../client-visible-action-warning.js";
import { showShardCollectOverlay } from "../client-shard-collect/client-shard-collect.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const notifySelectedActionBlocked = (deps: SelectedActionDepsBase, title: string, detail: string): void => {
  showVisibleActionWarning(deps, title, detail, "error");
};
type SelectedActionDepsBase = VisibleActionWarningDeps;

export const hideTileActionMenu = (
  state: Pick<ClientState, "tileActionMenu">,
  tileActionMenuEl: HTMLElement
): void => {
  state.tileActionMenu.visible = false;
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = "";
  state.tileActionMenu.activeTab = "overview";
  state.tileActionMenu.renderSignature = "";
  tileActionMenuEl.style.display = "none";
  tileActionMenuEl.innerHTML = "";
};

export const buildFortOnSelected = (
  state: Pick<ClientState, "selected" | "tiles">,
  deps: SelectedActionDepsBase & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    notifySelectedActionBlocked(deps, "Action blocked", "Select an owned border/dock tile first.");
    deps.renderHud();
    return;
  }
  if (state.tiles.get(deps.keyFor(selected.x, selected.y))?.fogged) {
    notifySelectedActionBlocked(deps, "Action blocked", "Selected tile is not currently visible.");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage(gatewayBuildWirePayload({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "FORT" }));
};

export const settleSelected = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: SelectedActionDepsBase & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    requestSettlement: (x: number, y: number) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    notifySelectedActionBlocked(deps, "Settlement blocked", "Select a frontier tile first.");
    deps.renderHud();
    return;
  }
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile || tile.fogged || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    notifySelectedActionBlocked(deps, "Settlement blocked", "Selected tile is not one of your frontier tiles.");
    deps.renderHud();
    return;
  }
  if (!deps.requestSettlement(selected.x, selected.y)) return;
};

export const buildSiegeOutpostOnSelected = (
  state: Pick<ClientState, "selected" | "tiles">,
  deps: SelectedActionDepsBase & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    notifySelectedActionBlocked(deps, "Action blocked", "Select an owned border tile first.");
    deps.renderHud();
    return;
  }
  if (state.tiles.get(deps.keyFor(selected.x, selected.y))?.fogged) {
    notifySelectedActionBlocked(deps, "Action blocked", "Selected tile is not currently visible.");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage(gatewayBuildWirePayload({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "SIEGE_OUTPOST" }));
};

export const uncaptureSelected = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: SelectedActionDepsBase & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    notifySelectedActionBlocked(deps, "Action blocked", "Select one of your tiles to uncapture.");
    deps.renderHud();
    return;
  }
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile || tile.fogged || tile.ownerId !== state.me) {
    notifySelectedActionBlocked(deps, "Action blocked", tile?.fogged ? "Selected tile is not currently visible." : "Selected tile is not owned by you.");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
};

export const cancelOngoingCapture = (
  state: Pick<
    ClientState,
    | "actionQueue"
    | "queuedTargetKeys"
    | "dragPreviewKeys"
    | "musterTransitByTile"
    | "deferredAttackByTile"
    | "actionInFlight"
    | "actionCurrent"
    | "actionTargetKey"
    | "capture"
    | "pendingMusterAttacks"
  >,
  sendGameMessage: (payload: unknown) => boolean
): void => {
  // Still just mustering (parked, nothing sent to the server yet): drop
  // the most-recently-queued target — the one the mustering overlay is
  // currently showing — so the flag stops waiting on it. The flag itself,
  // and any manpower already staged on it, is left alone; "Clear Muster"
  // (a separate tile action) is how a player drains it entirely.
  if (!state.capture && state.pendingMusterAttacks.length > 0) {
    state.pendingMusterAttacks = state.pendingMusterAttacks.slice(0, -1);
    return;
  }
  state.actionQueue.length = 0;
  state.queuedTargetKeys.clear();
  state.dragPreviewKeys.clear();
  // Muster-fed attacks still marching (not yet sent to the server) are
  // purely local — cancel all of them immediately rather than just the
  // most recently armed one, since independent flags may each be at a
  // different point in their transit.
  if (cancelUnsentMusterTransits(state)) {
    state.capture = undefined;
    state.actionInFlight = false;
    state.actionCurrent = undefined;
    state.actionTargetKey = "";
  }
  // Anything already sent (a fired muster attack awaiting resolution, or
  // any other in-flight capture) is a real server-side lock — cancelled
  // via CANCEL_CAPTURE, which is harmless to send even if nothing is active.
  sendGameMessage({ type: "CANCEL_CAPTURE" });
};

// Hides the capture overlay for the currently-displayed instance without
// cancelling anything underneath it — the mustering flag keeps
// accumulating, or the in-flight capture keeps resolving, either way.
// Mirrors cancelOngoingCapture's phase check: while still parked
// (state.capture undefined), dismiss the pending muster attack the overlay
// is showing; once it's actually fired, dismiss the capture itself.
export const dismissOngoingCapture = (
  state: Pick<ClientState, "capture" | "pendingMusterAttacks" | "dismissedCaptureStartAt">
): void => {
  if (!state.capture && state.pendingMusterAttacks.length > 0) {
    // dismissed lives on the entry itself (see pendingMusterAttacks' type in
    // client-state.ts) so it clears for free once the entry is cancelled or
    // promoted — no separate keyed field to keep in sync.
    state.pendingMusterAttacks[state.pendingMusterAttacks.length - 1]!.dismissed = true;
    return;
  }
  state.dismissedCaptureStartAt = state.capture?.startAt;
};

export const collectSelectedYield = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: SelectedActionDepsBase & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    applyOptimisticTileCollect: (tile: Tile) => boolean;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) return;
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (tile?.fogged) {
    notifySelectedActionBlocked(deps, "Action blocked", "Selected tile is not currently visible.");
    deps.renderHud();
    return;
  }
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") return;
  deps.applyOptimisticTileCollect(tile);
  deps.renderHud();
  deps.sendGameMessage({ type: "COLLECT_TILE", x: selected.x, y: selected.y });
};

export const collectSelectedShard = (
  state: Pick<ClientState, "selected" | "tiles" | "shardRainPingsByTile" | "pendingShardCollect">,
  deps: {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) return;
  const tileKey = deps.keyFor(selected.x, selected.y);
  const tile = state.tiles.get(tileKey);
  const shardSite = visibleShardSiteForTile(tile, state.shardRainPingsByTile);
  if (!tile || !shardSite) return;
  state.pendingShardCollect = { tileKey, shardSite };
  state.tiles.set(tileKey, { ...tile, shardSite: null });
  deps.renderHud();
  if (!deps.sendGameMessage({ type: "COLLECT_SHARD", x: selected.x, y: selected.y })) {
    state.tiles.set(tileKey, { ...tile, shardSite });
    state.pendingShardCollect = undefined;
    deps.renderHud();
    return;
  }
  showShardCollectOverlay({ kind: shardSite.kind, amount: shardSite.amount });
};
