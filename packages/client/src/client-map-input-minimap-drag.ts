import { computeMiniMapViewBox } from "./client-minimap-view-box.js";
import { effectiveFogDisabled } from "./client-map-reveal/client-map-reveal.js";
import type { ClientState } from "./client-state/client-state.js";

// Extracted out of client-map-input/client-map-input.ts (at the repo's
// 500-line file cap per AGENTS.md) as part of Workstream F2's mobile
// touch-arrow-gesture wiring, which needed the headroom -- this minimap
// click/drag-to-recenter binding has no relation to F2 itself, it was just
// a self-contained chunk that could move without touching call sites'
// behavior.

export type MinimapDragDeps = {
  miniMapEl: HTMLElement;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  maybeRefreshForCamera: (force?: boolean) => void;
};

export const bindMinimapDrag = (state: ClientState, deps: MinimapDragDeps): void => {
  const setCameraFromMinimapPointer = (clientX: number, clientY: number): void => {
    const rect = deps.miniMapEl.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const nx = rect.width <= 0 ? 0 : px / rect.width;
    const ny = rect.height <= 0 ? 0 : py / rect.height;
    const box = computeMiniMapViewBox({
      tiles: state.tiles,
      fogDisabled: effectiveFogDisabled(state),
      canvasW: rect.width,
      canvasH: rect.height
    });
    state.camX = deps.wrapX(Math.floor(box.x0 + nx * box.w));
    state.camY = deps.wrapY(Math.floor(box.y0 + ny * box.h));
    state.camSubX = 0;
    state.camSubY = 0;
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
};
