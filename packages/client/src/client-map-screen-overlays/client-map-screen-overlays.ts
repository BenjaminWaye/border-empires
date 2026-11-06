import { createAfcMapOverlays } from "../client-afc-upgrades/client-afc-map-overlays.js";
import type { ClientState } from "../client-state/client-state.js";
import { createSalvageReadyToasts } from "../client-salvage-tribute/client-salvage-ready-toasts.js";
import { createTownNameplates } from "../client-town-nameplates/client-town-nameplates.js";

type AfcMapOverlays = ReturnType<typeof createAfcMapOverlays>;
type MapOverlayTiles = Parameters<AfcMapOverlays["render"]>[0];
type MapOverlayProjection = Parameters<AfcMapOverlays["render"]>[1];

/** DOM layers drawn over either map renderer from the frame's visible tiles: town plates under AFC signals and salvage toasts. */
export function createMapScreenOverlays(canvas: HTMLCanvasElement, state: ClientState, openAfcUpgrades: () => void): {
  render: (tiles: MapOverlayTiles, projection: MapOverlayProjection) => void;
} {
  const townNameplates = createTownNameplates(canvas, state);
  const afcMapOverlays = createAfcMapOverlays(canvas, state, openAfcUpgrades);
  const salvageToasts = createSalvageReadyToasts(canvas, state);
  return {
    render(tiles, projection) {
      townNameplates.render(tiles, projection);
      afcMapOverlays.render(tiles, projection);
      salvageToasts.render(tiles, projection);
    }
  };
}
