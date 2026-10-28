import { BufferAttribute, BufferGeometry } from "three";

/** A low, chamfered apron: level top, skirt seated in the sampled terrain.
 * Corner order is NW, NE, SW, SE. Coordinates share the tile's 0..1 frame. */
export const createFishStudyFoundation = (corners: readonly [number, number, number, number],
  options: { readonly inset?: number; readonly lift?: number; readonly shoreEdge?: "east" } = {}
): {
  readonly geometry: BufferGeometry;
  readonly topY: number;
} => {
  const topY = Math.max(...corners) + (options.lift ?? 0.012);
  const low = options.inset ?? 0.04, high = 1 - low, chamfer = 0.05;
  const east = options.shoreEdge === "east" ? 1 : high;
  const outline = [[low, low + chamfer], [low + chamfer, low], [east - chamfer, low], [east, low + chamfer],
    [east, high - chamfer], [east - chamfer, high], [low + chamfer, high], [low, high - chamfer]] as const;
  const positions = [0.5, topY, 0.5];
  const uv = [0.5, 0.5];
  for (const [x, z] of outline) { positions.push(x, topY, z); uv.push(x, z); }
  for (const [x, z] of outline) {
    const north = corners[0] * (1 - x) + corners[1] * x;
    const south = corners[2] * (1 - x) + corners[3] * x;
    const ground = north * (1 - z) + south * z - 0.006;
    // The coast-facing skirt meets the water rather than exposing a grass lip.
    positions.push(x, options.shoreEdge === "east" && x === east ? Math.min(ground, -0.04) : ground, z);
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
