import { MeshStandardMaterial } from "three";

/** Clean, even gray with a matte response for the compact study. */
export const createFishStudyApronMaterial = (): { material: MeshStandardMaterial; dispose: () => void } => {
  const material = new MeshStandardMaterial({ color: "#858880", roughness: 0.94 });
  return { material, dispose: () => material.dispose() };
};
