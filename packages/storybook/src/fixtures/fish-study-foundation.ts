import { BufferAttribute, BufferGeometry } from "three";

/** A low, chamfered apron: level top, skirt seated in the sampled terrain.
 * Corner order is NW, NE, SW, SE. Coordinates share the tile's 0..1 frame. */
export const createFishStudyFoundation = (corners: readonly [number, number, number, number]): {
  readonly geometry: BufferGeometry;
  readonly topY: number;
} => {
  const topY = Math.max(...corners) + 0.012;
  const outline = [[0.04, 0.09], [0.09, 0.04], [0.91, 0.04], [0.96, 0.09],
    [0.96, 0.91], [0.91, 0.96], [0.09, 0.96], [0.04, 0.91]] as const;
  const positions = [0.5, topY, 0.5];
  const uv = [0.5, 0.5];
  for (const [x, z] of outline) { positions.push(x, topY, z); uv.push(x, z); }
  for (const [x, z] of outline) {
    const north = corners[0] * (1 - x) + corners[1] * x;
    const south = corners[2] * (1 - x) + corners[3] * x;
    positions.push(x, north * (1 - z) + south * z - 0.006, z);
    uv.push(x, z);
  }
  const indices: number[] = [];
  for (let i = 0; i < outline.length; i += 1) {
    const current = i + 1, next = (i + 1) % outline.length + 1;
    indices.push(0, next, current, current, next, current + 8, next, next + 8, current + 8);
  }
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  indexed.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return { geometry, topY };
};
