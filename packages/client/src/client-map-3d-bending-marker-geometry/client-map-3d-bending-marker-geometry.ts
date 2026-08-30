// A bending tile-outline marker: 4 line segments connecting the four
// tile corners with each corner's actual rendered Y, so the outline
// bows along with the heightfield surface instead of floating as a
// flat square. Each marker mesh owns its own BufferGeometry so we can
// animate its 4 corners independently per frame.
//
// Split out of client-map-3d.ts (already over the 500-line cap) rather than
// grown in place — these two functions are pure geometry math with no
// dependency on the renderer's local state, so they extract mechanically with
// every call site unchanged, matching the sibling pattern already used for
// client-map-3d-observatory-range.ts.

import { BufferAttribute, BufferGeometry } from "three";

export const createBendingMarkerGeometry = (): BufferGeometry => {
  const geom = new BufferGeometry();
  // 4 line segments × 2 endpoints × 3 floats = 24 floats.
  const positions = new Float32Array(24);
  geom.setAttribute("position", new BufferAttribute(positions, 3));
  return geom;
};

export const writeBendingMarkerCorners = (
  geom: BufferGeometry,
  cx: number,
  cy: number,
  cz: number,
  cornerY00: number,
  cornerY10: number,
  cornerY01: number,
  cornerY11: number,
  rise: number
): void => {
  const positionAttr = geom.getAttribute("position") as BufferAttribute;
  const positions = positionAttr.array as Float32Array;
  const x0 = cx - 0.48;
  const x1 = cx + 0.48;
  const z0 = cz - 0.48;
  const z1 = cz + 0.48;
  const y00 = cy + cornerY00 + rise;
  const y10 = cy + cornerY10 + rise;
  const y01 = cy + cornerY01 + rise;
  const y11 = cy + cornerY11 + rise;
  // NW → NE
  positions[0] = x0; positions[1] = y00; positions[2] = z0;
  positions[3] = x1; positions[4] = y10; positions[5] = z0;
  // NE → SE
  positions[6] = x1; positions[7] = y10; positions[8] = z0;
  positions[9] = x1; positions[10] = y11; positions[11] = z1;
  // SE → SW
  positions[12] = x1; positions[13] = y11; positions[14] = z1;
  positions[15] = x0; positions[16] = y01; positions[17] = z1;
  // SW → NW
  positions[18] = x0; positions[19] = y01; positions[20] = z0;
  positions[21] = x0; positions[22] = y00; positions[23] = z0;
  positionAttr.needsUpdate = true;
};
