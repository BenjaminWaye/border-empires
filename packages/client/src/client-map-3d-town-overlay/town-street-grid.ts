// Street-grid towns: square blocks laid out inside the octagonal plate with
// streets between them. Each block holds one or two buildings -- taller, and
// more often sheer glass "Manhattan" towers, the closer they stand to the
// layout's downtown focus -- or a park. Tall neighbours are tied by
// skybridges across the street, and lamps light the crossings.
//
// planStreetGrid is pure (no geometry), so tests can check every lot stays
// on the plate; drawStreetGrid turns a plan into the town.
import type { TownColor } from "./town-mesh-builder.js";
import { insideOctagon, lampPost, octagonApothem, octagonPlate, skyBridge, tree, type TownBuilders } from "./town-parts.js";
import { orrery, skyscraper, type Crown } from "./town-skyscraper.js";

export type StreetGridSpec = {
  readonly plateRadius: number;
  /** Blocks along each axis (corner blocks that would overhang are dropped). */
  readonly cells: number;
  readonly cell: number;
  readonly street: number;
  /** Downtown: buildings rise towards this point. */
  readonly focus: readonly [number, number];
  readonly minH: number;
  readonly maxH: number;
  /** Chance a downtown building is a sheer glass tower (falls off with distance). */
  readonly allGlassShare: number;
  readonly splitShare: number;
  /** Grid indices (column, row) of park blocks; the first holds the orrery. */
  readonly parks: ReadonlyArray<readonly [number, number]>;
  readonly bridgeShare: number;
};

export type Lot = {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly crown: Crown;
  readonly glass: boolean;
  readonly allGlass: boolean;
  readonly shell: TownColor;
};

export type Block = {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly z: number;
  readonly park: boolean;
  readonly size: number;
  /** Lots on this block (empty for a park). */
  readonly lots: readonly Lot[];
};

export type StreetGridPlan = {
  readonly blocks: readonly Block[];
  readonly apothem: number;
  readonly pitch: number;
};

const SIDEWALK_INSET = 0.008;
const SHELLS: readonly TownColor[] = ["stone", "stoneLight", "stoneDark"];

const blockFits = (x: number, z: number, half: number, apothem: number): boolean =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sz]) => insideOctagon(x + sx! * half, z + sz! * half, apothem - 0.008));

const crownFor = (random: () => number, allGlass: boolean, tall: boolean): Crown => {
  // Only stone roofs carry a steaming stack ("flat"); glass towers end in spires.
  const options: readonly Crown[] = allGlass
    ? (tall ? ["spire", "fins", "spire", "pod"] : ["dome", "spire", "fins"])
    : (tall ? ["clock", "pod", "dome", "flat"] : ["dome", "flat", "pod", "clock", "dome"]);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;
};

export const planStreetGrid = (spec: StreetGridSpec, random: () => number): StreetGridPlan => {
  const pitch = spec.cell + spec.street;
  const apothem = octagonApothem(spec.plateRadius);
  const half = spec.cell / 2;
  const blocks: Block[] = [];
  for (let row = 0; row < spec.cells; row += 1) {
    for (let col = 0; col < spec.cells; col += 1) {
      const x = (col - (spec.cells - 1) / 2) * pitch;
      const z = (row - (spec.cells - 1) / 2) * pitch;
      if (!blockFits(x, z, half, apothem)) {
        // A corner block that overhangs: a smaller lot pulled in towards the
        // centre fills the plate's corner with a low building or trees.
        const small = half * 0.6;
        let pull = half - small;
        while (pull < half && !blockFits(x - Math.sign(x) * pull, z - Math.sign(z) * pull, small, apothem)) pull += 0.004;
        const cx = x - Math.sign(x) * pull;
        const cz = z - Math.sign(z) * pull;
        if (!blockFits(cx, cz, small, apothem)) continue;
        const inner = small * 2 - SIDEWALK_INSET * 2;
        const trees = random() < 0.5;
        blocks.push({
          col, row, x: cx, z: cz, park: trees, size: small * 2,
          lots: trees ? [] : [{
            x: cx, z: cz, w: inner * 0.85, d: inner * 0.85, h: spec.minH * (0.7 + random() * 0.4),
            crown: random() < 0.5 ? "dome" : "flat", glass: false, allGlass: false, shell: "stoneDark"
          }]
        });
        continue;
      }
      const park = spec.parks.some(([c, r]) => c === col && r === row);
      const lots: Lot[] = [];
      if (!park) {
        const distance = Math.hypot(x - spec.focus[0], z - spec.focus[1]);
        // Downtown pull, plus the odd landmark tower anywhere.
        const pull = Math.min(1, Math.max(0, 1 - distance / 0.55) ** 1.3 + (random() < 0.12 ? 0.6 : 0));
        const inner = spec.cell - SIDEWALK_INSET * 2;
        const split = random() < spec.splitShare;
        const alongX = random() < 0.5;
        const pieces = split ? [-1, 1] : [0];
        for (const side of pieces) {
          const h = (spec.minH * (0.8 + random() * 0.5) + (spec.maxH - spec.minH) * pull * (0.45 + random() * 0.55)) * (split ? 0.85 : 1);
          const allGlass = random() < spec.allGlassShare * (0.3 + pull);
          const glass = !allGlass && random() < 0.45;
          const long = split ? inner / 2 - 0.006 : inner * (0.78 + random() * 0.12);
          const short = inner * (split ? 0.82 : 0.78 + random() * 0.12);
          const w = alongX ? long : short;
          const d = alongX ? short : long;
          const offset = split ? side * (inner / 4 + 0.003) : 0;
          lots.push({
            x: x + (alongX ? offset : 0),
            z: z + (alongX ? 0 : offset),
            w, d, h,
            crown: crownFor(random, allGlass, h > spec.minH + (spec.maxH - spec.minH) * 0.5),
            glass,
            allGlass,
            shell: SHELLS[Math.floor(random() * SHELLS.length) % SHELLS.length]!
          });
        }
      }
      blocks.push({ col, row, x, z, park, size: spec.cell, lots });
    }
  }
  return { blocks, apothem, pitch };
};

export const drawStreetGrid = (t: TownBuilders, spec: StreetGridSpec, plan: StreetGridPlan): void => {
  // The plate is the street; blocks are raised sidewalks.
  octagonPlate(t, spec.plateRadius, false, "plateDark");
  const [orreryCol, orreryRow] = spec.parks[0] ?? [-1, -1];
  for (const block of plan.blocks) {
    t.body.box(block.x, 0, block.z, block.size, 0.005, block.size, block.park ? "foliage" : "plate");
    if (block.park && block.size < spec.cell) {
      tree(t, block.x - block.size * 0.2, block.z, block.size * 0.7);
      tree(t, block.x + block.size * 0.22, block.z + block.size * 0.15, block.size * 0.6);
      continue;
    }
    if (block.park) {
      if (block.col === orreryCol && block.row === orreryRow) {
        orrery(t, block.x, block.z, spec.cell * 7);
      } else {
        t.body.box(block.x, 0.005, block.z + spec.cell * 0.2, spec.cell * 0.5, 0.003, spec.cell * 0.22, "water");
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        tree(t, block.x + sx * spec.cell * 0.33, block.z + sz * spec.cell * 0.33, spec.cell * 0.5);
      }
      continue;
    }
    for (const lot of block.lots) {
      skyscraper(t, { x: lot.x, z: lot.z, w: lot.w, d: lot.d, h: lot.h, ry: 0, crown: lot.crown, glass: lot.glass, allGlass: lot.allGlass, shell: lot.shell });
    }
  }
  // Skybridges between tall single towers facing each other across a street.
  const byCell = new Map(plan.blocks.map((block) => [`${block.col},${block.row}`, block]));
  const bridgeMin = spec.minH + (spec.maxH - spec.minH) * 0.35;
  for (const block of plan.blocks) {
    for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
      const other = byCell.get(`${block.col + dc},${block.row + dr}`);
      const a = block.lots.length === 1 && block.size === spec.cell ? block.lots[0] : undefined;
      const b = other?.lots.length === 1 && other.size === spec.cell ? other.lots[0] : undefined;
      if (!a || !b || a.h < bridgeMin || b.h < bridgeMin || t.random() > spec.bridgeShare) continue;
      const y = Math.min(a.h, b.h) * (0.3 + t.random() * 0.2);
      skyBridge(t, a.x + (dc * a.w) / 2, y, a.z + (dr * a.d) / 2, b.x - (dc * b.w) / 2, y, b.z - (dr * b.d) / 2);
    }
  }
  // Lamps at the street crossings.
  for (let row = 0; row < spec.cells - 1; row += 1) {
    for (let col = 0; col < spec.cells - 1; col += 1) {
      const x = (col + 0.5 - (spec.cells - 1) / 2) * plan.pitch;
      const z = (row + 0.5 - (spec.cells - 1) / 2) * plan.pitch;
      if (insideOctagon(x, z, plan.apothem - 0.03)) lampPost(t, x, z, 0.04);
    }
  }
};

export const buildStreetGrid = (t: TownBuilders, spec: StreetGridSpec): void =>
  drawStreetGrid(t, spec, planStreetGrid(spec, t.random));
