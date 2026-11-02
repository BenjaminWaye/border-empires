// What beam weapons leave on the ground (see battle-scar-models.ts and
// forest-war-model.ts): no craters of thrown earth, no wreckage -- a beam
// cuts and fuses. A traversing beam leaves a straight furrow melted to glass
// between low lips of slag, beaded with glass at its edges, the ground charred
// either side; a beam held on one spot leaves a shallow glassed pit in rings of
// rippled melt, its crust fractured outward. While fresh the cuts still glow
// molten and smoke; then the glass goes dark and cold.
import { inStep } from "../client-map-3d-town-overlay/town-parts.js";
import { smokeColumn, type WreckBuilders } from "./wreck-kit.js";

type Point = readonly [number, number];

// The char decals lie at most ~0.006 up (client-map-3d-wreck-overlay.ts); the fused glass sits on top of them.
const ON_CHAR = 0.0065;

/** Box `length` long running from a toward b, its long axis along the line (tiltedBox turns its x axis by ry). */
const along = (t: WreckBuilders, a: Point, b: Point, width: number, height: number, y: number, color: Parameters<WreckBuilders["body"]["box"]>[6], layer: "body" | "glow" = "body"): void => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length <= 0) return;
  t[layer].tiltedBox((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, length, height, width, color, Math.atan2(-dz, dx), 0);
};

/** A beam's cut across the ground from `from` to `to`. */
export const beamFurrow = (t: WreckBuilders, from: Point, to: Point, width: number, fresh: boolean, random: () => number, smoke = true): void => {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  if (length <= 0) return;
  const nx = -dz / length, nz = dx / length;
  // Charred ground along the whole cut, widest where the beam dwelt longest.
  const steps = Math.max(2, Math.ceil(length / (width * 1.4)));
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    t.marks.push({ x: from[0] + dx * f, z: from[1] + dz * f, radius: width * (1.3 + random() * 0.8) });
  }
  // The fused channel: dark glossy melt, pooling wider where the beam dwelt and
  // wandering a little as it swept, with slag lips either side broken into runs.
  const pools = 4 + Math.floor(random() * 3);
  for (let k = 0; k < pools; k += 1) {
    const f0 = k / pools, f1 = (k + 1) / pools + 0.02;
    const wobble = (random() - 0.5) * width * 0.16;
    along(t, [from[0] + dx * f0 + nx * wobble, from[1] + dz * f0 + nz * wobble], [from[0] + dx * Math.min(1, f1) + nx * wobble, from[1] + dz * Math.min(1, f1) + nz * wobble],
      width * (0.42 + random() * 0.3), 0.003, ON_CHAR, "ironDark");
  }
  for (const side of [-1, 1]) {
    let f = random() * 0.08;
    while (f < 0.95) {
      const run = 0.12 + random() * 0.25;
      const g = Math.min(1, f + run);
      const off = side * width * (0.38 + random() * 0.04);
      along(t, [from[0] + dx * f + nx * off, from[1] + dz * f + nz * off], [from[0] + dx * g + nx * off, from[1] + dz * g + nz * off], width * 0.12, 0.004, ON_CHAR + 0.001, "window");
      f = g + 0.03 + random() * 0.08;
    }
  }
  // Beads of glass thrown off the edges.
  for (let i = 0; i < Math.round(length * 40); i += 1) {
    const f = random();
    const off = (random() < 0.5 ? -1 : 1) * width * (0.45 + random() * 0.5);
    t.body.gem(from[0] + dx * f + nx * off, ON_CHAR, from[1] + dz * f + nz * off, 0.0035 + random() * 0.003, 0.004, "glassLight");
  }
  if (!fresh) return;
  // Still molten down the middle, glowing on the ground.
  inStep(t, random(), () => {
    along(t, from, to, width * 0.16, 0.002, ON_CHAR + 0.0022, "lampWarm", "glow");
    // A faint warm glow off the hottest stretch only.
    const f = 0.35 + random() * 0.3;
    t.halo.pool(from[0] + dx * f, ON_CHAR + 0.003, from[1] + dz * f, width * 1.2, "beacon");
  });
  if (smoke) {
    const f = 0.3 + random() * 0.4;
    smokeColumn(t, from[0] + dx * f, 0.01, from[1] + dz * f, 3, 0.45, random, 0.028);
  }
};

/** Where a beam was held on one spot: a glassed pit in rings of rippled melt. */
export const beamPit = (t: WreckBuilders, x: number, z: number, radius: number, fresh: boolean, random: () => number, smoke = true): void => {
  t.marks.push({ x, z, radius: radius * 2.4 }, { x, z, radius: radius * 1.5 }, { x, z, radius: radius * 1.1 });
  t.body.cylinder(x, ON_CHAR - 0.002, z, radius * 0.72, radius * 0.8, 0.003, "ironDark", 16);
  t.body.cylinder(x - radius * 0.2, ON_CHAR - 0.0015, z - radius * 0.15, radius * 0.22, radius * 0.25, 0.003, "glass", 10);
  for (const [r, ratio] of [[0.84, 0.07], [1.08, 0.05], [1.3, 0.035]] as const) t.body.ring(x, ON_CHAR + 0.001, z, radius * r, "window", ratio);
  // The fused crust fractured outward from the heart of the pit.
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + random() * 0.5;
    const r0 = radius * 0.5, r1 = radius * (1.2 + random() * 0.6);
    along(t, [x + Math.cos(angle) * r0, z + Math.sin(angle) * r0], [x + Math.cos(angle) * r1, z + Math.sin(angle) * r1], 0.0028, 0.002, ON_CHAR + 0.0005, "window");
  }
  if (!fresh) return;
  inStep(t, random(), () => {
    t.glow.cylinder(x, ON_CHAR + 0.001, z, radius * 0.3, radius * 0.36, 0.002, "lampWarm", 12);
    t.glow.cylinder(x, ON_CHAR + 0.0015, z, radius * 0.14, radius * 0.18, 0.002, "lamp", 10);
    t.halo.pool(x, ON_CHAR + 0.003, z, radius * 1.1, "beacon");
  });
  if (smoke) smokeColumn(t, x, 0.01, z, 4, 0.6, random, 0.035);
};
