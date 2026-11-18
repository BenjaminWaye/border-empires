// Picking a town's build plot on the map (phones): the town screen hides, the
// town's open plots glow, and a tap on the map moves the chosen plot instead
// of selecting a tile. One pick runs at a time, so this is a single slot read
// by the map input (handleTownPlotPlacementTap) and drawn by both renderers
// through the shared picker highlight (refinery-picker-highlight.ts: 2D
// district-canvas.ts, true-3D client-map-3d-placement-overlay.ts). The HUD
// side (client-hud-v2-town-plot-pick.ts) owns starting, confirming and the bar.
import { buildRefineryHighlight, setRefineryPickerHighlight } from "../client-refineries/refinery-picker-highlight.js";

export type TownPlotPlacement = {
  readonly townKey: string;
  readonly actionId: string;
  /** Open plots that can take the building, in support-ring order; never empty while a pick runs. */
  readonly candidates: readonly string[];
  readonly chosenKey: string;
  /** Set by a tap off the glowing plots until the next tap, so the bar can say where to tap. */
  readonly missed?: boolean;
};

/** Body class while a pick runs: the town screen's panels hide and the pick bar shows. */
export const TOWN_PLOT_PICK_BODY_CLASS = "hud-v2-town-plot-picking";

let active: TownPlotPlacement | undefined;
/** Returns false when the pick no longer applies (it then clears itself) and the tap should select as usual. */
type PlotTapHandler = (x: number, y: number) => boolean;
let onTap: PlotTapHandler | undefined;

export const townPlotPlacement = (): TownPlotPlacement | undefined => active;

const syncView = (): void => {
  setRefineryPickerHighlight(active
    ? buildRefineryHighlight([{ keys: active.candidates, tone: "eligible" }, { keys: [active.chosenKey], tone: "site" }])
    : undefined);
  if (typeof document !== "undefined") document.body?.classList.toggle(TOWN_PLOT_PICK_BODY_CLASS, Boolean(active));
};

/** Starts or updates the pick. Without a `tap` handler the pick lets map taps through, so it can never trap them. */
export const setTownPlotPlacement = (next: TownPlotPlacement, tap?: PlotTapHandler): void => {
  active = next;
  if (tap) onTap = tap;
  syncView();
};

/** Ends the pick (confirm, cancel, or the town screen closing); a no-op when none runs. */
export const clearTownPlotPlacement = (): void => {
  if (!active) return;
  active = undefined;
  onTap = undefined;
  syncView();
};

/** Map input: true when a pick took this tap, so it must not select the tile. */
export const handleTownPlotPlacementTap = (x: number, y: number): boolean => {
  if (!active) return false;
  if (onTap?.(x, y)) return true;
  clearTownPlotPlacement();
  return false;
};
