import type { TownBuilders } from "@client/client-map-3d-town-overlay/town-parts.js";
import { SUPPORT_SOCKET_Y } from "./cluster-buildings.js";

type Point = readonly [number, number];
const RING = 0.53;

const serviceLink = (t: TownBuilders, from: Point, to: Point): void => {
  const [x0, z0] = from;
  const [x1, z1] = to;
  const length = Math.hypot(x1 - x0, z1 - z0);
  const nx = -(z1 - z0) / length;
  const nz = (x1 - x0) / length;
  const y = SUPPORT_SOCKET_Y;
  t.body.pipe(x0, y, z0, x1, y, z1, 0.018, "ironDark");
  // A lit inspection strip, rather than a rule that every industry consumes
  // aether. Parallel brass rails make the small connection read at game zoom.
  t.glow.pipe(x0, y + 0.013, z0, x1, y + 0.013, z1, 0.004, "lamp");
  for (const side of [-1, 1]) {
    const ox = nx * 0.025 * side;
    const oz = nz * 0.025 * side;
    t.body.pipe(x0 + ox, y + 0.013, z0 + oz, x1 + ox, y + 0.013, z1 + oz, 0.005, "brass");
  }
  const bays = Math.max(1, Math.ceil(length / 0.13));
  for (let i = 0; i <= bays; i += 1) {
    const x = x0 + (x1 - x0) * i / bays;
    const z = z0 + (z1 - z0) * i / bays;
    t.body.pipe(x + nx * 0.029, y - 0.014, z + nz * 0.029, x - nx * 0.029, y - 0.014, z - nz * 0.029, 0.005, "brassDark");
  }
};

const junction = (t: TownBuilders, x: number, z: number): void => {
  t.body.cylinder(x, -0.09, z, 0.018, 0.03, SUPPORT_SOCKET_Y + 0.09, "iron", 8);
  t.body.cylinder(x, SUPPORT_SOCKET_Y - 0.014, z, 0.034, 0.034, 0.016, "brass", 8);
  t.body.cone(x, SUPPORT_SOCKET_Y + 0.002, z, 0.021, 0.021, "iron", 8);
  t.glow.gem(x, SUPPORT_SOCKET_Y + 0.027, z, 0.01, 0.018, "aether");
};

// Fixed one-tile design layout, not production pathfinding. Integrating this
// into the map requires authoritative town assignment, terrain seating,
// visibility, world wrapping and the matching 2D presentation.
export const buildClusterConnections = (t: TownBuilders, townEdge: number): void => {
  for (const side of [-1, 1]) {
    serviceLink(t, [-RING, side * RING], [RING, side * RING]);
    serviceLink(t, [side * RING, -RING], [side * RING, RING]);
    serviceLink(t, [0, side * townEdge], [0, side * (1 - 0.341)]);
    serviceLink(t, [side * townEdge, 0], [side * (1 - 0.341), 0]);
    for (const [x, z] of [[0, side * townEdge], [side * townEdge, 0]] as const) {
      t.body.cylinder(x, 0, z, 0.022, 0.027, SUPPORT_SOCKET_Y, "iron", 8);
      t.body.cylinder(x, SUPPORT_SOCKET_Y - 0.008, z, 0.028, 0.028, 0.009, "brass", 8);
      t.glow.gem(x, SUPPORT_SOCKET_Y + 0.008, z, 0.008, 0.013, "lamp");
    }
    for (const cross of [-1, 1]) {
      serviceLink(t, [side * RING, cross * RING], [side * 0.759, cross * 0.759]);
      junction(t, side * RING, cross * RING);
    }
    junction(t, 0, side * RING);
    junction(t, side * RING, 0);
  }
};
