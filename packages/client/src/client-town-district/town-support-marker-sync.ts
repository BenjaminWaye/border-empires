import { BufferGeometry, type LineBasicMaterial, type LineSegments } from "three";
import type { ClientState } from "../client-state/client-state.js";
import { townSupportPlotEntries, type TownSupportLookupDeps } from "../client-town-support-plot-lookup.js";
import { writeBendingMarkerCorners } from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";

type MarkerDeps = {
  readonly state: Pick<ClientState, "tiles" | "selected" | "me">;
  readonly markers: readonly { marker: LineSegments; material: LineBasicMaterial }[];
  readonly lookup: TownSupportLookupDeps;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly origin: { camX: number; camY: number };
  readonly worldWidth: number; readonly worldHeight: number;
  readonly cornerYAt: (x: number, y: number) => number;
  readonly toroidDelta: (from: number, to: number, size: number) => number;
  readonly rise: number;
};

export const createTownSupportMarkerSync = (deps: MarkerDeps): (() => void) => {
  return (): void => {
    for (const { marker } of deps.markers) marker.visible = false;
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return;
    const selected = deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
    if (!selected?.town) return;
    // SETTLEMENT-tier towns do not project a support area (flat base income; adjacent
    // settled tiles do nothing for them), so drawing a ring here would mislead.
    if (selected.town.populationTier === "SETTLEMENT") return;
    // Reuses townSupportPlotEntries (client-town-support-plot-lookup.ts) -- the same
    // tier-aware, wrap-aware walk the hatch-tile overlay below uses -- instead of a
    // second hand-rolled radius loop that can drift out of sync with it.
    let markerIndex = 0;
    for (const { wx, wy } of townSupportPlotEntries(selected, deps.lookup)) {
      if (markerIndex >= deps.markers.length) return;
      const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
      const { marker, material } = deps.markers[markerIndex]!;
      if (!tile?.ownerId) {
        material.color.set("#f4f7ff");
        material.opacity = 0.45;
      } else if (tile.ownerId !== deps.state.me) {
        material.color.set("#ff6262");
        material.opacity = 0.66;
      } else if (tile.ownershipState === "SETTLED") {
        material.color.set("#9bf274");
        material.opacity = 0.9;
      } else {
        material.color.set("#ffcd5c");
        material.opacity = 0.84;
      }
      const sx = deps.toroidDelta(deps.origin.camX, wx, deps.worldWidth);
      const sy = deps.toroidDelta(deps.origin.camY, wy, deps.worldHeight);
      const wxNext = deps.wrapX(wx + 1);
      const wyNext = deps.wrapY(wy + 1);
      marker.position.set(0, 0, 0);
      writeBendingMarkerCorners(
        marker.geometry as BufferGeometry,
        sx + 0.5, 0, sy + 0.5,
        deps.cornerYAt(wx, wy),
        deps.cornerYAt(wxNext, wy),
        deps.cornerYAt(wx, wyNext),
        deps.cornerYAt(wxNext, wyNext),
        deps.rise
      );
      marker.visible = true;
      markerIndex += 1;
    }
  };
};
