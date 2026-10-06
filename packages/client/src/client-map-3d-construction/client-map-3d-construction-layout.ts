// Where, within a tile, a construction site's parts stack sits and how far out
// its crew works. The default suits a structure that fills the middle of the tile
// (stack in the back-left corner, crew just outside the scaffold); a structure
// that occupies the corners itself (forts: corner towers) passes its own
// (docs/construction-animation-plan.md, follow-up 2).
export type ConstructionLayout = {
  readonly stackX: number;
  readonly stackZ: number;
  // Radius of the ring the crew works on, around the tile centre.
  readonly workRadius: number;
};

export const DEFAULT_CONSTRUCTION_LAYOUT: ConstructionLayout = { stackX: -0.4, stackZ: -0.4, workRadius: 0.38 };

// Where a delivery pod lands: the middle of the parts stack.
export const stackCenterFor = (layout: ConstructionLayout): { readonly x: number; readonly z: number } => ({
  x: layout.stackX + 0.045,
  z: layout.stackZ + 0.045
});
