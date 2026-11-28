// Draws the action markers (client-action-markers.ts) over the map: on screen, a pulsing ring on the tile
// and a short label above it; off screen, an arrow at the screen edge pointing toward the tile. Both fade
// together, and tapping the arrow pans the camera there. Like the tip pins (client-map-tip-pins.ts) these are
// DOM elements placed through the frame's projection, so one layer serves the 2D canvas and the true-3D
// renderer; isTrue3DRendererActive picks each renderer's label anchor (pinAnchor).
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { pinAnchor } from "../client-map-tip-pins/client-map-tip-pins.js";
import { centerCameraOnDiscoveryTarget } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { noticesHeld } from "../client-notice-gate/client-notice-gate.js";
import { actionMarkerOpacity, liveActionMarkers, type ShownActionMarker } from "./client-action-markers.js";
import "./client-action-markers.css";

interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }

/** Edge arrows keep this far inside the map's edges (CSS px), clear of the rounded corners. */
export const EDGE_ARROW_INSET_PX = 30;
/** The label clears the pulse ring (44px across) by at least this much. */
const MIN_LABEL_LIFT_PX = 26;

export type EdgeArrowPlacement = { left: number; top: number; angleDeg: number };

/**
 * Where an off-screen tile's arrow sits: on the inset edge of a `width`×`height` view, along the line from
 * the view's centre toward (`sx`, `sy`), turned to point at it.
 */
export const edgeArrowPlacement = (sx: number, sy: number, width: number, height: number, inset = EDGE_ARROW_INSET_PX): EdgeArrowPlacement => {
  const cx = width / 2, cy = height / 2;
  const dx = sx - cx, dy = sy - cy;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const halfW = Math.max(1, cx - inset), halfH = Math.max(1, cy - inset);
  const scale = Math.min(dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx), dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy));
  if (!Number.isFinite(scale)) return { left: cx, top: cy, angleDeg };
  return { left: cx + dx * scale, top: cy + dy * scale, angleDeg };
};

const isOnScreen = (left: number, top: number, width: number, height: number): boolean =>
  Number.isFinite(left) && Number.isFinite(top) && left >= 0 && top >= 0 && left <= width && top <= height;

type MarkerElements = { marker: HTMLDivElement; arrow: HTMLButtonElement };

const createElements = (doc: Document, layer: HTMLElement, shown: ShownActionMarker): MarkerElements => {
  const marker = doc.createElement("div");
  marker.className = "action-marker";
  marker.setAttribute("role", "status");
  const ring = doc.createElement("span");
  ring.className = "action-marker-ring";
  const label = doc.createElement("span");
  label.className = "action-marker-label";
  label.textContent = shown.label;
  marker.append(ring, label);
  const arrow = doc.createElement("button");
  arrow.type = "button";
  arrow.className = "action-marker-arrow";
  arrow.setAttribute("aria-label", `${shown.label}: show on map`);
  // The tap is the arrow's: the tile under it is not selected.
  arrow.onpointerdown = (event) => event.stopPropagation();
  arrow.onclick = (event) => { event.stopPropagation(); centerCameraOnDiscoveryTarget({ x: shown.x, y: shown.y }); };
  layer.append(marker, arrow);
  return { marker, arrow };
};

/** The marker layer over the map canvas; `render` runs every frame with the frame's projection. */
export function createActionMarkerLayer(canvas: HTMLCanvasElement): {
  render: (projection: Projection, mapDrawn?: boolean) => void;
  dispose: () => void;
} {
  const doc = canvas.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "action-marker-layer";
  canvas.parentElement?.append(layer);
  const elements = new Map<number, MarkerElements>();
  return {
    render(projection, mapDrawn = true) {
      const nowMs = Date.now();
      const live = liveActionMarkers(nowMs, noticesHeld(doc, nowMs));
      // Photo mode captures the bare map; the season lobby has no real projection. Markers keep their clock.
      const visible = mapDrawn && !doc.body.classList.contains(PHOTO_MODE_BODY_CLASS) ? live : [];
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const kept = new Set<number>();
      for (const shown of visible) {
        kept.add(shown.id);
        const els = elements.get(shown.id) ?? createElements(doc, layer, shown);
        elements.set(shown.id, els);
        const opacity = actionMarkerOpacity(shown, nowMs).toFixed(3);
        const centre = projection.project(shown.x, shown.y);
        const left = centre.sx * scaleX, top = centre.sy * scaleY;
        if (isOnScreen(left, top, bounds.width, bounds.height)) {
          const labelAt = pinAnchor(projection, shown.x, shown.y, three);
          els.marker.hidden = false;
          els.arrow.hidden = true;
          els.marker.style.left = `${left}px`;
          els.marker.style.top = `${top}px`;
          // The label stands above the ring (and, in 3D, above the models on the tile).
          els.marker.style.setProperty("--label-lift", `${Math.max(MIN_LABEL_LIFT_PX, top - labelAt.sy * scaleY).toFixed(1)}px`);
          els.marker.style.opacity = opacity;
        } else {
          const place = edgeArrowPlacement(left, top, bounds.width, bounds.height);
          els.marker.hidden = true;
          els.arrow.hidden = false;
          els.arrow.style.left = `${place.left}px`;
          els.arrow.style.top = `${place.top}px`;
          els.arrow.style.setProperty("--arrow-angle", `${place.angleDeg.toFixed(1)}deg`);
          els.arrow.style.opacity = opacity;
        }
      }
      for (const [id, els] of elements) {
        if (kept.has(id)) continue;
        els.marker.remove();
        els.arrow.remove();
        elements.delete(id);
      }
    },
    dispose() { elements.clear(); layer.remove(); }
  };
}
