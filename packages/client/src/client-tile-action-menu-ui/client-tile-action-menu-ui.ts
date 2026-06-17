import { SETTLE_COST } from "@border-empires/shared";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import { tileMenuRenderSignature } from "../client-tile-menu-render-signature/client-tile-menu-render-signature.js";
import { rememberTileMenuScrollTop, restoreTileMenuScrollTop } from "../client-tile-menu-scroll/client-tile-menu-scroll.js";
import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import type { initClientDom } from "../client-dom.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuTab, TileMenuView } from "../client-types.js";

type ClientDom = ReturnType<typeof initClientDom>;

type TileActionMenuUiDeps = {
  tileActionMenuEl: ClientDom["tileActionMenuEl"];
  viewportSize: () => { width: number; height: number };
  isMobile: () => boolean;
  hideTileActionMenu: () => void;
  tileMenuViewForTile: (tile: Tile) => TileMenuView;
  handleTileAction: (actionId: TileActionDef["id"], targetKeyOverride?: string, originKeyOverride?: string) => void;
  cancelQueuedSettlement: (tileKey: string) => boolean;
  cancelQueuedBuild: (tileKey: string) => boolean;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  applyOptimisticStructureCancel: (x: number, y: number) => void;
  renderHud: () => void;
  requestAttackPreviewForTarget: (tile: Tile) => void;
  keyFor: (x: number, y: number) => string;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  pickOriginForTarget: (
    tx: number,
    ty: number,
    allowAdjacentToDock?: boolean,
    allowOptimisticExpandOrigin?: boolean
  ) => Tile | undefined;
};

export const renderTileActionMenu = (
  state: ClientState,
  view: TileMenuView,
  clientX: number,
  clientY: number,
  deps: TileActionMenuUiDeps
): void => {
  // Injection lives here (not in openSingleTileActionMenu) because
  // renderHud re-renders the open menu on every server tick with a
  // fresh, non-injected view — anchoring the inject here keeps the
  // waypoint actions sticky across those re-renders.
  if (state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) {
      injectWaypointActions(view, menuTile, state, {
        keyFor: deps.keyFor,
        pickOriginForTarget: deps.pickOriginForTarget
      });
    }
  }
  const previousScrollBody = deps.tileActionMenuEl.querySelector<HTMLElement>("[data-tile-menu-scroll]");
  if (previousScrollBody) {
    state.tileActionMenu.scrollTopByTab = rememberTileMenuScrollTop(state.tileActionMenu, previousScrollBody.scrollTop);
  }
  const activeTab = view.tabs.includes(state.tileActionMenu.activeTab) ? state.tileActionMenu.activeTab : (view.tabs[0] ?? "overview");
  state.tileActionMenu.activeTab = activeTab;
  const signature = tileMenuRenderSignature(view, activeTab);
  const shouldReuseRenderedMenu = state.tileActionMenu.visible && state.tileActionMenu.renderSignature === signature;
  if (!shouldReuseRenderedMenu) {
    deps.tileActionMenuEl.innerHTML = tileActionMenuHtml(view, activeTab, deps.isMobile());
    state.tileActionMenu.renderSignature = signature;
  }
  const { width: vw, height: vh } = deps.viewportSize();
  const menuW = Math.min(348, vw - 16);
  deps.tileActionMenuEl.style.width = `${menuW}px`;
  deps.tileActionMenuEl.style.display = "block";
  const renderedHeight = Math.min(deps.tileActionMenuEl.offsetHeight || 360, vh - 90);
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 10));
  const top = Math.max(78, Math.min(vh - renderedHeight - 8, clientY + 8));
  deps.tileActionMenuEl.style.left = `${left}px`;
  deps.tileActionMenuEl.style.top = `${top}px`;
  state.tileActionMenu.visible = true;
  state.tileActionMenu.x = clientX;
  state.tileActionMenu.y = clientY;
  if (!shouldReuseRenderedMenu) {
    const closeBtn = deps.tileActionMenuEl.querySelector<HTMLButtonElement>("#tile-action-close");
    if (closeBtn) closeBtn.onclick = () => deps.hideTileActionMenu();
    const tabButtons = deps.tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-tile-tab]");
    tabButtons.forEach((btn) => {
      btn.onclick = () => {
        const nextTab = btn.dataset.tileTab as TileMenuTab | undefined;
        if (!nextTab) return;
        state.tileActionMenu.activeTab = nextTab;
        if (state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
          const tile = state.tiles.get(state.tileActionMenu.currentTileKey);
          if (tile) renderTileActionMenu(state, deps.tileMenuViewForTile(tile), state.tileActionMenu.x, state.tileActionMenu.y, deps);
        }
      };
    });
    const actionButtons = deps.tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-action]");
    actionButtons.forEach((btn) => {
      btn.onclick = () => {
        const actionId = btn.dataset.action as TileActionDef["id"] | undefined;
        if (!actionId) return;
        deps.handleTileAction(actionId, btn.dataset.targetKey, btn.dataset.originKey);
      };
    });
    const progressButtons = deps.tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-progress-action]");
    progressButtons.forEach((btn) => {
      btn.onclick = () => {
        const tile = state.tileActionMenu.currentTileKey ? state.tiles.get(state.tileActionMenu.currentTileKey) : undefined;
        if (!tile) return;
        if (btn.dataset.progressAction === "cancel_queued_settlement") {
          deps.cancelQueuedSettlement(deps.keyFor(tile.x, tile.y));
          deps.hideTileActionMenu();
          return;
        }
        if (btn.dataset.progressAction === "cancel_queued_build") {
          deps.cancelQueuedBuild(deps.keyFor(tile.x, tile.y));
          deps.hideTileActionMenu();
          return;
        }
        if (btn.dataset.progressAction !== "cancel_structure_build") return;
        if (deps.sendGameMessage({ type: "CANCEL_STRUCTURE_BUILD", x: tile.x, y: tile.y })) {
          deps.applyOptimisticStructureCancel(tile.x, tile.y);
          deps.renderHud();
        }
        deps.hideTileActionMenu();
      };
    });
    const debugButtons = deps.tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-tile-debug-download]");
    debugButtons.forEach((btn) => {
      btn.onclick = () => {
        const tileKey = btn.dataset.tileDebugDownload;
        if (!tileKey) return;
        const tile = state.tiles.get(tileKey);
        const [rawX, rawY] = tileKey.split(",");
        const tileX = Number(rawX);
        const tileY = Number(rawY);
        // Filter the tile-message ring buffer down to entries that touched
        // this tile (or batches whose targets we can't narrow). Helps the
        // recipient diagnose "why is the data still partial?" without us
        // having to chase logs across services.
        const recentMessages = state.recentTileMessages.filter((entry) => {
          if (typeof entry.x === "number" && typeof entry.y === "number") {
            return entry.x === tileX && entry.y === tileY;
          }
          return true;
        });
        const debug = {
          downloadedAt: new Date().toISOString(),
          tileKey,
          location: typeof window !== "undefined" ? window.location?.href : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          viewerPlayerId: state.me,
          fogDisabled: state.fogDisabled,
          tile,
          recentTileMessages: recentMessages
        };
        try {
          const blob = new Blob([JSON.stringify(debug, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `town-debug-${tileKey.replace(",", "-")}-${Date.now()}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (error) {
          console.error("[town-debug] failed to build debug log", error);
        }
      };
    });
    const scrollBody = deps.tileActionMenuEl.querySelector<HTMLElement>("[data-tile-menu-scroll]");
    if (scrollBody) {
      scrollBody.scrollTop = restoreTileMenuScrollTop(state.tileActionMenu.scrollTopByTab, activeTab);
      scrollBody.ontouchstart = (event) => event.stopPropagation();
      scrollBody.ontouchmove = (event) => event.stopPropagation();
      scrollBody.onwheel = (event) => event.stopPropagation();
      scrollBody.onscroll = () => {
        state.tileActionMenu.scrollTopByTab = rememberTileMenuScrollTop(state.tileActionMenu, scrollBody.scrollTop);
      };
    }
  }
};

export const openSingleTileActionMenu = (
  state: ClientState,
  tile: Tile,
  clientX: number,
  clientY: number,
  deps: TileActionMenuUiDeps,
  options: { requestAttackPreview?: boolean; preserveTab?: boolean } = {}
): void => {
  if ((options.requestAttackPreview ?? true) && tile.ownerId && tile.ownerId !== state.me && !deps.isTileOwnedByAlly(tile)) deps.requestAttackPreviewForTarget(tile);
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = deps.keyFor(tile.x, tile.y);
  if (!options.preserveTab) {
    state.tileActionMenu.scrollTopByTab = {};
    state.tileActionMenu.renderSignature = "";
  }
  const view = deps.tileMenuViewForTile(tile);
  injectWaypointActions(view, tile, state, {
    keyFor: deps.keyFor,
    pickOriginForTarget: deps.pickOriginForTarget
  });
  if (!options.preserveTab) state.tileActionMenu.activeTab = view.tabs[0] ?? "overview";
  renderTileActionMenu(state, view, clientX, clientY, deps);
};

export const openBulkTileActionMenu = (
  state: ClientState,
  targetKeys: string[],
  clientX: number,
  clientY: number,
  deps: TileActionMenuUiDeps
): void => {
  if (targetKeys.length === 0) return;
  let neutralCount = 0;
  let enemyCount = 0;
  for (const k of targetKeys) {
    const t = state.tiles.get(k);
    if (!t || t.terrain !== "LAND" || t.fogged) continue;
    if (!t.ownerId) neutralCount += 1;
    else if (t.ownerId !== state.me && !deps.isTileOwnedByAlly(t)) enemyCount += 1;
  }
  const actions: TileActionDef[] = [];
  if (neutralCount > 0) {
    actions.push({ id: "settle_land", label: `Settle Land (${neutralCount})`, cost: `${SETTLE_COST} gold each` });
  }
  if (enemyCount > 0) {
    actions.push({ id: "launch_attack", label: `Launch Attack (${enemyCount})` });
  }
  state.tileActionMenu.mode = "bulk";
  state.tileActionMenu.bulkKeys = targetKeys;
  state.tileActionMenu.currentTileKey = "";
  state.tileActionMenu.activeTab = "actions";
  state.tileActionMenu.scrollTopByTab = {};
  state.tileActionMenu.renderSignature = "";
  renderTileActionMenu(
    state,
    {
      title: "Tile Selection",
      subtitle: `${targetKeys.length} selected`,
      tabs: ["actions"],
      overviewLines: [],
      actions,
      buildings: [],
      crystal: []
    },
    clientX,
    clientY,
    deps
  );
};
