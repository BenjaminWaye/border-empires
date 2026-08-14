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
  type TownLayout,
  type TownPiece
} from "./town-tier-shapes.js";

// -------------------------------------------------------------------------
// GREAT_CITY — "Imperial Powerhouse". A grand civic complex with twin brass
// towers and a colossal dome holds the centre; an elevated transit loop,
// huge exposed gears, a clock tower, an aether beacon and dense district
// blocks make it read as a full imperial capital.
const civicComplex = (ctx: TownPiece[], x: number, z: number, base: number): void => {
  ctx.push(
    piece("slab", "stone", x, z, base + 0.05, 0.46, 1, 0.46),
    piece("cube", "stone", x, z, base + 0.21, 0.34, 0.30, 0.34),
    piece("slab", "brassDark", x, z, base + 0.38, 0.28, 1, 0.28),
    ...domeOn(x, z, base + 0.52, 0.16, "brass"),
    glow("aetherLamp", x, z, base + 0.68, 0.07, 0.07, 0.07)
  );
  ctx.push(...tower(x - 0.19, z - 0.22, 0.72, "brass", "brassDark", 0.11, base + 0.10));
  ctx.push(...tower(x + 0.19, z + 0.20, 0.68, "brassLight", "brass", 0.10, base + 0.10));
  ctx.push(...gearWall(x + 0.13, z - 0.04, base + 0.24, 0.20));
  ctx.push(...gearWall(x - 0.14, z + 0.12, base + 0.36, 0.15, "brassLight"));
  ctx.push(...orbTopper(x, z, base + 0.70, 0.06));
};

const gearSpire = (ctx: TownPiece[], x: number, z: number): void => {
  ctx.push(
    piece("cyl", "iron", x, z, 0.25, 0.10, 0.50, 0.10),
    piece("cyl", "ironDark", x, z, 0.55, 0.07, 0.34, 0.07)
  );
  gearWall(x, z, 0.12, 0.24, "brassDark");
  gearWall(x, z, 0.40, 0.20, "brass");
  gearWall(x, z, 0.66, 0.13, "brassLight");
  ctx.push(glow("amberGlow", x, z, 0.78, 0.08, 0.08, 0.08));
};

const aetherBeacon = (ctx: TownPiece[], x: number, z: number): void => {
  ctx.push(
    piece("slab", "stone", x, z, 0.05, 0.16, 1, 0.16),
    ...needle(x, z, 0.78, "iron", 0.10, 0.07),
    ...gearDeck(x, z, 0.88, 0.10, "brassLight")
  );
  ctx.push(...gearWall(x, z, 0.30, 0.12, "brass"));
  ctx.push(glow("aetherLamp", x, z, 0.92, 0.12, 0.12, 0.12));
};

const clockTower = (ctx: TownPiece[], x: number, z: number): void => {
  ctx.push(
    piece("cube", "stone", x, z, 0.15, 0.24, 0.30, 0.24),
    piece("slab", "slateLight", x, z, 0.31, 0.22, 1, 0.22),
    piece("cube", "slate", x, z, 0.44, 0.12, 0.17, 0.12),
    piece("cone", "brassDark", x, z, 0.58, 0.10, 0.46, 0.10)
  );
  gearWall(x + 0.09, z, 0.16, 0.13, "brassLight");
  ctx.push(glow("amberGlow", x, z, 0.72, 0.07, 0.07, 0.07));
};

const transitLoop = (ctx: TownPiece[]): void => {
  const y = 0.38;
  const posts: Array<[number, number, number, number]> = [
    [-0.35, -0.35, Math.PI / 2, 0.70],
    [-0.35, 0.35, Math.PI / 2, 0.70],
    [0.35, -0.35, 0, 0.70],
    [0.35, 0.35, 0, 0.70]
  ];
  for (const [px, pz, ry, len] of posts) {
    ctx.push(
      piece("beam", "charcoal", px, pz, y, len, 0.42, 1, ry),
      ...aetherLine(px, pz, y + 0.06, len, ry)
    );
  }
  const corners: Array<[number, number]> = [
    [-0.35, -0.35],
    [-0.35, 0.35],
    [0.35, -0.35],
    [0.35, 0.35]
  ];
  for (const [px, pz] of corners) {
    ctx.push(
      piece("piston", "ironDark", px, pz, y * 0.5, 1, y, 1),
      glow("aetherLamp", px, pz, y + 0.34, 0.07, 0.07, 0.07)
    );
  }
};

export const GREAT_CITY_LAYOUT: TownLayout = (() => {
  const pieces: TownPiece[] = [];
  civicComplex(pieces, 0, 0, 0);
  transitLoop(pieces);

  // Landmarks on three corners.
  gearSpire(pieces, -0.32, 0.30);
  aetherBeacon(pieces, 0.34, 0.26);
  clockTower(pieces, -0.34, -0.28);

  // Dense organized district blocks.
  pieces.push(...block(0.20, -0.34, 0.26, 0.48, 0.24, "slate", "brassDark"));
  pieces.push(...tower(0.14, -0.22, 0.36, "charcoal", "ironDark", 0.08, 0.48));
  pieces.push(...block(0.30, 0.02, 0.22, 0.44, 0.20, "iron", "slateLight"));
  pieces.push(...gearDeck(0.30, 0.02, 0.44, 0.10, "brass"));
  pieces.push(...block(-0.16, -0.40, 0.22, 0.40, 0.20, "ironDark", "slateLight"));
  pieces.push(...blockStorey(-0.40, 0.06, 0.20, 0.22, 0.18, "wood", 0));
  pieces.push(...blockStorey(-0.40, 0.30, 0.20, 0.24, 0.18, "slate", 0.26));
  pieces.push(...cottage(0.02, 0.44, 0.18, 0.24, 0.16, "woodLight", "roofRed"));

  // Massive cross-city pipe runs.
  pieces.push(...pipeLine(0, 0.36, 0.16, 0.56, 0, "brassDark"));
  pieces.push(...pipeLine(0, -0.36, 0.16, 0.56, 0, "brass"));
  pieces.push(...pipeLine(0.36, 0, 0.14, 0.56, Math.PI / 2, "ironDark"));
  pieces.push(...pipeLine(-0.36, 0, 0.14, 0.56, Math.PI / 2, "brassDark"));

  // Plazas and lamps.
  pieces.push(...gearWall(0.02, -0.02, 0.06, 0.28, "brass"));
  pieces.push(...lamp(-0.20, 0.40, 0.36));
  pieces.push(...lamp(0.40, -0.28, 0.36));
  pieces.push(...lamp(0.20, 0.40, 0.34));
  pieces.push(...lamp(-0.40, -0.12, 0.34));
  pieces.push(...lamp(0.02, -0.22, 0.34));

  // Industrial towers with controlled steam on the rim.
  pieces.push(...tower(-0.08, 0.42, 0.44, "slate", "ironDark", 0.09));
  pieces.push(...tower(0.40, 0.40, 0.40, "charcoal", "ironDark", 0.08));

  return pieces;
})();

// -------------------------------------------------------------------------
// METROPOLIS — "Wonder of the World". A colossal three-part Monument rules
// the skyline; organized districts packed with brass buildings, glowing
// aether conduits and elevated transit radiate outward along grand avenues.
const monument = (ctx: TownPiece[], x: number, z: number): void => {
  ctx.push(
    piece("slab", "stone", x, z, 0.06, 0.52, 1, 0.52),
    piece("slab", "brassDark", x, z, 0.11, 0.40, 1, 0.40),
    piece("cylFlare", "brassDark", x, z, 0.33, 0.24, 0.42, 0.24),
    piece("cylFlare", "brass", x, z, 0.71, 0.16, 0.34, 0.16),
    piece("cylFlare", "brassLight", x, z, 1.00, 0.11, 0.24, 0.11),
    piece("cone", "brassLight", x, z, 1.24, 0.10, 0.34, 0.10),
    ...domeOn(x, z, 1.30, 0.05, "brassLight"),
    ...orbTopper(x, z, 1.36, 0.06)
  );
  gearDeck(x, z, 0.44, 0.26, "brassLight");
  gearDeck(x, z, 0.80, 0.20, "brass");
  gearDeck(x, z, 1.06, 0.14, "brassLight");
  ctx.push(
    glow("amberGlow", x + 0.11, z, 0.34, 0.07, 0.07, 0.07),
    glow("aetherLamp", x - 0.11, z, 0.34, 0.07, 0.07, 0.07)
  );
  // Flanking pylons.
  for (const side of [-1, 1]) {
    ctx.push(
      piece("cylFlare", "brassDark", x + side * 0.21, z, 0.28, 0.13, 0.36, 0.13),
      piece("cylFlare", "brass", x + side * 0.21, z, 0.50, 0.10, 0.24, 0.10),
      piece("cone", "brassLight", x + side * 0.21, z, 0.64, 0.08, 0.30, 0.08),
      glow("aetherLamp", x + side * 0.21, z, 0.76, 0.06, 0.06, 0.06)
    );
  }
};

const district = (
  ctx: TownPiece[],
  sx: number,
  sz: number
): void => {
  ctx.push(
    ...block(sx * 0.22, sz * 0.30, 0.24, 0.46, 0.22, "slate", "brassDark"),
    ...block(sx * 0.36, sz * 0.12, 0.20, 0.40, 0.18, "iron", "slateLight"),
    ...block(sx * 0.12, sz * 0.04, 0.22, 0.50, 0.20, "stone", "brass"),
    ...blockStorey(sx * 0.30, sz * 0.34, 0.20, 0.22, 0.18, "wood", 0),
    ...tower(sx * 0.22, sz * 0.22, 0.56, "brassLight", "brass", 0.09, 0.10),
    ...gearDeck(sx * 0.36, sz * 0.12, 0.40, 0.09, "brassLight"),
    ...lamp(sx * 0.14, sz * 0.42, 0.36),
    ...lamp(sx * 0.44, sz * 0.26, 0.34),
    ...aetherLine(sx * 0.28, sz * 0.22, 0.14, 0.24, 0)
  );
};

const avenueConduit = (ctx: TownPiece[], sx: number, sz: number): void => {
  const ry = Math.atan2(sz, sx);
  ctx.push(...aetherLine(sx * 0.24, sz * 0.24, 0.16, 0.34, ry, "aetherBeam"));
  ctx.push(...aetherLine(sx * 0.44, sz * 0.44, 0.20, 0.22, ry, "aetherBeam"));
};

export const METROPOLIS_LAYOUT: TownLayout = (() => {
  const pieces: TownPiece[] = [];
  monument(pieces, 0, 0);

  const quarters: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  for (const [sx, sz] of quarters) {
    district(pieces, sx, sz);
    avenueConduit(pieces, sx, sz);
  }

  // Elevated transit bridges from the monument to each district.
  const axes: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];
  for (const [sx, sz] of axes) {
    const ry = Math.atan2(sz, sx);
    pieces.push(
      piece("beam", "charcoal", sx * 0.30, sz * 0.30, 0.34, 0.52, 0.36, 1, ry),
      ...aetherLine(sx * 0.30, sz * 0.30, 0.40, 0.52, ry),
      piece("piston", "ironDark", sx * 0.14, sz * 0.14, 0.20, 1, 0.34, 1)
    );
  }

  pieces.push(
    ...pipeLine(0, -0.44, 0.12, 0.36, 0, "brassDark"),
    ...pipeLine(-0.44, 0, 0.12, 0.36, Math.PI / 2, "brassDark"),
    ...tower(0.40, -0.44, 0.42, "slate", "ironDark", 0.08),
    ...tower(-0.40, 0.44, 0.40, "charcoal", "ironDark", 0.08),
    ...cottage(-0.18, -0.44, 0.14, 0.22, 0.12, "woodLight", "roofRed"),
    ...gearWall(0.10, 0.10, 0.08, 0.22)
  );

  return pieces;
})();