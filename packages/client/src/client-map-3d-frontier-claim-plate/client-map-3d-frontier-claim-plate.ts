import { Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

// Frontier-claim fill: an empire-color plate that ramps in opacity over the
// claim duration, shown for every neutral EXPAND claim -- both this client's
// own manually-dispatched claim and any of its muster flags' ADVANCE/MARCH
// auto-fired EXPANDs (see syncFrontierClaimPlates in
// client-map-3d-capture-overlays.ts). A pool rather than a single mesh:
// any number of muster flags can be auto-expanding onto neutral ground
// concurrently, on top of this client's own manual claim, so one shared mesh
// tied to the single state.capture slot could only ever show one of them at
// a time. Extracted from client-map-3d.ts (over the 500-line file-size
// limit) to keep that file from growing further.
const createFrontierClaimPlate = (): Mesh => {
  const geometry = new PlaneGeometry(0.94, 0.94);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const plate = new Mesh(geometry, material);
  plate.visible = false;
  plate.frustumCulled = false;
  return plate;
};

// Generous headroom above what's actually likely to be claiming
// simultaneously (this client's own claim plus its muster flags' cap --
// see MARCH_TARGET_CAP's matching comment) -- a claim beyond this cap
// simply renders no plate rather than this ever being load-bearing for
// correctness.
export const FRONTIER_CLAIM_PLATE_CAP = 12;

export const createFrontierClaimPlatePool = (): Mesh[] =>
  Array.from({ length: FRONTIER_CLAIM_PLATE_CAP }, () => {
    const plate = createFrontierClaimPlate();
    plate.renderOrder = 7;
    return plate;
  });

export const disposeFrontierClaimPlatePool = (plates: readonly Mesh[]): void => {
  for (const plate of plates) {
    plate.geometry.dispose();
    (plate.material as MeshBasicMaterial).dispose();
  }
};
