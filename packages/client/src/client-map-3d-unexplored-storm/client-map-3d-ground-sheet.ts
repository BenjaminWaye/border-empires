import { PlaneGeometry, type BufferGeometry } from "three";

// The flat, camera-following sheets the fogs are drawn on (the unexplored
// storm and the fogged mist), level with the ground and far wider than the
// view. As one two-triangle quad, their interpolated position lost precision
// on mobile GPUs and jumped between bands of screen rows, breaking the brass
// edge (and the mist's lip under it) into offset segments. Cells this size
// shrink that error ~100x, well under a pixel at play zoom. ~33k triangles
// of trivial vertex work per sheet.
export const GROUND_SHEET_SEGMENTS = 128;

/** A horizontal size x size sheet centred on the origin; position only (the fog shaders read nothing else). */
export const createGroundSheetGeometry = (size: number): BufferGeometry => {
  const geometry = new PlaneGeometry(size, size, GROUND_SHEET_SEGMENTS, GROUND_SHEET_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  return geometry;
};
