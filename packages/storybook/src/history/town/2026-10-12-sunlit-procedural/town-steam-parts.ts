// History snapshot: packages/client/src/client-map-3d-town-overlay/town-steam-parts.ts at commit a10c42e6 (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Steampunk set pieces that give the towns their age-of-aether character:
// airships, brass water towers, wind pumps and mooring masts. Built from the
// same town-mesh-builder primitives as town-parts.ts.
import { at, gear, type TownBuilders } from "./town-parts.js";

/** Canvas-and-brass dirigible, long axis along x (turned ry), centred on (x, y, z). */
export const airship = (t: TownBuilders, x: number, y: number, z: number, length: number, ry: number): void => {
  const radius = length * 0.21;
  t.body.ellipsoid(x, y, z, length / 2, radius, radius, "canvas", ry);
  // Brass hoops round the envelope.
  for (const lx of [-length * 0.24, length * 0.1]) {
    const [bx, bz] = at(x, z, ry, lx, 0);
    t.body.ellipsoid(bx, y, bz, length * 0.025, radius * 1.03, radius * 1.03, "brass", ry);
  }
  const [nx, nz] = at(x, z, ry, length * 0.49, 0);
  t.body.ellipsoid(nx, y, nz, length * 0.04, radius * 0.35, radius * 0.35, "brassDark", ry);
  // Tail fins and propeller.
  const [fx, fz] = at(x, z, ry, -length * 0.42, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, radius * 2.3, 0.006, "copper", ry, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, 0.006, radius * 2.3, "copper", ry, 0);
  const [px, pz] = at(x, z, ry, -length * 0.53, 0);
  t.body.disc(px, y, pz, radius * 0.6, 0.004, "brass", ry + Math.PI / 2);
  // Gondola slung underneath, lit along both sides.
  const gondolaY = y - radius - 0.03;
  t.body.box(x, gondolaY, z, length * 0.36, 0.026, 0.034, "timber", ry);
  t.body.box(x, gondolaY + 0.026, z, length * 0.38, 0.006, 0.038, "brassDark", ry);
  for (const side of [1, -1] as const) {
    for (const lx of [-length * 0.1, 0, length * 0.1]) {
      const [wx, wz] = at(x, z, ry, lx, side * 0.0175);
      t.glow.panel(wx, gondolaY + 0.014, wz, 0.012, 0.01, "lamp", side === 1 ? ry : ry + Math.PI);
    }
    const [sx, sz] = at(x, z, ry, side * length * 0.13, 0);
    t.body.pipe(sx, gondolaY + 0.03, sz, sx, y - radius * 0.7, sz, 0.0025, "iron");
  }
};

/** Brass water tank on iron legs, banded and capped. */
export const waterTower = (t: TownBuilders, x: number, z: number, legH: number, radius: number): void => {
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    t.body.pipe(x + lx * radius * 0.85, 0, z + lz * radius * 0.85, x + lx * radius * 0.6, legH, z + lz * radius * 0.6, 0.004, "iron");
  }
  const tankH = radius * 1.5;
  t.body.cylinder(x, legH, z, radius, radius, tankH, "brass", 10);
  for (const f of [0.15, 0.85]) t.body.ring(x, legH + tankH * f, z, radius * 1.03, "iron");
  t.body.cone(x, legH + tankH, z, radius * 1.1, radius * 0.75, "copper", 10);
  t.glow.panel(x, legH + tankH * 0.5, z + radius + 0.002, radius * 0.5, 0.008, "aether");
};

/** Iron wind pump with a brass rotor, for the farming hamlet. */
export const windPump = (t: TownBuilders, x: number, z: number, h: number): void => {
  t.body.cylinder(x, 0, z, 0.006, 0.018, h, "iron", 4, Math.PI / 4);
  t.body.box(x, h - 0.004, z, 0.022, 0.016, 0.03, "ironLight");
  gear(t, x, h + 0.004, z + 0.02, 0.042, 0);
  t.body.tiltedBox(x, h + 0.004, z - 0.03, 0.004, 0.026, 0.04, "copper", 0, 0);
};

/** Airship mooring mast: iron column, brass hoops and an aether beacon on top. */
export const mooringMast = (t: TownBuilders, x: number, z: number, h: number): void => {
  t.body.box(x, 0, z, 0.03, 0.02, 0.03, "stoneDark");
  t.body.cylinder(x, 0.02, z, 0.005, 0.009, h - 0.02, "iron", 6);
  for (const f of [0.35, 0.7]) t.body.ring(x, h * f, z, 0.012, "brass");
  t.body.cylinder(x, h, z, 0.014, 0.01, 0.012, "brass", 8);
  t.glow.gem(x, h + 0.02, z, 0.009, 0.016, "aether");
};
