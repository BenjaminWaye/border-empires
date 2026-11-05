// History snapshot: packages/client/src/client-map-3d-town-overlay/town-air-parts.ts at commit 750ba4bc (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Airborne and utility pieces: canvas-and-brass airships, mooring masts and
// copper water condensers, in the same language as town-parts.ts.
import { at, type TownBuilders } from "./town-parts.js";

/** Canvas-and-brass airship, long axis along x (turned ry), centred on (x, y, z). */
export const airship = (t: TownBuilders, x: number, y: number, z: number, length: number, ry: number): void => {
  const radius = length * 0.19;
  t.body.ellipsoid(x, y, z, length / 2, radius, radius, "plaster", ry);
  // Brass hoops round the envelope.
  for (const lx of [-length * 0.24, length * 0.18]) {
    const [bx, bz] = at(x, z, ry, lx, 0);
    t.body.ellipsoid(bx, y, bz, length * 0.022, radius * 1.03, radius * 1.03, "brass", ry);
  }
  // Tail fins and twin engine pods.
  const [fx, fz] = at(x, z, ry, -length * 0.42, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, radius * 2.3, 0.006, "copper", ry, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, 0.006, radius * 2.3, "copper", ry, 0);
  for (const side of [1, -1] as const) {
    const [ex, ez] = at(x, z, ry, -length * 0.1, side * radius * 1.2);
    t.body.ellipsoid(ex, y - radius * 0.4, ez, length * 0.1, radius * 0.28, radius * 0.28, "iron", ry);
    const [gx, gz] = at(x, z, ry, -length * 0.205, side * radius * 1.2);
    t.glow.ellipsoid(gx, y - radius * 0.4, gz, length * 0.012, radius * 0.2, radius * 0.2, "aether", ry);
  }
  // Gondola, lit along both sides.
  const gondolaY = y - radius - 0.024;
  t.body.ellipsoid(x, gondolaY + 0.01, z, length * 0.17, 0.014, 0.017, "timber", ry);
  for (const side of [1, -1] as const) {
    const [wx, wz] = at(x, z, ry, 0, side * 0.0172);
    t.glow.panel(wx, gondolaY + 0.011, wz, length * 0.2, 0.006, "lamp", side === 1 ? ry : ry + Math.PI);
  }
};

/** Water condenser: copper tank on iron legs, banded in brass. */
export const condenser = (t: TownBuilders, x: number, z: number, legH: number, radius: number): void => {
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    t.body.pipe(x + lx * radius * 0.85, 0, z + lz * radius * 0.85, x + lx * radius * 0.6, legH, z + lz * radius * 0.6, 0.004, "iron");
  }
  const tankH = radius * 1.4;
  t.body.cylinder(x, legH, z, radius, radius, tankH, "copper", 10);
  t.glow.cylinder(x, legH + tankH * 0.42, z, radius * 1.01, radius * 1.01, tankH * 0.12, "aether", 10);
  for (const f of [0.12, 0.88]) t.body.ring(x, legH + tankH * f, z, radius * 1.03, "brass", 0.08);
  t.body.dome(x, legH + tankH, z, radius, "iron", 10, 0.6);
};

/** Airship mooring mast: iron column, brass hoops and an aether beacon on top. */
export const mooringMast = (t: TownBuilders, x: number, z: number, h: number): void => {
  t.body.cylinder(x, 0, z, 0.016, 0.02, 0.02, "ironDark", 8);
  t.body.cylinder(x, 0.02, z, 0.005, 0.009, h - 0.02, "iron", 6);
  for (const f of [0.35, 0.7]) t.body.ring(x, h * f, z, 0.012, "brass");
  t.body.cylinder(x, h, z, 0.014, 0.01, 0.012, "brass", 8);
  t.glow.gem(x, h + 0.02, z, 0.009, 0.016, "aether");
};
