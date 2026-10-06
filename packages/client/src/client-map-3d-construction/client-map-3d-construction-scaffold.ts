import { BoxGeometry, MeshStandardMaterial } from "three";
import type { StructurePieceBuilder } from "../client-map-3d-structure-builder.js";

// Scaffolding cage around a structure that is still being built (or taken
// down): four corner posts plus bars at the current build height, marking the
// footprint of the finished structure. Placed through the shared piece builder
// like any other structure piece; it only changes at phase boundaries, which is
// exactly when the overlay is re-laid-out anyway.
const FOOTPRINT_HALF = 0.3;
const POST_THICKNESS = 0.016;
const BAR_THICKNESS = 0.014;
const TOP_CLEARANCE = 0.05;
// Bars are only worth drawing once the cage is tall enough to have a "mid" level.
const MID_BAR_MIN_HEIGHT = 0.25;

// One site needs 4 posts and up to 2 rings of 4 bars.
export const SCAFFOLD_POSTS_PER_SITE = 4;
export const SCAFFOLD_BARS_PER_SITE = 8;

export type ConstructionScaffold = {
  readonly place: (sceneX: number, surfaceY: number, sceneZ: number, structureHeight: number, visibleBands: number, bands: number) => void;
};

export const registerConstructionScaffold = (builder: StructurePieceBuilder, maxSites: number): ConstructionScaffold => {
  const material = new MeshStandardMaterial({ color: "#4a5058", roughness: 0.6, metalness: 0.55, flatShading: true });
  builder.makeSlot("scaffoldPost", new BoxGeometry(POST_THICKNESS, 1, POST_THICKNESS), material, maxSites * SCAFFOLD_POSTS_PER_SITE);
  builder.makeSlot("scaffoldBar", new BoxGeometry(1, BAR_THICKNESS, BAR_THICKNESS), material, maxSites * SCAFFOLD_BARS_PER_SITE);

  const place: ConstructionScaffold["place"] = (sceneX, surfaceY, sceneZ, structureHeight, visibleBands, bands) => {
    const cut = (structureHeight * visibleBands) / bands;
    const height = cut + TOP_CLEARANCE;
    const span = FOOTPRINT_HALF * 2;
    for (const cx of [-FOOTPRINT_HALF, FOOTPRINT_HALF]) {
      for (const cz of [-FOOTPRINT_HALF, FOOTPRINT_HALF]) {
        builder.addPiece("scaffoldPost", sceneX, surfaceY, sceneZ, cx, height / 2, cz, 1, height, 1);
      }
    }
    const levels = height >= MID_BAR_MIN_HEIGHT ? [height, height / 2] : [height];
    for (const level of levels) {
      for (const edge of [-FOOTPRINT_HALF, FOOTPRINT_HALF]) {
        builder.addPiece("scaffoldBar", sceneX, surfaceY, sceneZ, 0, level, edge, span, 1, 1);
        builder.addPiece("scaffoldBar", sceneX, surfaceY, sceneZ, edge, level, 0, span, 1, 1, Math.PI / 2);
      }
    }
  };

  return { place };
};
