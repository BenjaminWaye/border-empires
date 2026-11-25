import { computeMiniMapViewBox } from "./client-minimap/client-minimap-view-box.js";
import { miniMapRelicHintAt } from "./client-minimap/client-minimap-relic-hit.js";
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
  // `onPress`: the first press may land on a relic's box (drawn at the edge when the site is out of view),
  // which jumps to the relic itself; dragging on afterwards pans as usual.
  const setCameraFromMinimapPointer = (clientX: number, clientY: number, onPress = false): boolean => {
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
    // The minimap canvas draws in device pixels; its 8px edge inset is that many canvas pixels.
    const canvasW = (deps.miniMapEl as Partial<HTMLCanvasElement>).width || rect.width;
    const relic = onPress ? miniMapRelicHintAt(state.relicMapHints.values(), box, rect.width, rect.height, px, py, (8 * rect.width) / canvasW) : undefined;
    state.camX = deps.wrapX(relic ? relic.x : Math.floor(box.x0 + nx * box.w));
    state.camY = deps.wrapY(relic ? relic.y : Math.floor(box.y0 + ny * box.h));
    state.camSubX = 0;
    state.camSubY = 0;
    deps.requestViewRefresh(2, true);
    window.setTimeout(() => deps.maybeRefreshForCamera(), 120);
    return relic !== undefined;
  };

  let minimapDragging = false;
  // Where a press landed on a relic box: hand jitter during that click must not pan back to the edge.
  let relicPress: { x: number; y: number } | undefined;
  deps.miniMapEl.addEventListener("mousedown", (ev) => {
    minimapDragging = true;
    relicPress = setCameraFromMinimapPointer(ev.clientX, ev.clientY, true) ? { x: ev.clientX, y: ev.clientY } : undefined;
  });
  window.addEventListener("mousemove", (ev) => {
    if (!minimapDragging) return;
    if (relicPress && Math.hypot(ev.clientX - relicPress.x, ev.clientY - relicPress.y) < 6) return;
    relicPress = undefined;
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
      setCameraFromMinimapPointer(t.clientX, t.clientY, true);
    },
    { passive: true }
  );
};
