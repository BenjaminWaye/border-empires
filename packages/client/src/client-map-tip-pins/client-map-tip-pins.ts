// "!" pins on the map for discovery tips and town-survey clues, at the tile each one is about. They replace
// cards that opened on their own over the map: players found those got in the way of play (owner,
// 2026-11-21). Tapping a pin opens its card. The pins are DOM buttons over the canvas, placed through the
// frame's projection, so one layer serves both the 2D canvas and the true-3D renderer
// (isTrue3DRendererActive picks each renderer's anchor point).
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { DISCOVERY_TIPS } from "../client-discovery-tips/client-discovery-tips.js";
import { discoveryTipPins, openDiscoveryTipPin } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { occupationSurveyController, occupationSurveyResourceLabel } from "../client-occupation-survey.js";
import "./client-map-tip-pins.css";

interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }

/** One pin: where it stands, what its button says to a screen reader, and what a tap opens. */
export interface MapTipPin { readonly key: string; readonly x: number; readonly y: number; readonly label: string; readonly kind: "tip" | "survey"; readonly open: () => void }

/** Every pin to draw: queued discovery tips with a tile, then unacknowledged survey clues (at most three). */
export const mapTipPins = (): MapTipPin[] => [
  ...discoveryTipPins().map((pin): MapTipPin => ({ key: `tip:${pin.id}`, x: pin.x, y: pin.y, kind: "tip", label: `Tip: ${DISCOVERY_TIPS[pin.id].title}`, open: () => openDiscoveryTipPin(pin.id) })),
  ...occupationSurveyController.pendingReports().map((report): MapTipPin => ({
    key: `survey:${report.id}`, x: report.x, y: report.y, kind: "survey",
    label: `Town survey: signs of ${occupationSurveyResourceLabel(report.resource)} nearby`,
    open: () => occupationSurveyController.open(report.id)
  }))
];

/** Screen point for a pin's tip: above the tile centre, clear of 3D models. Exported for tests. */
export const pinAnchor = (projection: Projection, x: number, y: number, three: boolean): { sx: number; sy: number } => {
  const at = projection.project(x, y);
  // 2D projects a tile's top-left corner; 3D projects its centre on the ground.
  return three ? { sx: at.sx, sy: at.sy - Math.max(22, projection.size * 1.4) } : { sx: at.sx + projection.size / 2, sy: at.sy + projection.size * 0.2 };
};

const isPhotoModeOn = (doc: Document): boolean => doc.body.classList.contains(PHOTO_MODE_BODY_CLASS);

/** The pin layer over the map canvas; `render` runs every frame with the frame's projection. */
export function createMapTipPins(canvas: HTMLCanvasElement, pinsFor: () => readonly MapTipPin[] = mapTipPins): {
  render: (projection: Projection) => void;
  dispose: () => void;
} {
  const doc = canvas.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "map-tip-pin-layer";
  canvas.parentElement?.append(layer);
  const buttons = new Map<string, HTMLButtonElement>();
  return {
    render(projection) {
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const shown = new Set<string>();
      // Photo mode captures the bare map, and a hidden pin must not catch a tap meant for the map.
      for (const pin of isPhotoModeOn(doc) ? [] : pinsFor()) {
        const at = pinAnchor(projection, pin.x, pin.y, three);
        const left = at.sx * scaleX, top = at.sy * scaleY;
        if (!Number.isFinite(left) || !Number.isFinite(top) || left < 0 || top < 0 || left > bounds.width || top > bounds.height) continue;
        shown.add(pin.key);
        let button = buttons.get(pin.key);
        if (!button) {
          button = doc.createElement("button");
          button.type = "button";
          button.className = `map-tip-pin is-${pin.kind}`;
          button.textContent = "!";
          button.dataset.pin = pin.key;
          // The tap is the pin's: the tile under it is not selected.
          button.onpointerdown = (event) => event.stopPropagation();
          layer.append(button);
          buttons.set(pin.key, button);
        }
        const open = pin.open;
        button.onclick = (event) => { event.stopPropagation(); open(); };
        if (button.getAttribute("aria-label") !== pin.label) button.setAttribute("aria-label", pin.label);
        if (button.style.left !== `${left}px`) button.style.left = `${left}px`;
        if (button.style.top !== `${top}px`) button.style.top = `${top}px`;
      }
      for (const [key, button] of buttons) if (!shown.has(key)) { button.remove(); buttons.delete(key); }
    },
    dispose() { buttons.clear(); layer.remove(); }
  };
}
