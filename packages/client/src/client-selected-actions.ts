import { COLLECT_VISIBLE_COOLDOWN_MS } from "./client-constants.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

export const hideHoldBuildMenu = (holdBuildMenuEl: HTMLElement): void => {
  holdBuildMenuEl.style.display = "none";
  holdBuildMenuEl.innerHTML = "";
};

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
  state: Pick<ClientState, "selected">,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    deps.pushFeed("Select an owned border/dock tile first.", "error", "warn");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage({ type: "BUILD_FORT", x: selected.x, y: selected.y });
};

export const settleSelected = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: {
    keyFor: (x: number, y: number) => string;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    requestSettlement: (x: number, y: number) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    deps.pushFeed("Select a frontier tile first.", "error", "warn");
    deps.renderHud();
    return;
  }
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    deps.pushFeed("Selected tile is not one of your frontier tiles.", "error", "warn");
    deps.renderHud();
    return;
  }
  if (!deps.requestSettlement(selected.x, selected.y)) return;
  deps.pushFeed(`Settlement started at (${selected.x}, ${selected.y}).`, "combat", "info");
};

export const buildSiegeOutpostOnSelected = (
  state: Pick<ClientState, "selected">,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    deps.pushFeed("Select an owned border tile first.", "error", "warn");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y });
};

export const uncaptureSelected = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: {
    keyFor: (x: number, y: number) => string;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) {
    deps.pushFeed("Select one of your tiles to uncapture.", "error", "warn");
    deps.renderHud();
    return;
  }
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile || tile.ownerId !== state.me) {
    deps.pushFeed("Selected tile is not owned by you.", "error", "warn");
    deps.renderHud();
    return;
  }
  deps.sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
};

export const cancelOngoingCapture = (
  state: Pick<ClientState, "actionQueue" | "queuedTargetKeys" | "dragPreviewKeys">,
  sendGameMessage: (payload: unknown) => boolean
): void => {
  state.actionQueue.length = 0;
  state.queuedTargetKeys.clear();
  state.dragPreviewKeys.clear();
  sendGameMessage({ type: "CANCEL_CAPTURE" });
};

export const collectVisibleYield = (
  state: Pick<ClientState, "collectVisibleCooldownUntil">,
  deps: {
    formatCooldownShort: (ms: number) => string;
    showCollectVisibleCooldownAlert: () => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    applyOptimisticVisibleCollect: () => number;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const remaining = state.collectVisibleCooldownUntil - Date.now();
  if (remaining > 0) {
    deps.showCollectVisibleCooldownAlert();
    deps.pushFeed(`Collect visible cooling down for ${deps.formatCooldownShort(remaining)}.`, "info", "warn");
    deps.renderHud();
    return;
  }
  state.collectVisibleCooldownUntil = Date.now() + COLLECT_VISIBLE_COOLDOWN_MS;
  deps.applyOptimisticVisibleCollect();
  deps.renderHud();
  deps.sendGameMessage({ type: "COLLECT_VISIBLE" });
};

export const collectSelectedYield = (
  state: Pick<ClientState, "selected" | "tiles" | "me">,
  deps: {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    applyOptimisticTileCollect: (tile: Tile) => boolean;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) return;
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") return;
  deps.applyOptimisticTileCollect(tile);
  deps.renderHud();
  deps.sendGameMessage({ type: "COLLECT_TILE", x: selected.x, y: selected.y });
};

export const collectSelectedShard = (
  state: Pick<ClientState, "selected" | "tiles">,
  deps: {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  const selected = state.selected;
  if (!selected) return;
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile?.shardSite || tile.fogged) return;
  state.tiles.set(deps.keyFor(selected.x, selected.y), { ...tile, shardSite: null });
  deps.renderHud();
  deps.sendGameMessage({ type: "COLLECT_SHARD", x: selected.x, y: selected.y });
};
