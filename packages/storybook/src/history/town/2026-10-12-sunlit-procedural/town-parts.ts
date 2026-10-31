// History snapshot: packages/client/src/client-map-3d-town-overlay/town-parts.ts at commit a10c42e6 (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Composite town pieces -- houses, towers, walls, churches, domes, trees --
// built from the town-mesh-builder primitives. Each takes the solid `body`
// builder and the unlit `glow` builder (lit windows, lanterns, aether).
import type { TownColor, TownMeshBuilder } from "./town-mesh-builder.js";

export type TownBuilders = {
  readonly body: TownMeshBuilder;
  readonly glow: TownMeshBuilder;
  /** Deterministic 0..1 roll, seeded per tier. */
  readonly random: () => number;
};

// Clearance off a wall so a window/door quad never z-fights the wall face.
const FACE_GAP = 0.0025;
const STOREY_HEIGHT = 0.07;

/** Rotates the local offset (lx, lz) by ry and adds it to (x, z). */
export const at = (x: number, z: number, ry: number, lx: number, lz: number): readonly [number, number] => {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
};

export type HouseOptions = {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly storeys?: number;
  readonly wall: TownColor;
  readonly roof: TownColor;
  readonly ry?: number;
  readonly y?: number;
  readonly roofPitch?: number;
  readonly chimney?: boolean;
  /** Share of windows drawn lit, 0..1. */
  readonly lit?: number;
  readonly hip?: boolean;
  /** Ridge runs front-to-back, gable end to the street (terrace houses). */
  readonly ridgeAcross?: boolean;
};

/** A gabled (or hipped) house, windows on both long faces, door on the front. */
export const house = (t: TownBuilders, o: HouseOptions): void => {
  const ry = o.ry ?? 0;
  const y = o.y ?? 0;
  const storeys = o.storeys ?? 1;
  const h = storeys * STOREY_HEIGHT;
  const roofH = (o.ridgeAcross ? o.w : o.d) * (o.roofPitch ?? 0.7);
  t.body.box(o.x, y, o.z, o.w, h, o.d, o.wall, ry);
  // Darker plinth course so the walls read as standing on the ground.
  t.body.box(o.x, y, o.z, o.w + 0.006, 0.012, o.d + 0.006, "stoneDark", ry);
  if (o.hip) t.body.pyramid(o.x, y + h, o.z, o.w + 0.024, roofH, o.d + 0.024, o.roof, ry);
  else if (o.ridgeAcross) t.body.gable(o.x, y + h, o.z, o.d + 0.026, roofH, o.w + 0.014, o.roof, ry + Math.PI / 2);
  else t.body.gable(o.x, y + h, o.z, o.w + 0.02, roofH, o.d + 0.026, o.roof, ry);

  const perStorey = Math.max(1, Math.floor(o.w / 0.048));
  const spacing = o.w / perStorey;
  for (let storey = 0; storey < storeys; storey += 1) {
    const wy = y + storey * STOREY_HEIGHT + STOREY_HEIGHT * 0.56;
    for (let i = 0; i < perStorey; i += 1) {
      const lx = -o.w / 2 + spacing * (i + 0.5);
      for (const side of [1, -1] as const) {
        // Leave the front ground-floor middle for the door.
        if (storey === 0 && side === 1 && i === Math.floor(perStorey / 2)) continue;
        const [wx, wz] = at(o.x, o.z, ry, lx, side * (o.d / 2 + FACE_GAP));
        const lit = t.random() < (o.lit ?? 0.35);
        (lit ? t.glow : t.body).panel(wx, wy, wz, 0.017, 0.022, lit ? "lamp" : "window", side === 1 ? ry : ry + Math.PI);
      }
    }
  }
  const doorX = -o.w / 2 + spacing * (Math.floor(perStorey / 2) + 0.5);
  const [dx, dz] = at(o.x, o.z, ry, doorX, o.d / 2 + FACE_GAP);
  t.body.panel(dx, y + 0.02, dz, 0.02, 0.034, "door", ry);
  if (o.chimney) {
    const [cx, cz] = at(o.x, o.z, ry, o.w * 0.28, -o.d * 0.18);
    t.body.box(cx, y + h, cz, 0.018, roofH * 0.95, 0.018, "stoneDeep", ry);
  }
};

/** Round tower with a stone collar and conical roof. */
export const roundTower = (
  t: TownBuilders, x: number, z: number, radius: number, h: number,
  wall: TownColor, roof: TownColor, roofH: number, y = 0, aetherFinial = false
): void => {
  t.body.cylinder(x, y, z, radius, radius * 1.06, h, wall, 10);
  t.body.cylinder(x, y + h, z, radius * 1.18, radius * 1.18, 0.016, "stoneDark", 10);
  t.body.cone(x, y + h + 0.016, z, radius * 1.24, roofH, roof, 10);
  if (aetherFinial) {
    const apex = y + h + 0.016 + roofH;
    t.body.cylinder(x, apex - 0.012, z, 0.006, 0.01, 0.026, "brass", 6);
    t.body.ring(x, apex + 0.012, z, 0.014, "brass");
    t.glow.gem(x, apex + 0.03, z, 0.011, 0.02, "aether");
  }
  t.glow.panel(x, y + h * 0.62, z + radius + FACE_GAP, 0.014, 0.022, "lamp");
};

/** Square tower with a hipped spire. */
export const squareTower = (
  t: TownBuilders, x: number, z: number, size: number, h: number,
  wall: TownColor, roof: TownColor, roofH: number, y = 0
): void => {
  t.body.box(x, y, z, size, h, size, wall);
  t.body.box(x, y + h, z, size * 1.16, 0.014, size * 1.16, "stoneDark");
  t.body.pyramid(x, y + h + 0.014, z, size * 1.2, roofH, size * 1.2, roof);
};

/** Crenellated wall from (x0, z0) to (x1, z1). */
export const wallRun = (
  t: TownBuilders, x0: number, z0: number, x1: number, z1: number,
  h: number, thickness: number, color: TownColor, conduit = false
): void => {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  if (length <= 0) return;
  const ry = -Math.atan2(dz, dx);
  t.body.box((x0 + x1) / 2, 0, (z0 + z1) / 2, length, h, thickness, color, ry);
  // Wall-walk cap, then merlons along the outer edge.
  t.body.box((x0 + x1) / 2, h, (z0 + z1) / 2, length, 0.008, thickness * 1.15, "stoneDark", ry);
  // Aether conduit: a glowing band through the wall, showing on both faces.
  if (conduit) t.glow.box((x0 + x1) / 2, h * 0.55, (z0 + z1) / 2, length, 0.007, thickness * 1.06, "aether", ry);
  const merlons = Math.max(1, Math.floor(length / 0.04));
  for (let i = 0; i < merlons; i += 1) {
    const f = (i + 0.5) / merlons;
    t.body.box(x0 + dx * f, h + 0.008, z0 + dz * f, 0.017, 0.018, thickness * 0.9, color, ry);
  }
};

/** Gatehouse spanning a gap of `gap` centred on (x, z), wall running along x (turned ry). */
export const gatehouse = (
  t: TownBuilders, x: number, z: number, gap: number, h: number, ry: number,
  wall: TownColor, roof: TownColor
): void => {
  const half = gap / 2 + 0.03;
  for (const side of [-1, 1] as const) {
    const [tx, tz] = at(x, z, ry, side * half, 0);
    t.body.box(tx, 0, tz, 0.055, h, 0.07, wall, ry);
    t.body.pyramid(tx, h, tz, 0.068, 0.07, 0.082, roof, ry);
  }
  t.body.box(x, h * 0.62, z, gap + 0.01, h * 0.3, 0.06, wall, ry);
  const [fx, fz] = at(x, z, ry, 0, 0.031);
  t.body.panel(fx, h * 0.68, fz, 0.03, 0.02, "brass", ry);
  for (const side of [-1, 1] as const) {
    const [lx, lz] = at(x, z, ry, side * (gap / 2 + 0.03), 0.037);
    t.glow.box(lx, h * 0.55, lz, 0.008, 0.012, 0.004, "lamp", ry);
  }
};

export type TreeKind = "leaf" | "pine";

export const tree = (t: TownBuilders, x: number, z: number, size: number, kind: TreeKind, y = 0): void => {
  t.body.cylinder(x, y, z, size * 0.12, size * 0.16, size * 0.45, "trunk", 5);
  if (kind === "pine") {
    t.body.cone(x, y + size * 0.3, z, size * 0.5, size * 0.6, "foliageDark", 6);
    t.body.cone(x, y + size * 0.62, z, size * 0.36, size * 0.5, "foliageDark", 6);
    return;
  }
  t.body.blob(x, y + size * 0.62, z, size * 0.42, t.random() < 0.5 ? "foliage" : "foliageLight");
};

/** Church: long nave with a front bell tower and spire. Tower sits at +x (turned ry). */
export const church = (
  t: TownBuilders, x: number, z: number, scale: number, ry: number,
  wall: TownColor, roof: TownColor, spire: TownColor
): void => {
  const naveW = 0.2 * scale;
  const naveD = 0.1 * scale;
  house(t, { x, z, w: naveW, d: naveD, storeys: 2, wall, roof, ry, roofPitch: 0.8, lit: 0.6 });
  const towerSize = 0.07 * scale;
  const towerH = 0.26 * scale;
  const [tx, tz] = at(x, z, ry, naveW / 2 + towerSize * 0.4, 0);
  t.body.box(tx, 0, tz, towerSize, towerH, towerSize, wall, ry);
  t.body.box(tx, towerH, tz, towerSize * 1.18, 0.014, towerSize * 1.18, "stoneDark", ry);
  t.body.pyramid(tx, towerH + 0.014, tz, towerSize * 0.95, 0.2 * scale, towerSize * 0.95, spire, ry);
  t.body.gem(tx, towerH + 0.014 + 0.2 * scale + 0.012, tz, 0.008, 0.016, "brass");
  // Belfry openings, lit, on both camera-facing sides of the tower.
  for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const [bx, bz] = at(tx, tz, ry + side, 0, towerSize / 2 + FACE_GAP);
    t.glow.panel(bx, towerH - 0.04 * scale, bz, towerSize * 0.36, 0.04 * scale, "lamp", ry + side);
  }
};

/** Square clock tower with brass faces on all four sides. */
export const clockTower = (
  t: TownBuilders, x: number, z: number, size: number, h: number,
  wall: TownColor, roof: TownColor, y = 0
): void => {
  squareTower(t, x, z, size, h, wall, roof, size * 1.5, y);
  for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const [fx, fz] = at(x, z, side, 0, size / 2 + 0.004);
    gear(t, fx, y + h - size * 0.62, fz, size * 0.42, side);
  }
  t.body.gem(x, y + h + 0.014 + size * 1.5 + 0.01, z, 0.009, 0.018, "brass");
};

/** Hall crowned with a verdigris-copper dome, brass lantern and finial. */
export const domeHall = (
  t: TownBuilders, x: number, z: number, w: number, h: number,
  wall: TownColor, dome: TownColor, y = 0
): number => {
  t.body.box(x, y, z, w, h, w, wall);
  t.body.box(x, y + h, z, w * 1.06, 0.012, w * 1.06, "stoneDark");
  for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const lx of [-w * 0.3, 0, w * 0.3]) {
      const [px, pz] = at(x, z, side, lx, w / 2 + FACE_GAP);
      t.glow.panel(px, y + h * 0.55, pz, 0.016, 0.03, "lamp", side);
    }
  }
  const drumR = w * 0.36;
  const drumH = w * 0.28;
  t.body.cylinder(x, y + h + 0.012, z, drumR, drumR, drumH, wall, 12);
  const domeBase = y + h + 0.012 + drumH;
  if (dome === "aetherGlass") {
    // Futurist glasshouse dome: lit from within, hooped in brass.
    t.glow.dome(x, domeBase, z, drumR * 1.08, dome, 12, 1.05);
    t.body.ring(x, domeBase + 0.003, z, drumR * 1.1, "brass");
    t.body.ring(x, domeBase + drumR * 0.55, z, drumR * 0.92, "brass");
  } else {
    t.body.dome(x, domeBase, z, drumR * 1.08, dome, 12, 1.05);
  }
  const lanternBase = domeBase + drumR * 1.08 * 1.05 - 0.004;
  t.body.cylinder(x, lanternBase, z, drumR * 0.22, drumR * 0.22, drumR * 0.4, "brass", 8);
  t.body.cone(x, lanternBase + drumR * 0.4, z, drumR * 0.28, drumR * 0.42, "brassDark", 8);
  return lanternBase + drumR * 0.82;
};

/** Factory smokestack: dark brick column with a brass band. */
export const smokestack = (t: TownBuilders, x: number, z: number, h: number, radius: number, y = 0): void => {
  t.body.cylinder(x, y, z, radius * 0.8, radius, h, "stoneDeep", 8);
  t.body.cylinder(x, y + h * 0.7, z, radius * 0.95, radius * 0.95, 0.012, "brass", 8);
  t.body.cylinder(x, y + h, z, radius * 1.05, radius * 0.85, 0.016, "timberDark", 8);
};

/** Stone well / fountain basin with a water disc. */
export const fountain = (t: TownBuilders, x: number, z: number, radius: number, withColumn: boolean): void => {
  t.body.cylinder(x, 0, z, radius, radius * 1.05, 0.022, "stone", 10);
  t.body.cylinder(x, 0.016, z, radius * 0.78, radius * 0.78, 0.008, "water", 10);
  if (withColumn) {
    t.body.cylinder(x, 0.02, z, radius * 0.18, radius * 0.24, 0.05, "stoneDark", 6);
    t.body.dome(x, 0.07, z, radius * 0.28, "brass", 8, 0.7);
  }
};

/** Market stall: timber counter under a coloured awning. */
export const stall = (t: TownBuilders, x: number, z: number, ry: number, awning: TownColor): void => {
  t.body.box(x, 0, z, 0.05, 0.02, 0.03, "timber", ry);
  t.body.gable(x, 0.034, z, 0.058, 0.016, 0.042, awning, ry);
  const [px, pz] = at(x, z, ry, 0.024, 0.016);
  t.body.box(px, 0, pz, 0.004, 0.034, 0.004, "timberDark", ry);
  const [qx, qz] = at(x, z, ry, -0.024, 0.016);
  t.body.box(qx, 0, qz, 0.004, 0.034, 0.004, "timberDark", ry);
};

/** Lantern post. */
export const lampPost = (t: TownBuilders, x: number, z: number, h = 0.05, light: TownColor = "lamp"): void => {
  t.body.cylinder(x, 0, z, 0.0035, 0.0045, h, light === "lamp" ? "timberDark" : "iron", 5);
  t.glow.gem(x, h + 0.006, z, 0.007, 0.01, light);
};

/** Brass cog facing +z (turned ry), centred on (x, y, z): eight teeth round a hub. */
export const gear = (t: TownBuilders, x: number, y: number, z: number, radius: number, ry: number, color: TownColor = "brass"): void => {
  t.body.disc(x, y, z, radius * 0.8, 0.006, color, ry);
  for (let i = 0; i < 4; i += 1) t.body.tiltedBox(x, y, z, radius * 2, radius * 0.32, 0.005, color, ry, (i * Math.PI) / 4);
  t.body.disc(x, y, z, radius * 0.26, 0.012, "brassDark", ry);
};

/** Ground pad the town stands on, its top at y = 0. It runs well below that so
 * a sloped tile never shows a gap under it (the overlay lifts the whole town
 * just clear of the terrain; see TOWN_BASE_LIFT). */
export const groundPad = (
  t: TownBuilders, radius: number, sides: number, top: TownColor, rim: TownColor
): void => {
  const turn = Math.PI / sides;
  t.body.cylinder(0, -0.1, 0, radius * 1.03, radius * 1.05, 0.096, rim, sides, turn);
  t.body.cylinder(0, -0.004, 0, radius, radius, 0.004, top, sides, turn);
};

const HOUSE_WALLS: readonly TownColor[] = ["plaster", "plasterWarm", "plasterRose", "plasterWhite", "plaster"];
const HOUSE_ROOFS: readonly TownColor[] = ["roofTerracotta", "roofRed", "roofTerracotta", "roofBrown", "roofSlate"];

export const pick = <T>(random: () => number, options: readonly T[]): T =>
  options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;

export type HouseRowOptions = {
  readonly depth: number;
  readonly storeys: readonly [number, number];
  /** 1: fronts face +z for a west-to-east row (rotating with the row); -1: they face the other way. */
  readonly facing: 1 | -1;
  readonly roofs?: readonly TownColor[];
  readonly walls?: readonly TownColor[];
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly lit?: number;
};

/** Terrace of varied houses packed along the line (x0, z0) -> (x1, z1). */
export const houseRow = (
  t: TownBuilders, x0: number, z0: number, x1: number, z1: number, o: HouseRowOptions
): void => {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  if (length <= 0) return;
  const ry = -Math.atan2(dz, dx) + (o.facing === 1 ? 0 : Math.PI);
  const minWidth = o.minWidth ?? 0.075;
  const maxWidth = o.maxWidth ?? 0.11;
  const gap = 0.006;
  let cursor = 0;
  while (cursor + minWidth <= length + 1e-6) {
    const remaining = length - cursor;
    let w = minWidth + t.random() * (maxWidth - minWidth);
    // Let the last house stretch rather than leave a sliver.
    if (remaining - w < minWidth + gap) w = remaining;
    const f = (cursor + w / 2) / length;
    const storeys = o.storeys[0] + Math.floor(t.random() * (o.storeys[1] - o.storeys[0] + 1));
    house(t, {
      x: x0 + dx * f,
      z: z0 + dz * f,
      w,
      d: o.depth * (0.9 + t.random() * 0.1),
      storeys,
      wall: pick(t.random, o.walls ?? HOUSE_WALLS),
      roof: pick(t.random, o.roofs ?? HOUSE_ROOFS),
      ry,
      chimney: t.random() < 0.45,
      ridgeAcross: t.random() < 0.6,
      lit: o.lit ?? 0.35
    });
    cursor += w + gap;
  }
};
