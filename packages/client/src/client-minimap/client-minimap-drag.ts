import { computeMiniMapViewBox } from "./client-minimap-view-box.js";
import { miniMapRelicHintAt } from "./client-minimap-relic-hit.js";
import { jumpCameraToTile } from "./client-minimap-camera-jump.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import type { ClientState } from "../client-state/client-state.js";

// Extracted out of client-map-input/client-map-input.ts (at the repo's
// 500-line file cap per AGENTS.md) as part of Workstream F2's mobile
// touch-arrow-gesture wiring, which needed the headroom -- this minimap
// click/drag-to-recenter binding has no relation to F2 itself, it was just
// a self-contained chunk that could move without touching call sites'
// behavior.
//
// A tap on the corner minimap opens the world map (`onTap`, client-world-map.ts); dragging on it pans the view.
// A press on a relic's box still jumps to the relic at once. In the phone map overview (`panOnPress`), where the
// minimap fills the screen, a press pans straight away as before and the overview then closes.

export type MinimapDragDeps = {
  miniMapEl: HTMLElement;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  maybeRefreshForCamera: (force?: boolean) => void;
  /** A tap that neither dragged nor hit a relic box. Without it, a press pans at once. */
  onTap?: () => void;
  /** True while a press must pan at once instead of waiting to see a tap or a drag (the phone map overview). */
  panOnPress?: () => boolean;
};

/** Pointer travel in px under which a press and release count as a tap, not a drag. */
export const MINIMAP_TAP_SLOP_PX = 6;

export const bindMinimapDrag = (state: ClientState, deps: MinimapDragDeps): void => {
  // `onPress`: the first press may land on a relic's box (drawn at the edge when the site is out of view),
  // which jumps to the relic itself; dragging on afterwards pans as usual. `relicOnly`: jump only for a relic.
  const setCameraFromMinimapPointer = (clientX: number, clientY: number, onPress = false, relicOnly = false): boolean => {
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
    if (relicOnly && !relic) return false;
    jumpCameraToTile(state, deps, relic ? relic.x : Math.floor(box.x0 + nx * box.w), relic ? relic.y : Math.floor(box.y0 + ny * box.h));
    return relic !== undefined;
  };

  const panOnPress = (): boolean => !deps.onTap || (deps.panOnPress?.() ?? false);

  // The press in progress: where it started, whether it has become a drag, and whether it jumped to a relic.
  let press: { x: number; y: number; dragging: boolean; relic: boolean } | undefined;
  const startPress = (x: number, y: number): void => {
    const immediate = panOnPress();
    const relic = setCameraFromMinimapPointer(x, y, true, !immediate);
    press = { x, y, dragging: immediate, relic };
  };
  const movePress = (x: number, y: number): void => {
    if (!press) return;
    if (!press.dragging) {
      // Hand jitter during a tap (or a click on a relic box) must not pan.
      if (Math.hypot(x - press.x, y - press.y) < MINIMAP_TAP_SLOP_PX) return;
      press.dragging = true;
    } else if (press.relic && Math.hypot(x - press.x, y - press.y) < MINIMAP_TAP_SLOP_PX) return;
    press.relic = false;
    setCameraFromMinimapPointer(x, y);
  };
  const endPress = (): void => {
    const ended = press;
    press = undefined;
    if (ended && !ended.dragging && !ended.relic) deps.onTap?.();
  };

  deps.miniMapEl.addEventListener("mousedown", (ev) => startPress(ev.clientX, ev.clientY));
  window.addEventListener("mousemove", (ev) => movePress(ev.clientX, ev.clientY));
  window.addEventListener("mouseup", () => endPress());
  deps.miniMapEl.addEventListener(
    "touchstart",
    (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      startPress(t.clientX, t.clientY);
    },
    { passive: true }
  );
  deps.miniMapEl.addEventListener(
    "touchmove",
    (ev) => {
      const t = ev.touches[0];
      if (t) movePress(t.clientX, t.clientY);
    },
    { passive: true }
  );
  deps.miniMapEl.addEventListener("touchend", () => endPress(), { passive: true });
  deps.miniMapEl.addEventListener("touchcancel", () => { press = undefined; }, { passive: true });
};
