// A tracker row or the phone's "Next ›" points at a tile whose own menu has
// the action (take this town, activate that waystation). Centring and
// selecting the tile alone left the menu shut, so the camera moved with
// nothing saying why. First-15 playtest 2026-11-28: "Next › didn't seem to do
// anything" / "the camera jumped somewhere and I couldn't tell why". The menu
// now opens on the tile, as the Chronicle's Show does. Camera state is shared
// by the 2D and true-3D renderers.

import { focusCamera, screenCentre, type HudV2Deps } from "./client-hud-v2-context.js";

export const focusTileAndOpenMenu = (deps: Pick<HudV2Deps, "state" | "wrapX" | "wrapY" | "requestViewRefresh" | "actionFlow">, x: number, y: number): void => {
  focusCamera(deps, x, y);
  const tile = deps.state.tiles.get(`${deps.wrapX(x)},${deps.wrapY(y)}`);
  if (!tile) return;
  const centre = screenCentre();
  deps.actionFlow.openSingleTileActionMenu(tile, centre.x, centre.y);
};
