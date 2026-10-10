import type { MountainMassifDeps } from "./client-map-3d-mountain-massif.js";

/** Lookup for tests: every mountain stands alone in temperate country. */
export const LONE_MOUNTAIN_LOOKUP: MountainMassifDeps = {
  isMountainAt: () => false,
  isColdAt: () => false,
  wrapX: (x) => x,
  wrapY: (y) => y
};
