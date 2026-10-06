import type { Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import type { ConstructionSite } from "@client/client-construction-phase/client-construction-phase.js";

// The construction stories' stand-in for the owner's AFC: a real AFC placed to the north-west of
// the build site, which is where the phase pods fly from. The same offset is given to the site
// (ConstructionSite's afcOffset), exactly as the game derives it from the owner's AFC tile.
export const STORY_AFC_POSITION = { x: -4.5, z: -3.5 } as const;

export const addStoryAfc = (scene: Scene): { update: (nowMs: number) => void; dispose: () => void } => {
  const afc = createFabricationComplexOverlay(scene, 1);
  afc.addInstance(STORY_AFC_POSITION.x, STORY_AFC_POSITION.z, 0, 5, 5);
  afc.commit();
  return { update: afc.update, dispose: afc.dispose };
};

// Tile offset from a site standing at (siteX, siteZ) to the story AFC.
export const storyAfcOffset = (siteX: number, siteZ: number): { dx: number; dy: number } => ({
  dx: STORY_AFC_POSITION.x - siteX,
  dy: STORY_AFC_POSITION.z - siteZ
});

// `site` with its delivery pods coming from the story AFC (the game attaches the real offset in
// constructionSiteForRebuild).
export const withStoryAfc = (site: ConstructionSite | undefined, siteX: number, siteZ: number): ConstructionSite | undefined =>
  site ? { ...site, afcOffset: storyAfcOffset(siteX, siteZ) } : undefined;
