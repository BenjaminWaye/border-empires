import {
  aetherLine,
  block,
  blockStorey,
  cottage,
  domeOn,
  gearDeck,
  gearWall,
  glow,
  lamp,
  needle,
  orbTopper,
  piece,
  pipeLine,
  tower,
  workshop,
  type TownLayout,
  type TownPiece
} from "./town-tier-shapes.js";

// Progression anchors, tile-local space centred at (0,0) within ±0.46.

// -------------------------------------------------------------------------
// SETTLEMENT — "Frontier Spark". A sparse, improvised but unmistakably
// futuristic camp: a few dark timber/iron shelters circling a mechanical
// aether pump, one brass workhouse chimney, overhead steam pipe runs and
// a pair of glowing lamps.
const pumpHouse = (
  ctx: TownPiece[],
  x: number,
  z: number,
  base: number
): void => {
  ctx.push(
    piece("slab", "stone", x, z, base + 0.05, 0.30, 1, 0.30),
    piece("cyl", "iron", x, z, base + 0.15, 0.15, 0.16, 0.15),
    piece("piston", "ironDark", x, z, base + 0.31, 1, 0.16, 1)
  );
  ctx.push(...gearWall(x + 0.13, z + 0.09, base + 0.10, 0.11, "brassDark"));
  ctx.push(piece("pipe", "brassDark", x - 0.14, z + 0.03, base + 0.13, 0.18, 1, 1, 0));
};

export const SETTLEMENT_LAYOUT: TownLayout = (() => {
  const pieces: TownPiece[] = [];
  pumpHouse(pieces, 0, 0, 0);
  pieces.push(
    ...cottage(-0.28, -0.22, 0.24, 0.24, 0.20, "wood", "roofRed"),
    ...cottage(0.24, -0.34, 0.20, 0.21, 0.19, "woodLight", "charcoal"),
    ...cottage(0.20, 0.34, 0.22, 0.23, 0.20, "wood", "charcoal"),
    ...workshop(-0.34, -0.02, 0.24, 0.26, 0.22, "ironDark", "slateLight", 0.24, "charcoal"),
    ...lamp(0.32, -0.04, 0.40),
    ...lamp(-0.30, 0.32, 0.36),
    ...pipeLine(-0.16, -0.02, 0.14, 0.30, 0, "brassDark"),
    ...pipeLine(0.16, 0.16, 0.12, 0.22, Math.PI / 2, "brassDark"),
    piece("cyl", "wood", -0.22, 0.20, 0.05, 0.05, 0.10, 0.05),
    piece("cyl", "woodLight", -0.15, 0.25, 0.05, 0.05, 0.10, 0.05)
  );
  return pieces;
})();

// -------------------------------------------------------------------------
// TOWN — "Growing Industry". A clockwork hall commands the centre; blocks,
// a steam engine, gears, an elevated walkway, pipe runs and a small crane
// fill the growing grid. Several lamps glow along the streets.
const clockworkHall = (ctx: TownPiece[], x: number, z: number, base: number): void => {
  ctx.push(
    piece("slab", "stone", x, z, base + 0.05, 0.42, 1, 0.42),
    piece("cube", "stone", x, z, base + 0.19, 0.30, 0.26, 0.26),
    piece("slab", "brassDark", x, z, base + 0.36, 0.20, 1, 0.16),
    piece("cube", "slate", x, z, base + 0.47, 0.13, 0.14, 0.11),
    piece("cone", "brassDark", x, z, base + 0.64, 0.09, 0.36, 0.09)
  );
  ctx.push(...gearWall(x + 0.13, z - 0.02, base + 0.20, 0.15, "brass"));
  ctx.push(...orbTopper(x, z, base + 0.72, 0.05));
};

const walkway = (ctx: TownPiece[], x: number, z1: number, z2: number, y: number): void => {
  const zMid = (z1 + z2) * 0.5;
  const len = Math.abs(z2 - z1);
  ctx.push(
    piece("slab", "stoneLight", x, zMid, y, 0.05, 1, len + 0.06),
    piece("beam", "iron", x, zMid, y + 0.07, 1, 0.06, len + 0.06, Math.PI / 2),
    ...aetherLine(x, zMid, y + 0.11, len + 0.06, Math.PI / 2),
    piece("piston", "ironDark", x, z1, y * 0.5, 1, y, 1),
    piece("piston", "ironDark", x, z2, y * 0.5, 1, y, 1)
  );
};

const crane = (ctx: TownPiece[], x: number, z: number, ry: number): void => {
  ctx.push(
    piece("cube", "ironDark", x, z, 0.07, 0.12, 0.14, 0.12),
    piece("piston", "iron", x, z, 0.24, 1, 0.30, 1),
    ...gearDeck(x, z, 0.38, 0.09)
  );
  const dx = Math.cos(ry) * 0.12;
  const dz = Math.sin(ry) * 0.12;
  ctx.push(
    piece("piston", "ironDark", x + dx * 0.7, z + dz * 0.7, 0.20, 0.32, 1, 1, ry),
    glow("amberGlow", x + dx, z + dz, 0.21, 0.07, 0.07, 0.07)
  );
};

export const TOWN_LAYOUT: TownLayout = (() => {
  const pieces: TownPiece[] = [];
  clockworkHall(pieces, 0, 0, 0);
  pieces.push(
    ...cottage(-0.30, -0.30, 0.23, 0.26, 0.20, "wood", "roofRed"),
    ...cottage(-0.32, 0.26, 0.22, 0.24, 0.20, "woodLight", "charcoal"),
    ...cottage(-0.04, -0.40, 0.20, 0.22, 0.18, "ironDark", "slateLight"),
    ...block(0.32, -0.14, 0.24, 0.40, 0.22, "stone", "slateLight"),
    ...block(0.32, 0.28, 0.24, 0.42, 0.22, "iron", "brassDark"),
    ...workshop(-0.28, 0.02, 0.22, 0.28, 0.20, "iron", "brassDark", 0.28, "charcoal"),
    ...block(0.04, 0.36, 0.20, 0.26, 0.16, "slate", "slateLight"),
    piece("cyl", "brassDark", 0.12, 0.30, 0.16, 0.07, 0.17, 0.07)
  );
  pieces.push(...gearDeck(0.32, 0.28, 0.42, 0.09));
  pieces.push(...gearDeck(0.32, -0.14, 0.40, 0.08));
  walkway(pieces, 0.32, -0.14, 0.28, 0.34);
  crane(pieces, -0.16, 0.38, Math.PI / 2);
  pieces.push(
    ...pipeLine(-0.12, 0.30, 0.12, 0.30, Math.PI / 2, "brass"),
    ...pipeLine(-0.36, 0.14, 0.15, 0.28, 0, "brassDark"),
    ...pipeLine(0.20, -0.02, 0.13, 0.24, 0, "brass"),
    ...lamp(-0.18, -0.18, 0.34),
    ...lamp(0.36, 0.02, 0.36),
    ...lamp(0.02, -0.22, 0.32),
    ...lamp(-0.02, 0.18, 0.34)
  );
  return pieces;
})();

// -------------------------------------------------------------------------
// CITY — "Industrial Metropolis". A civic engine tower anchors the skyline;
// factories, brass towers, multi-storey blocks, street-spanning pipes,
// elevated bridges, steam vents, cranes and glowing aether conduits make it
// dramatically taller, denser and more intricate.
const civicEngine = (ctx: TownPiece[], x: number, z: number, base: number): void => {
  ctx.push(
    piece("slab", "stone", x, z, base + 0.05, 0.48, 1, 0.48),
    piece("cylFlare", "slate", x, z, base + 0.32, 0.30, 0.44, 0.30),
    piece("cyl", "iron", x, z, base + 0.60, 0.14, 0.27, 0.14),
    piece("cylFlare", "brass", x, z, base + 0.77, 0.10, 0.22, 0.10),
    ...domeOn(x, z, base + 0.88, 0.06, "brassLight")
  );
  ctx.push(...gearWall(x + 0.15, z + 0.07, base + 0.26, 0.17, "brassLight"));
  ctx.push(...gearWall(x - 0.13, z - 0.06, base + 0.44, 0.13));
  ctx.push(...orbTopper(x, z, base + 0.94, 0.06));
};

const vent = (ctx: TownPiece[], x: number, z: number, h: number): void => {
  ctx.push(
    piece("cyl", "iron", x, z, h * 0.5, 0.05, h, 0.05),
    ...domeOn(x, z, h, 0.03, "charcoal")
  );
};

const craneBig = (ctx: TownPiece[], x: number, z: number, ry: number): void => {
  ctx.push(
    piece("cube", "ironDark", x, z, 0.08, 0.14, 0.16, 0.14),
    piece("piston", "iron", x, z, 0.30, 1, 0.40, 1),
    ...gearDeck(x, z, 0.48, 0.11)
  );
  const dx = Math.cos(ry) * 0.22;
  const dz = Math.sin(ry) * 0.22;
  ctx.push(
    piece("piston", "ironDark", x + dx * 0.7, z + dz * 0.7, 0.26, 0.44, 1, 1, ry),
    glow("amberGlow", x + dx, z + dz, 0.27, 0.08, 0.08, 0.08)
  );
};

export const CITY_LAYOUT: TownLayout = (() => {
  const pieces: TownPiece[] = [];
  civicEngine(pieces, 0, 0, 0);
  pieces.push(...tower(0.22, 0.22, 0.40, "charcoal", "ironDark", 0.10, 0.10));
  pieces.push(...tower(-0.22, -0.18, 0.36, "slate", "charcoal", 0.10, 0.10));

  // Factories with tall controlled chimneys.
  pieces.push(...block(-0.34, -0.22, 0.28, 0.46, 0.26, "iron", "slateLight"));
  pieces.push(...tower(-0.26, -0.16, 0.36, "charcoal", "ironDark", 0.09, 0.46));
  pieces.push(...block(0.34, 0.30, 0.28, 0.50, 0.26, "slate", "brassDark"));
  pieces.push(...tower(0.26, 0.22, 0.34, "ironDark", "charcoal", 0.09, 0.50));
  pieces.push(...workshop(-0.18, 0.40, 0.24, 0.40, 0.22, "ironDark", "slateLight", 0.30, "charcoal"));

  // Brass towers — hero clusters on opposite corners.
  pieces.push(...tower(-0.36, 0.14, 0.54, "brass", "brassDark", 0.12));
  pieces.push(...tower(0.24, -0.40, 0.60, "brassLight", "brass", 0.11));
  pieces.push(...tower(0.42, -0.02, 0.48, "brassDark", "brass", 0.10));

  // Multi-storey blocks, stepped.
  pieces.push(...blockStorey(-0.20, -0.38, 0.26, 0.26, 0.24, "slate", 0));
  pieces.push(...blockStorey(-0.20, -0.38, 0.24, 0.24, 0.22, "iron", 0.28));
  pieces.push(...blockStorey(0.36, 0.36, 0.20, 0.24, 0.18, "stone", 0));
  pieces.push(...needle(0.36, 0.36, 0.26, "brassDark", 0.24, 0.06));
  pieces.push(...blockStorey(-0.34, 0.36, 0.16, 0.22, 0.15, "wood", 0));
  pieces.push(...cottage(-0.36, -0.40, 0.16, 0.24, 0.14, "woodLight", "roofRed"));

  // Bridges across the central streets.
  pieces.push(
    piece("beam", "iron", -0.04, 0.20, 0.30, 0.56, 0.07, 1, 0),
    ...aetherLine(-0.04, 0.20, 0.36, 0.56, 0),
    piece("beam", "iron", -0.02, -0.20, 0.32, 0.48, 0.07, 1, 0),
    ...aetherLine(-0.02, -0.20, 0.38, 0.48, 0)
  );

  // Street-spanning pipe runs.
  pieces.push(...pipeLine(0, 0.12, 0.20, 0.40, 0, "brass"));
  pieces.push(...pipeLine(0, -0.12, 0.20, 0.40, 0, "brassDark"));
  pieces.push(...pipeLine(0.20, -0.02, 0.14, 0.20, Math.PI / 2, "ironDark"));

  // Steam vents.
  vent(pieces, 0.30, 0.02, 0.22);
  vent(pieces, -0.12, -0.02, 0.18);
  vent(pieces, -0.30, 0.30, 0.20);

  // Giant gear clusters + aether conduits along the avenues.
  pieces.push(...gearWall(0.30, 0.16, 0.36, 0.16));
  pieces.push(...gearDeck(0.34, -0.10, 0.36, 0.14, "brassLight"));
  pieces.push(...gearDeck(-0.20, 0.18, 0.20, 0.10));

  pieces.push(...lamp(0.20, -0.20, 0.36));
  pieces.push(...lamp(-0.24, 0.26, 0.36));
  pieces.push(...lamp(0.04, 0.40, 0.34));
  pieces.push(...lamp(-0.40, -0.30, 0.34));
  pieces.push(...lamp(0.40, 0.14, 0.34));

  // Cranes on the edges.
  craneBig(pieces, 0.14, 0.46, 0);
  craneBig(pieces, -0.44, -0.36, Math.PI / 2);

  return pieces;
})();