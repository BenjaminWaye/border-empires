// Battle scars on ground where garrisons were overrun (shared war-scars.ts),
// one model per level 1..WAR_SCAR_MAX_LEVEL in a few variants. Each level adds
// to the last: shell craters with thrown-up earth rims, broken pikes and spent
// arrows stuck in the ground, dropped shields and helmets, burnt timbers and a
// wrecked cart, stake barricades, and from level 3 smouldering embers; the
// heaviest fighting leaves the ground cratered edge to edge with smoke still
// rising. Drawn low and small so it reads as ground under any building.
import { WAR_SCAR_MAX_LEVEL } from "@border-empires/shared";
import { at3, ember, pipeBetween, scorch, smokeColumn, wreckRandom, type Vec3, type WreckBuilders } from "./wreck-kit.js";

export const BATTLE_SCAR_VARIANTS = 3;
const SPAN = 0.42;

type Spot = { x: number; z: number };

/**
 * Where things fell: not scattered evenly but along the line the fighting
 * ran across the tile, thickest at the line and thinning to either side,
 * clear of anything standing (`avoid`, e.g. tree trunks).
 */
const createSpotPicker = (random: () => number, avoid: readonly Spot[]) => {
  const angle = random() * Math.PI;
  const offset = (random() - 0.5) * 0.16;
  const ax = Math.cos(angle), az = Math.sin(angle);
  return (lateral = 0.13, span = SPAN): Spot => {
    let best: Spot = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const along = (random() * 2 - 1) * span;
      const across = offset + (random() + random() + random() - 1.5) * lateral * 1.4;
      const x = Math.max(-span, Math.min(span, ax * along - az * across));
      const z = Math.max(-span, Math.min(span, az * along + ax * across));
      best = { x, z };
      if (avoid.every((a) => Math.hypot(a.x - x, a.z - z) > 0.075)) break;
    }
    return best;
  };
};

const crater = (t: WreckBuilders, x: number, z: number, radius: number, random: () => number): void => {
  // Blast-burnt ground with a black pit at the heart.
  scorch(t, x, z, radius * 2, random);
  t.marks.push({ x, z, radius: radius * 0.75 }, { x, z, radius: radius * 0.6 });
  // The lip of thrown-up earth: a broken ring of clods, highest at the edge of the pit.
  const clods = 12;
  for (let i = 0; i < clods; i += 1) {
    if (random() < 0.12) continue;
    const degrees = (i / clods) * 360 + random() * 18;
    const [dx, , dz] = at3(radius * (0.95 + random() * 0.2), degrees, 0);
    t.body.blob(x + dx, 0.004, z + dz, radius * (0.26 + random() * 0.14), random() < 0.65 ? "trunk" : "stoneDark", 0.42);
  }
  // Earth and stones flung further out.
  for (let i = 0; i < 9; i += 1) {
    const [dx, , dz] = at3(radius * (1.4 + random() * 1.1), random() * 360, 0);
    t.body.blob(x + dx, 0.003, z + dz, 0.006 + random() * 0.009, random() < 0.6 ? "trunk" : "stoneDark", 0.6);
  }
};

/** A broken file of pikes: two or three together, fallen or leaning the same way. */
const pikeGroup = (t: WreckBuilders, s: Spot, count: number, random: () => number): void => {
  const lean = random() * 360;
  for (let i = 0; i < count; i += 1) {
    const [dx, , dz] = at3(0.02 + i * 0.025, lean + 90 + (random() - 0.5) * 40, 0);
    pike(t, { x: s.x + dx, z: s.z + dz }, lean + (random() - 0.5) * 30, random);
  }
};

const pike = (t: WreckBuilders, s: Spot, leanDegrees: number, random: () => number): void => {
  const lean = at3(0.03 + random() * 0.06, leanDegrees, 0);
  if (random() < 0.45) {
    // Snapped: a stub in the ground, the head end lying beside it.
    pipeBetween(t, [s.x, -0.01, s.z], [s.x + lean[0] * 0.4, 0.05, s.z + lean[2] * 0.4], 0.0045, "trunk");
    const lying = at3(0.09, leanDegrees + (random() - 0.5) * 50, 0);
    pipeBetween(t, [s.x + 0.02, 0.004, s.z + 0.01], [s.x + 0.02 + lying[0], 0.004, s.z + 0.01 + lying[2]], 0.0045, "trunk");
    t.body.gem(s.x + 0.02 + lying[0], 0.006, s.z + 0.01 + lying[2], 0.006, 0.012, "iron");
    return;
  }
  const height = 0.1 + random() * 0.06;
  const top: Vec3 = [s.x + lean[0], height, s.z + lean[2]];
  pipeBetween(t, [s.x, -0.01, s.z], top, 0.0045, "trunk");
  t.body.gem(top[0], top[1], top[2], 0.006, 0.014, "iron");
};

const arrows = (t: WreckBuilders, s: Spot, count: number, random: () => number): void => {
  for (let i = 0; i < count; i += 1) {
    const x = s.x + (random() - 0.5) * 0.12;
    const z = s.z + (random() - 0.5) * 0.12;
    const tail = at3(0.025, random() * 360, 0.04 + random() * 0.015);
    pipeBetween(t, [x, -0.004, z], [x + tail[0], tail[1], z + tail[2]], 0.0018, "trunk");
    t.body.box(x + tail[0], tail[1] - 0.006, z + tail[2], 0.006, 0.008, 0.0015, "stoneLight", random() * Math.PI);
  }
};

const shield = (t: WreckBuilders, s: Spot, random: () => number): void => {
  const color = random() < 0.5 ? "brassDark" : "iron";
  if (random() < 0.6) {
    // Dropped face-up, its boss catching the light.
    t.body.cylinder(s.x, 0, s.z, 0.034, 0.036, 0.007, color, 12);
    t.body.dome(s.x, 0.007, s.z, 0.011, "brass", 8, 0.7);
  } else {
    // Propped where its bearer fell.
    t.body.disc(s.x, 0.03, s.z, 0.034, 0.007, color, random() * Math.PI);
  }
};

const helmet = (t: WreckBuilders, s: Spot, random: () => number): void => {
  t.body.dome(s.x, -0.002, s.z, 0.018, random() < 0.5 ? "iron" : "ironDark", 10, 0.85);
  t.body.cylinder(s.x, -0.002, s.z, 0.021, 0.021, 0.003, "ironDark", 10);
};

const burntTimbers = (t: WreckBuilders, s: Spot, random: () => number, smoulder: boolean): void => {
  for (let i = 0; i < 4; i += 1) {
    t.body.tiltedBox(s.x + (random() - 0.5) * 0.06, 0.01 + i * 0.008, s.z + (random() - 0.5) * 0.06,
      0.14 + random() * 0.06, 0.018, 0.022, i % 2 ? "graphite" : "trunk", random() * Math.PI, (random() - 0.5) * 0.3);
  }
  if (smoulder) for (let i = 0; i < 3; i += 1) ember(t, s.x + (random() - 0.5) * 0.08, 0.028, s.z + (random() - 0.5) * 0.08, 0.006, random, i === 0);
};

const brokenWheel = (t: WreckBuilders, s: Spot, random: () => number): void => {
  t.body.ring(s.x, 0.006, s.z, 0.05, "trunk", 0.12);
  for (let i = 0; i < 6; i += 1) {
    if (i === 2) continue;
    const rim = at3(0.048, i * 60 + random() * 6, 0.006);
    pipeBetween(t, [s.x, 0.006, s.z], [s.x + rim[0], 0.006, s.z + rim[2]], 0.003, "trunk");
  }
  t.body.cylinder(s.x, 0, s.z, 0.01, 0.01, 0.012, "iron", 8);
  t.body.tiltedBox(s.x + 0.07, 0.012, s.z - 0.04, 0.16, 0.012, 0.03, "trunk", 0.8 + random(), 0.15);
};

/** Crossed stakes lashed to a beam: a barricade the defenders didn't hold. */
const stakeBarricade = (t: WreckBuilders, s: Spot, random: () => number): void => {
  const yaw = random() * Math.PI;
  const along = (d: number): Vec3 => [s.x + Math.cos(yaw) * d, 0.035, s.z + Math.sin(yaw) * d];
  pipeBetween(t, along(-0.09), along(0.09), 0.006, "trunk");
  for (const d of [-0.07, 0, 0.07]) {
    const c = along(d);
    const nx = -Math.sin(yaw) * 0.045;
    const nz = Math.cos(yaw) * 0.045;
    pipeBetween(t, [c[0] - nx, 0, c[2] - nz], [c[0] + nx, 0.075, c[2] + nz], 0.0045, "trunk");
    pipeBetween(t, [c[0] + nx, 0, c[2] + nz], [c[0] - nx, 0.075, c[2] - nz], 0.0045, "trunk");
  }
};

/** Level 1..WAR_SCAR_MAX_LEVEL battle scars, variant 0..BATTLE_SCAR_VARIANTS-1. */
export const buildBattleScars = (t: WreckBuilders, level: number, variant: number, avoid: readonly Spot[] = []): void => {
  const depth = Math.max(1, Math.min(WAR_SCAR_MAX_LEVEL, Math.floor(level)));
  const random = wreckRandom(307 + variant * 31);
  const spot = createSpotPicker(random, avoid);
  const craters = depth === 1 ? 1 : depth + Math.floor(depth / 3);
  for (let i = 0; i < craters; i += 1) {
    // Shells landed round the line, wider than where the men fell.
    const s = spot(0.2, SPAN - 0.06);
    crater(t, s.x, s.z, 0.05 + random() * 0.035 + (i === 0 ? depth * 0.012 : 0), random);
  }
  for (let i = 0; i < depth + 1; i += 1) pikeGroup(t, spot(), 2 + Math.floor(random() * 2), random);
  for (let i = 0; i < depth; i += 1) arrows(t, spot(0.18), 3 + depth, random);
  // Shields and helmets lie where their bearers fell, near the pikes.
  for (let i = 0; i < Math.ceil(depth * 0.8); i += 1) shield(t, spot(0.1), random);
  for (let i = 0; i < Math.floor(depth / 2) + 1; i += 1) helmet(t, spot(0.1), random);
  if (depth >= 2) burntTimbers(t, spot(0.16, SPAN - 0.08), random, depth >= 3);
  if (depth >= 3) brokenWheel(t, spot(0.2, SPAN - 0.08), random);
  if (depth >= 4) {
    stakeBarricade(t, spot(0.05, SPAN - 0.1), random);
    burntTimbers(t, spot(0.16, SPAN - 0.08), random, true);
    const s = spot(0.1, SPAN - 0.1);
    smokeColumn(t, s.x, 0.03, s.z, 4, 0.45, random, 0.03);
  }
  if (depth >= WAR_SCAR_MAX_LEVEL) {
    // The worst of it: ground churned black from edge to edge, fires still going.
    for (let i = 0; i < 4; i += 1) {
      const s = spot(0.3, SPAN - 0.12);
      scorch(t, s.x, s.z, 0.18, random);
    }
    stakeBarricade(t, spot(0.05, SPAN - 0.1), random);
    const s = spot(0.12, SPAN - 0.1);
    smokeColumn(t, s.x, 0.03, s.z, 5, 0.65, random, 0.04);
    for (let i = 0; i < 4; i += 1) {
      const e = spot(0.2);
      ember(t, e.x, 0.01, e.z, 0.007, random, i < 2);
    }
  }
};
