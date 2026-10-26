import type { NetworkResource } from "@border-empires/shared";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

/** Organic sites sit on exposed terrain; no manufactured slab before development. */
export const resinTree = (t: TownBuilders, x: number, z: number, h: number): void => {
  t.body.cylinder(x, 0, z, 0.017, 0.035, h, "trunk", 6);
  for (const side of [-1, 1]) {
    t.body.pipe(x, h * 0.43, z, x + side * 0.065, h * 0.8, z + 0.025, 0.013, "trunk");
    t.body.blob(x + side * 0.07, h * 0.84, z + 0.025, 0.105, "foliage", 0.42);
    t.body.blob(x + side * 0.065, h * 0.92, z + 0.02, 0.073, "foliageLight", 0.35);
    t.body.ellipsoid(x + side * 0.027, h * 0.42, z + 0.019, 0.025, 0.059, 0.022, "blossomGold");
    t.body.ellipsoid(x + side * 0.029, h * 0.46, z + 0.033, 0.011, 0.026, 0.009, "lampWarm");
    t.body.pipe(x, 0.04, z, x + side * 0.09, 0.006, z + 0.06, 0.012, "trunk");
  }
  t.body.blob(x, h * 1.05, z, 0.11, "foliage", 0.4);
};

export const mineralOutcrop = (t: TownBuilders, x: number, z: number, size: number, catalyst: boolean): void => {
  t.body.ellipsoid(x, size * 0.28, z, size, size * 0.48, size * 0.7, catalyst ? "paving" : "graphite", 0.4);
  t.body.ellipsoid(x - size * 0.24, size * 0.64, z - size * 0.05, size * 0.66, size * 0.42, size * 0.52, catalyst ? "brassDark" : "stoneDark", -0.25);
  for (const offset of [-0.4, 0.12, 0.53]) {
    const vx = x + size * offset;
    t.body.pipe(vx - size * 0.22, size * 0.57, z + size * 0.46, vx, size * 0.88, z + size * 0.2, 0.008, catalyst ? "brass" : "glassLight");
    t.body.pipe(vx, size * 0.88, z + size * 0.2, vx + size * 0.18, size * 0.77, z - size * 0.25, 0.006, catalyst ? "blossomGold" : "aether");
    if (catalyst) t.body.blob(vx, size * 0.72, z + size * 0.24, 0.019, "brassDark", 0.65);
  }
};

export const luxuryPlant = (t: TownBuilders, x: number, z: number, size: number): void => {
  t.body.pipe(x, 0.006, z, x + size * 0.08, size * 0.8, z, 0.006, "trunk");
  for (let i = 0; i < 5; i += 1) {
    const a = i * Math.PI * 2 / 5;
    t.body.ellipsoid(x + Math.sin(a) * size * 0.26, size * 0.4, z + Math.cos(a) * size * 0.26, size * 0.38, size * 0.075, size * 0.15, "foliage", -a);
    t.body.ellipsoid(x + Math.sin(a) * size * 0.15, size * 0.78, z + Math.cos(a) * size * 0.15, size * 0.19, size * 0.12, size * 0.09, "blossom", -a);
  }
  t.body.cone(x, size * 0.8, z, size * 0.09, size * 0.19, "blossomGold", 6);
};

export const salvageRib = (t: TownBuilders, x: number, z: number, radius: number): void => {
  // A broken, half-buried machine rib rather than a generic glowing crystal.
  for (let i = 0; i < 7; i += 1) {
    const a = -0.32 + i * 0.39, b = a + 0.34;
    const point = (angle: number): readonly [number, number, number] => [x + Math.cos(angle) * radius, 0.015 + Math.sin(angle) * radius, z];
    t.body.pipe(...point(a), ...point(b), 0.026, "stoneLight");
    t.body.pipe(...[point(a)[0], point(a)[1], z + 0.028] as const, ...[point(b)[0], point(b)[1], z + 0.028] as const, 0.008, "ironDark");
  }
  t.body.box(x - radius * 0.3, 0, z + 0.1, radius * 0.8, 0.035, 0.1, "ironDark", -0.3);
  for (let i = 0; i < 3; i += 1) t.body.box(x - radius * 0.5 + i * 0.045, 0.034, z + 0.09, 0.014, 0.006, 0.058, "glassLight", -0.3);
};

export const buildNetworkSite = (t: TownBuilders, resource: NetworkResource): void => {
  switch (resource) {
    case "NEURAL_RESIN":
      resinTree(t, -0.17, 0.05, 0.36); resinTree(t, 0.16, -0.09, 0.44); resinTree(t, 0.12, 0.2, 0.25);
      break;
    case "CONDUCTIVE_MINERALS":
    case "CATALYTIC_DEPOSIT":
      for (const [x, z, size] of [[-0.17, 0.07, 0.17], [0.08, -0.04, 0.22], [0.23, 0.19, 0.1], [-0.11, -0.2, 0.09]] as const) mineralOutcrop(t, x, z, size, resource === "CATALYTIC_DEPOSIT");
      break;
    case "LUXURY_BIOTA":
      for (const [x, z, size] of [[-0.21, 0.01, 0.23], [0.02, -0.16, 0.27], [0.22, 0.06, 0.2], [-0.02, 0.2, 0.21]] as const) luxuryPlant(t, x, z, size);
      break;
    case "PRECURSOR_SALVAGE":
      salvageRib(t, -0.05, -0.07, 0.25);
      t.body.box(-0.19, 0, 0.15, 0.16, 0.08, 0.09, "stoneDark", -0.45);
      t.body.box(0.2, 0.005, 0.1, 0.11, 0.05, 0.18, "stoneLight", 0.4);
      t.body.pipe(0.16, 0.055, 0.13, 0.23, 0.055, 0.02, 0.009, "glass");
      break;
  }
};
