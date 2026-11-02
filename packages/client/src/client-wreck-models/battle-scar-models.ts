// Battle scars on open ground where garrisons were overrun (shared
// war-scars.ts): beam-weapon damage only (beam-scars.ts) -- furrows cut and
// fused to glass where beams swept across the tile and glassed pits where they
// were held, on charred earth. Each level adds to the last: a single cut and a
// pit at first, then cuts across the line from both sides, then the crossfire
// of a sustained fight, until the heaviest fighting leaves the tile fused and
// charred from edge to edge. Fresh scars (the first hours after the latest
// battle) still glow molten and smoke. Variants 0..BATTLE_SCAR_VARIANTS-1.
import { WAR_SCAR_MAX_LEVEL } from "@border-empires/shared";
import { beamFurrow, beamPit } from "./beam-scars.js";
import { scorch, wreckRandom, type WreckBuilders } from "./wreck-kit.js";

export const BATTLE_SCAR_VARIANTS = 3;
const SPAN = 0.44;

type Spot = { readonly x: number; readonly z: number };

const clampToTile = (v: number): number => Math.max(-SPAN, Math.min(SPAN, v));

/** Distance from point p to the segment a-b. */
const distanceToSegment = (p: Spot, a: Spot, b: Spot): number => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
};

/**
 * Battle scars at `level`. `avoid` keeps pits off standing things (tree trunks);
 * `fresh` scars glow and smoke.
 */
export const buildBattleScars = (t: WreckBuilders, level: number, variant: number, fresh = false, avoid: readonly Spot[] = []): void => {
  const depth = Math.max(1, Math.min(WAR_SCAR_MAX_LEVEL, Math.floor(level)));
  const random = wreckRandom(307 + variant * 31);
  // The line the fight ran along; beams sweep across it at shallow angles.
  const axis = random() * Math.PI;
  const furrows = [1, 2, 3, 4, 6][depth - 1]!;
  const cuts: [Spot, Spot][] = [];
  for (let i = 0; i < furrows; i += 1) {
    // Later levels add crossfire from the flanks.
    const angle = axis + (i % 3 === 2 ? Math.PI / 2 : 0) + (random() - 0.5) * 0.7;
    const cx = (random() - 0.5) * 0.5, cz = (random() - 0.5) * 0.5;
    const half = 0.18 + random() * 0.22;
    const a = { x: clampToTile(cx - Math.cos(angle) * half), z: clampToTile(cz - Math.sin(angle) * half) };
    const b = { x: clampToTile(cx + Math.cos(angle) * half), z: clampToTile(cz + Math.sin(angle) * half) };
    cuts.push([a, b]);
    // Only the first couple of cuts and pits smoke, so the tile isn't buried in it.
    beamFurrow(t, [a.x, a.z], [b.x, b.z], 0.028 + random() * 0.018 + depth * 0.003, fresh, random, i < 1 && avoid.length === 0);
  }
  const pits = [1, 2, 3, 4, 5][depth - 1]!;
  for (let i = 0; i < pits; i += 1) {
    // Beams dwell at the ends of their sweeps, where they struck what they were aimed at.
    let spot: Spot = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cut = cuts[i % cuts.length]!;
      const end = random() < 0.5 ? cut[0] : cut[1];
      spot = { x: clampToTile(end.x + (random() - 0.5) * 0.12), z: clampToTile(end.z + (random() - 0.5) * 0.12) };
      if (avoid.every((a) => Math.hypot(a.x - spot.x, a.z - spot.z) > 0.08)) break;
    }
    beamPit(t, spot.x, spot.z, 0.04 + random() * 0.025 + (i === 0 ? depth * 0.006 : 0), fresh, random, i < 2);
  }
  // Charred earth: patches round the fighting, spreading over the whole tile at the worst.
  const patches = depth >= WAR_SCAR_MAX_LEVEL ? 7 : depth - 1;
  for (let i = 0; i < patches; i += 1) {
    const cut = cuts[i % cuts.length]!;
    const f = random();
    const p = { x: cut[0].x + (cut[1].x - cut[0].x) * f, z: cut[0].z + (cut[1].z - cut[0].z) * f };
    if (distanceToSegment(p, cut[0], cut[1]) <= 0.5) scorch(t, p.x + (random() - 0.5) * 0.2, p.z + (random() - 0.5) * 0.2, 0.1 + depth * 0.025, random);
  }
};
