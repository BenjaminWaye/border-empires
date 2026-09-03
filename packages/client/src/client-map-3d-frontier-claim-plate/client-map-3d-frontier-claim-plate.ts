import { Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

// Frontier-claim fill: a single empire-color plate that ramps in opacity
// over the claim duration, shown for every neutral EXPAND claim (see
// syncFrontierClaimPlate in client-map-3d.ts) — the player sees the target
// tile filling in with their color as it is claimed. Extracted from
// client-map-3d.ts (over the 500-line file-size limit) to keep that file
// from growing further.
export const createFrontierClaimPlate = (): Mesh => {
  const geometry = new PlaneGeometry(0.94, 0.94);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const plate = new Mesh(geometry, material);
  plate.visible = false;
  plate.frustumCulled = false;
  return plate;
};
