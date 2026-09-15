// Per-variant piece + shape data for the 3D siege-tower overlay. Split out of
// client-map-3d-siege-tower-overlay.ts (already near the repo's per-file line
// cap) so the DREAD_TOWER redesign — a low black-iron lattice chassis with a
// pale pylon carrying a massive glowing aether core and revolving brass rings —
// can grow here without touching the SIEGE_TOWER silhouette.
//
// SIEGE_TOWER is a compact tower: heavy base, stabilizer legs, a single huge
// aether lens in a two-ring brass gimbal. DREAD_TOWER is the colossus: same
// chassis language, taller legs, a central pylon, a great emissive core sphere
// wrapped in four precessing brass rings, plus a sky lance that "charges" a
// column of light up out of the core.
import type { SiegeTowerVariant } from "./client-map-3d-siege-tower-palette.js";

export type TowerShape = {
  readonly baseR: number;
  readonly legW: number;
  readonly spread: number;
  readonly braceW: number;
  readonly platformW: number;
  readonly legH: number;
  readonly emitterY: number;
  readonly mediumR: number;
  readonly haloR: number;
  readonly beamR: number;
  readonly pylonR: number;
  readonly pylonTopY: number;
  readonly skyH: number;
  readonly skyThick: number;
  readonly rings: ReadonlyArray<{
    readonly radius: number;
    readonly tilt: number;
    readonly spinSpeed: number;
    readonly phaseOffset: number;
  }>;
};

export type PieceSpec = {
  readonly key: string;
  readonly mult: number;
  readonly geo: string;
  readonly glow: boolean;
};

export const SHAPES: Record<SiegeTowerVariant, TowerShape> = {
  SIEGE_TOWER: {
    baseR: 0.46,
    legW: 0.09,
    spread: 0.34,
    braceW: 0.72,
    platformW: 0.6,
    legH: 1.9,
    emitterY: 2.02,
    mediumR: 0.24,
    haloR: 0.38,
    beamR: 0.028,
    pylonR: 0,
    pylonTopY: 0,
    skyH: 0,
    skyThick: 0,
    rings: []
  },
  DREAD_TOWER: {
    baseR: 0.56,
    legW: 0.13,
    spread: 0.42,
    braceW: 0.95,
    platformW: 0.86,
    legH: 2.3,
    emitterY: 3.4,
    mediumR: 0.42,
    haloR: 1.05,
    beamR: 0.05,
    pylonR: 0.1,
    pylonTopY: 3.05,
    skyH: 5.6,
    skyThick: 0.09,
    rings: [
      { radius: 0.85, tilt: 0.3, spinSpeed: 0.6, phaseOffset: 0 },
      { radius: 1.05, tilt: 0.55, spinSpeed: -0.45, phaseOffset: Math.PI / 3 },
      { radius: 1.25, tilt: 0.85, spinSpeed: 0.35, phaseOffset: (2 * Math.PI) / 3 },
      { radius: 1.5, tilt: 1.15, spinSpeed: -0.25, phaseOffset: Math.PI }
    ]
  }
};

export const PIECE_SPECS_BY_VARIANT: Record<SiegeTowerVariant, readonly PieceSpec[]> = {
  SIEGE_TOWER: [
    { key: "base", mult: 1, geo: "base", glow: false },
    { key: "leg", mult: 4, geo: "box", glow: false },
    { key: "brace", mult: 8, geo: "box", glow: false },
    { key: "platform", mult: 1, geo: "box", glow: false },
    { key: "column", mult: 1, geo: "column", glow: false },
    { key: "ringOuter", mult: 1, geo: "ringOuter", glow: false },
    { key: "ringInner", mult: 1, geo: "ringInner", glow: false },
    { key: "barrel", mult: 1, geo: "barrel", glow: false },
    { key: "lens", mult: 1, geo: "lens", glow: false },
    { key: "rim", mult: 1, geo: "rim", glow: false },
    { key: "halo", mult: 1, geo: "halo", glow: true },
    { key: "beam", mult: 1, geo: "beam", glow: true },
    { key: "beamCore", mult: 1, geo: "beamCore", glow: true }
  ],
  DREAD_TOWER: [
    { key: "base", mult: 1, geo: "base", glow: false },
    { key: "leg", mult: 4, geo: "box", glow: false },
    { key: "brace", mult: 8, geo: "box", glow: false },
    { key: "platform", mult: 1, geo: "box", glow: false },
    { key: "pylon", mult: 1, geo: "column", glow: false },
    { key: "core", mult: 1, geo: "lens", glow: false },
    { key: "coreHalo", mult: 1, geo: "halo", glow: true },
    { key: "ringA", mult: 1, geo: "ring", glow: false },
    { key: "ringB", mult: 1, geo: "ring", glow: false },
    { key: "ringC", mult: 1, geo: "ring", glow: false },
    { key: "ringD", mult: 1, geo: "ring", glow: false },
    { key: "sky", mult: 1, geo: "sky", glow: true },
    { key: "beam", mult: 1, geo: "beam", glow: true },
    { key: "beamCore", mult: 1, geo: "beamCore", glow: true }
  ]
};