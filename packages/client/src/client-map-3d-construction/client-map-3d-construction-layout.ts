// Where, within a tile, a construction site's parts stack sits. The default suits a
// structure that fills the middle of the tile (stack in the back-left corner); a
// structure that occupies the corners itself (forts: corner towers) passes its own
// (docs/construction-animation-plan.md, follow-up 2).
// `crewSpan` is the side of the centred square the crew wanders in (tile units): the default
// matches the settle overlay's people; a fort keeps its crew inside the walls and clear of the towers.
export type ConstructionLayout = {
  readonly stackX: number;
  readonly stackZ: number;
  readonly crewSpan: number;
};

export const DEFAULT_CONSTRUCTION_LAYOUT: ConstructionLayout = { stackX: -0.4, stackZ: -0.4, crewSpan: 0.84 };

// Forts (client-map-3d-fort-overlay.ts): wall inner faces at 0.38 and corner towers spanning
// 0.30 to 0.46, so the stack sits inside the walls between two towers and the crew stays within
// +/-0.28 (plus half a figure, still short of the towers' 0.30).
export const FORT_CONSTRUCTION_LAYOUT: ConstructionLayout = { stackX: -0.17, stackZ: -0.33, crewSpan: 0.56 };

// Where a delivery pod lands: the middle of the parts stack.
export const stackCenterFor = (layout: ConstructionLayout): { readonly x: number; readonly z: number } => ({
  x: layout.stackX + 0.045,
  z: layout.stackZ + 0.045
});
