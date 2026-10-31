import type { BufferGeometry } from "three";
import { createTownMeshBuilder } from "./client-map-3d-town-overlay/town-mesh-builder.js";

/** Half an octagonal sensing frame; two halves close around the instrument.
 * Built in the XY plane, with a unit half-width for the three nested sizes. */
export const createRelayReceiverSegment = (): BufferGeometry => {
  const frame = createTownMeshBuilder();
  const points = [[0, -1], [0.75, -1], [1, -0.75], [1, 0.75], [0.75, 1], [0, 1]] as const;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, c = points[i + 1]!;
    frame.pipe(a[0], a[1], 0, c[0], c[1], 0, 0.065, "plate");
    frame.pipe(a[0], a[1], 0.035, c[0], c[1], 0.035, 0.012, "brass");
  }
  for (const y of [-0.62, 0, 0.62]) {
    frame.box(1, y - 0.07, 0, 0.12, 0.14, 0.11, "plate");
    frame.box(1, y - 0.035, 0.06, 0.065, 0.07, 0.018, "glassLight");
  }
  // Fine suspension members convey an isolated measuring instrument, not a reactor.
  frame.pipe(0, -1, 0, 0, -0.18, 0, 0.009, "plate");
  frame.pipe(0, 0.18, 0, 0, 1, 0, 0.009, "plate");
  return frame.build()!;
};
