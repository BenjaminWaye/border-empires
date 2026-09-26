// Pan/zoom maths for the strategic map. Pure, so the gesture rules (zoom keeps
// the point under the cursor fixed; the galaxy can never be dragged out of
// reach) are unit-tested without a canvas.
import { MAX_MAP_ZOOM, MIN_MAP_ZOOM, type MapView } from "./client-strategic-map-layout.js";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// The map is a unit disc, so the galaxy's edge is one `scale` from the centre;
// panning may move the centre at most that far.
export const clampView = (view: MapView, fitScale: number): MapView => {
  const zoom = clamp(view.zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const reach = fitScale * zoom;
  return { zoom, panX: clamp(view.panX, -reach, reach), panY: clamp(view.panY, -reach, reach) };
};

// Zooms by `factor` about the screen point (cx, cy), which stays put.
export const zoomAbout = (view: MapView, factor: number, cx: number, cy: number, width: number, height: number, fitScale: number): MapView => {
  const zoom = clamp(view.zoom * factor, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const ratio = zoom / view.zoom;
  const dx = cx - width / 2;
  const dy = cy - height / 2;
  return clampView({ zoom, panX: dx - (dx - view.panX) * ratio, panY: dy - (dy - view.panY) * ratio }, fitScale);
};

// A press that moves less than this is a click, not a drag.
export const DRAG_THRESHOLD_PX = 6;
