import { MAX_ZOOM, MIN_ZOOM } from "./client-constants.js";
import type { initClientDom } from "./client-dom.js";
import type { ClientState } from "./client-state.js";
import type { FeedSeverity, FeedType, Tile } from "./client-types.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type ClientDom = ReturnType<typeof initClientDom>;

type BindClientMapInputDeps = {
  canvas: ClientDom["canvas"];
  miniMapEl: ClientDom["miniMapEl"];
  holdBuildMenuEl: ClientDom["holdBuildMenuEl"];
  tileActionMenuEl: ClientDom["tileActionMenuEl"];
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  keyFor: (x: number, y: number) => string;
  worldTileRawFromPointer: (offsetX: number, offsetY: number) => { gx: number; gy: number };
  computeDragPreview: () => void;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  maybeRefreshForCamera: (force?: boolean) => void;
  handleTileSelection: (wx: number, wy: number, clientX: number, clientY: number) => void;
  cancelOngoingCapture: () => void;
  hideHoldBuildMenu: () => void;
  hideTileActionMenu: () => void;
  clearCrystalTargeting: () => void;
  renderMobilePanels: () => void;
  queueSpecificTargets: (targetKeys: string[], mode: "normal" | "breakthrough") => { queued: number; skipped: number };
  processActionQueue: () => boolean;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  openBulkTileActionMenu: (targetKeys: string[], clientX: number, clientY: number) => void;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  requestAttackPreviewForHover: () => void;
  interactionFlags: { holdActivated: boolean; suppressNextClick: boolean };
};

export const shouldCommitMouseSelection = (args: {
  button: number;
  boxSelectionMode: boolean;
  boxSelectionEngaged: boolean;
  mousePanMoved: boolean;
}): boolean => {
  return args.button === 0 && !args.boxSelectionMode && !args.boxSelectionEngaged && !args.mousePanMoved;
};

export const shouldSelectLoadedTileOnMouseDown = (args: {
  button: number;
  boxSelectionMode: boolean;
  hasPressedTile: boolean;
}): boolean => {
  return args.button === 0 && !args.boxSelectionMode && args.hasPressedTile;
};

export const bindClientMapInput = (state: ClientState, deps: BindClientMapInputDeps): void => {
  const worldTileFromPointer = (offsetX: number, offsetY: number): { wx: number; wy: number } => {
    const raw = deps.worldTileRawFromPointer(offsetX, offsetY);
    return { wx: deps.wrapX(raw.gx), wy: deps.wrapY(raw.gy) };
  };

  const setCameraFromMinimapPointer = (clientX: number, clientY: number): void => {
    const rect = deps.miniMapEl.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const nx = rect.width <= 0 ? 0 : px / rect.width;
    const ny = rect.height <= 0 ? 0 : py / rect.height;
    state.camX = deps.wrapX(Math.floor(nx * WORLD_WIDTH));
    state.camY = deps.wrapY(Math.floor(ny * WORLD_HEIGHT));
    deps.requestViewRefresh(2, true);
    window.setTimeout(() => deps.maybeRefreshForCamera(), 120);
  };

  let minimapDragging = false;
  deps.miniMapEl.addEventListener("mousedown", (ev) => {
    minimapDragging = true;
    setCameraFromMinimapPointer(ev.clientX, ev.clientY);
  });
  window.addEventListener("mousemove", (ev) => {
    if (!minimapDragging) return;
    setCameraFromMinimapPointer(ev.clientX, ev.clientY);
  });
  window.addEventListener("mouseup", () => {
    minimapDragging = false;
  });
  deps.miniMapEl.addEventListener(
    "touchstart",
    (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      setCameraFromMinimapPointer(t.clientX, t.clientY);
    },
    { passive: true }
  );

  deps.canvas.addEventListener("click", (ev) => {
    if (deps.interactionFlags.suppressNextClick) {
      deps.interactionFlags.suppressNextClick = false;
      return;
    }
    const { wx, wy } = worldTileFromPointer(ev.offsetX, ev.offsetY);
    deps.handleTileSelection(wx, wy, ev.clientX, ev.clientY);
  });

  let dragActive = false;
  let dragLastKey = "";
  let boxSelectionEngaged = false;
  let boxSelectionMode = false;
  let mouseSelectionCommittedOnPress = false;
  let mousePanStart: { x: number; y: number; camX: number; camY: number } | undefined;
  let mousePanMoved = false;
  let holdOpenTimer: number | undefined;
  let touchHoldStart: { x: number; y: number } | undefined;
  let touchTapCandidate: { x: number; y: number } | undefined;
  const HOLD_MOVE_CANCEL_PX = 10;
  const TOUCH_TAP_MAX_MOVE_PX = 12;
  const MOUSE_PAN_THRESHOLD_PX = 4;
  const clearHoldOpenTimer = (): void => {
    if (holdOpenTimer !== undefined) window.clearTimeout(holdOpenTimer);
    holdOpenTimer = undefined;
  };
  const scheduleHoldBuildMenu = (_clientX: number, _clientY: number, _offsetX: number, _offsetY: number): void => {
    clearHoldOpenTimer();
    deps.interactionFlags.holdActivated = false;
  };

  deps.canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom + (ev.deltaY > 0 ? -1 : 1)));
  });

  window.addEventListener("keydown", (ev) => {
    const target = ev.target as HTMLElement | null;
    const tagName = target?.tagName;
    const editing = target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
    if (editing) return;

    if (ev.key === "Escape") {
      deps.cancelOngoingCapture();
      deps.hideHoldBuildMenu();
      deps.hideTileActionMenu();
      deps.clearCrystalTargeting();
      return;
    }

    if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const step = ev.shiftKey ? 8 : 3;
      if (ev.key === "ArrowUp") state.camY = deps.wrapY(state.camY - step);
      if (ev.key === "ArrowDown") state.camY = deps.wrapY(state.camY + step);
      if (ev.key === "ArrowLeft") state.camX = deps.wrapX(state.camX - step);
      if (ev.key === "ArrowRight") state.camX = deps.wrapX(state.camX + step);
      deps.maybeRefreshForCamera(true);
    }
  });
  window.addEventListener("mousedown", (ev) => {
    const target = ev.target as Node | null;
    if (!target) return;
    if (deps.holdBuildMenuEl.contains(target) || deps.tileActionMenuEl.contains(target)) return;
    deps.hideHoldBuildMenu();
    deps.hideTileActionMenu();
  });
  window.addEventListener("resize", () => deps.renderMobilePanels());

  deps.canvas.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    dragActive = true;
    mouseSelectionCommittedOnPress = false;
    mousePanMoved = false;
    boxSelectionMode = ev.shiftKey;
    boxSelectionEngaged = false;
    deps.hideHoldBuildMenu();
    mousePanStart = { x: ev.clientX, y: ev.clientY, camX: state.camX, camY: state.camY };
    const raw = deps.worldTileRawFromPointer(ev.offsetX, ev.offsetY);
    const wrapped = { wx: deps.wrapX(raw.gx), wy: deps.wrapY(raw.gy) };
    const pressedTile = state.tiles.get(deps.keyFor(wrapped.wx, wrapped.wy));
    if (boxSelectionMode) {
      state.boxSelectStart = raw;
      state.boxSelectCurrent = raw;
      dragLastKey = deps.keyFor(deps.wrapX(raw.gx), deps.wrapY(raw.gy));
      deps.computeDragPreview();
    } else {
      state.boxSelectStart = undefined;
      state.boxSelectCurrent = undefined;
      state.dragPreviewKeys.clear();
      dragLastKey = "";
    }
    if (
      shouldSelectLoadedTileOnMouseDown({
        button: ev.button,
        boxSelectionMode,
        hasPressedTile: Boolean(pressedTile)
      })
    ) {
      mouseSelectionCommittedOnPress = true;
      mousePanStart = undefined;
      deps.interactionFlags.suppressNextClick = true;
      deps.handleTileSelection(wrapped.wx, wrapped.wy, ev.clientX, ev.clientY);
      clearHoldOpenTimer();
      return;
    }
    if (!boxSelectionMode) scheduleHoldBuildMenu(ev.clientX, ev.clientY, ev.offsetX, ev.offsetY);
    else clearHoldOpenTimer();
  });
  deps.canvas.addEventListener("mousemove", (ev) => {
    if (!dragActive) return;
    if (mouseSelectionCommittedOnPress) return;
    if (!boxSelectionMode && mousePanStart) {
      const dx = ev.clientX - mousePanStart.x;
      const dy = ev.clientY - mousePanStart.y;
      if (Math.abs(dx) > MOUSE_PAN_THRESHOLD_PX || Math.abs(dy) > MOUSE_PAN_THRESHOLD_PX) {
        clearHoldOpenTimer();
        mousePanMoved = true;
        deps.interactionFlags.suppressNextClick = true;
      }
      if (mousePanMoved) {
        state.camX = deps.wrapX(Math.round(mousePanStart.camX - dx / state.zoom));
        state.camY = deps.wrapY(Math.round(mousePanStart.camY - dy / state.zoom));
        deps.maybeRefreshForCamera(false);
      }
      return;
    }
    const raw = deps.worldTileRawFromPointer(ev.offsetX, ev.offsetY);
    const k = deps.keyFor(deps.wrapX(raw.gx), deps.wrapY(raw.gy));
    if (k === dragLastKey) return;
    clearHoldOpenTimer();
    dragLastKey = k;
    boxSelectionEngaged = true;
    state.boxSelectCurrent = raw;
    deps.computeDragPreview();
  });
  window.addEventListener("mouseup", (ev) => {
    clearHoldOpenTimer();
    if (mouseSelectionCommittedOnPress) {
      dragActive = false;
      boxSelectionMode = false;
      boxSelectionEngaged = false;
      mouseSelectionCommittedOnPress = false;
      mousePanStart = undefined;
      mousePanMoved = false;
      dragLastKey = "";
      state.boxSelectStart = undefined;
      state.boxSelectCurrent = undefined;
      state.dragPreviewKeys.clear();
      return;
    }
    if (shouldCommitMouseSelection({
      button: ev.button,
      boxSelectionMode,
      boxSelectionEngaged,
      mousePanMoved
    })) {
      const rect = deps.canvas.getBoundingClientRect();
      const insideCanvas =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      if (insideCanvas) {
        const offsetX = ev.clientX - rect.left;
        const offsetY = ev.clientY - rect.top;
        const { wx, wy } = worldTileFromPointer(offsetX, offsetY);
        deps.interactionFlags.suppressNextClick = true;
        deps.handleTileSelection(wx, wy, ev.clientX, ev.clientY);
      }
    }
    if (dragActive && boxSelectionMode && boxSelectionEngaged) {
      const dragKeys = [...state.dragPreviewKeys];
      if (dragKeys.length > 0) {
        const neutralKeys = dragKeys.filter((k) => {
          const t = state.tiles.get(k);
          return t && t.terrain === "LAND" && !t.fogged && !t.ownerId;
        });
        const enemyKeys = dragKeys.filter((k) => {
          const t = state.tiles.get(k);
          return t && t.terrain === "LAND" && !t.fogged && t.ownerId && t.ownerId !== state.me && !deps.isTileOwnedByAlly(t);
        });
        const ownedYieldKeys = dragKeys.filter((k) => {
          const t = state.tiles.get(k);
          if (!t || t.ownerId !== state.me) return false;
          const y = (t as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
          return Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
        });

        if (neutralKeys.length > 0 && enemyKeys.length === 0 && ownedYieldKeys.length === 0) {
          const out = deps.queueSpecificTargets(neutralKeys, "normal");
          if (out.queued > 0) deps.processActionQueue();
          deps.pushFeed(
            `Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`,
            "combat",
            "info"
          );
        } else {
          deps.openBulkTileActionMenu(dragKeys, ev.clientX, ev.clientY);
        }
      }
      deps.interactionFlags.suppressNextClick = true;
    }
    dragActive = false;
    boxSelectionMode = false;
    boxSelectionEngaged = false;
    mouseSelectionCommittedOnPress = false;
    mousePanStart = undefined;
    mousePanMoved = false;
    dragLastKey = "";
    state.boxSelectStart = undefined;
    state.boxSelectCurrent = undefined;
    state.dragPreviewKeys.clear();
  });
  window.addEventListener("contextmenu", (ev) => {
    const target = ev.target as Node | null;
    if (target && (deps.canvas.contains(target) || deps.tileActionMenuEl.contains(target))) {
      ev.preventDefault();
      deps.hideTileActionMenu();
      deps.hideHoldBuildMenu();
    }
  });

  let touchPanStart: { x: number; y: number; camX: number; camY: number } | undefined;
  let pinchStart: { distance: number; zoom: number } | undefined;

  deps.canvas.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length === 1) {
        const t = ev.touches[0];
        if (!t) return;
        deps.hideHoldBuildMenu();
        touchPanStart = { x: t.clientX, y: t.clientY, camX: state.camX, camY: state.camY };
        touchHoldStart = { x: t.clientX, y: t.clientY };
        touchTapCandidate = { x: t.clientX, y: t.clientY };
        const rect = deps.canvas.getBoundingClientRect();
        scheduleHoldBuildMenu(t.clientX, t.clientY, t.clientX - rect.left, t.clientY - rect.top);
        pinchStart = undefined;
      } else if (ev.touches.length === 2) {
        const a = ev.touches[0];
        const b = ev.touches[1];
        if (!a || !b) return;
        clearHoldOpenTimer();
        touchHoldStart = undefined;
        touchTapCandidate = undefined;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchStart = { distance: d, zoom: state.zoom };
        touchPanStart = undefined;
      }
    },
    { passive: true }
  );

  deps.canvas.addEventListener(
    "touchmove",
    (ev) => {
      if (ev.touches.length === 1 && touchPanStart) {
        const t = ev.touches[0];
        if (!t) return;
        if (touchHoldStart) {
          const moved = Math.hypot(t.clientX - touchHoldStart.x, t.clientY - touchHoldStart.y);
          if (moved > HOLD_MOVE_CANCEL_PX) clearHoldOpenTimer();
          if (moved > TOUCH_TAP_MAX_MOVE_PX) touchTapCandidate = undefined;
        }
        const dx = t.clientX - touchPanStart.x;
        const dy = t.clientY - touchPanStart.y;
        state.camX = deps.wrapX(Math.round(touchPanStart.camX - dx / state.zoom));
        state.camY = deps.wrapY(Math.round(touchPanStart.camY - dy / state.zoom));
        deps.maybeRefreshForCamera(false);
        return;
      }
      if (ev.touches.length === 2 && pinchStart) {
        touchTapCandidate = undefined;
        const a = ev.touches[0];
        const b = ev.touches[1];
        if (!a || !b) return;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const factor = d / Math.max(1, pinchStart.distance);
        state.zoom = Math.max(12, Math.min(MAX_ZOOM, Math.round(pinchStart.zoom * factor)));
      }
    },
    { passive: true }
  );

  deps.canvas.addEventListener(
    "touchend",
    () => {
      if (touchTapCandidate && !deps.interactionFlags.holdActivated && !pinchStart) {
        const rect = deps.canvas.getBoundingClientRect();
        const offsetX = touchTapCandidate.x - rect.left;
        const offsetY = touchTapCandidate.y - rect.top;
        const { wx, wy } = worldTileFromPointer(offsetX, offsetY);
        deps.interactionFlags.suppressNextClick = true;
        deps.handleTileSelection(wx, wy, touchTapCandidate.x, touchTapCandidate.y);
      }
      clearHoldOpenTimer();
      touchHoldStart = undefined;
      touchTapCandidate = undefined;
      touchPanStart = undefined;
      pinchStart = undefined;
    },
    { passive: true }
  );

  deps.canvas.addEventListener("mousemove", (ev) => {
    const size = state.zoom;
    const halfW = Math.floor(deps.canvas.width / size / 2);
    const halfH = Math.floor(deps.canvas.height / size / 2);
    const gx = Math.floor(ev.offsetX / size) - halfW + state.camX;
    const gy = Math.floor(ev.offsetY / size) - halfH + state.camY;
    state.hover = { x: deps.wrapX(gx), y: deps.wrapY(gy) };
    deps.requestAttackPreviewForHover();
  });
};
