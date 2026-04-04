import { WORLD_HEIGHT, WORLD_WIDTH, grassShadeAt, landBiomeAt, terrainAt } from "@border-empires/shared";
import { isForestTile } from "./client-constants.js";
import type { EmpireVisualStyle, Tile } from "./client-types.js";

type TileMap = Map<string, Tile>;
type TerrainTextureId = "SEA_DEEP" | "SEA_COAST" | "SAND" | "GRASS_LIGHT" | "GRASS_DARK" | "MOUNTAIN";

const TERRAIN_TEXTURE_SIZE = 64;
const overlayAssetVersion = "20260402b";
const overlaySrc = (filename: string): string => `/overlays/${filename}?v=${overlayAssetVersion}`;
const loadOverlayImage = (filename: string): HTMLImageElement => {
  const image = new Image();
  image.decoding = "async";
  image.src = overlaySrc(filename);
  return image;
};
const createOverlayVariantSet = (filenames: readonly string[]): HTMLImageElement[] => filenames.map(loadOverlayImage);
const createTownOverlaySet = (
  sources: Record<NonNullable<Tile["town"]>["populationTier"], string>
): Record<NonNullable<Tile["town"]>["populationTier"], HTMLImageElement> => {
  const set = {
    SETTLEMENT: new Image(),
    TOWN: new Image(),
    CITY: new Image(),
    GREAT_CITY: new Image(),
    METROPOLIS: new Image()
  };
  set.SETTLEMENT.src = sources.SETTLEMENT;
  set.TOWN.src = sources.TOWN;
  set.CITY.src = sources.CITY;
  set.GREAT_CITY.src = sources.GREAT_CITY;
  set.METROPOLIS.src = sources.METROPOLIS;
  return set;
};

const aetherBridgeAnchorImage = new Image();
aetherBridgeAnchorImage.decoding = "async";
aetherBridgeAnchorImage.src = overlaySrc("aether-pylon-overlay.svg");

const defaultTownOverlayByTier = createTownOverlaySet({
  SETTLEMENT: overlaySrc("settlement-overlay-sand.svg"),
  TOWN: overlaySrc("town-overlay-sand.svg"),
  CITY: overlaySrc("city-overlay-sand.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-sand.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-sand.svg")
});
const grassTownOverlayByTier = createTownOverlaySet({
  SETTLEMENT: overlaySrc("settlement-overlay-grass.svg"),
  TOWN: overlaySrc("town-overlay-grass.svg"),
  CITY: overlaySrc("city-overlay-grass.svg"),
  GREAT_CITY: overlaySrc("great-city-overlay-grass.svg"),
  METROPOLIS: overlaySrc("metropolis-overlay-grass.svg")
});

export const dockOverlayVariants = createOverlayVariantSet(["dock-overlay-1.svg", "dock-overlay-2.svg", "dock-overlay-3.svg"]);
export const structureOverlayImages = {
  OBSERVATORY: loadOverlayImage("observatory-overlay.svg"),
  MARKET: loadOverlayImage("market-overlay.svg"),
  GRANARY: loadOverlayImage("granary-overlay.svg"),
  FUR_SYNTHESIZER: loadOverlayImage("fur-synthesizer-overlay.svg"),
  ADVANCED_FUR_SYNTHESIZER: loadOverlayImage("advanced-fur-synthesizer-overlay.svg"),
  ADVANCED_IRONWORKS: loadOverlayImage("advanced-ironworks-overlay.svg"),
  ADVANCED_CRYSTAL_SYNTHESIZER: loadOverlayImage("advanced-crystal-synthesizer-overlay.svg")
} as const;

const builtResourceOverlayVariants = {
  FARM_FARMSTEAD: createOverlayVariantSet(["farm-farmstead-overlay-1.svg", "farm-farmstead-overlay-2.svg", "farm-farmstead-overlay-3.svg"]),
  FISH_FARMSTEAD: createOverlayVariantSet(["fish-farmstead-overlay-1.svg", "fish-farmstead-overlay-2.svg", "fish-farmstead-overlay-3.svg"]),
  FUR_CAMP: createOverlayVariantSet(["fur-camp-overlay-1.svg", "fur-camp-overlay-2.svg", "fur-camp-overlay-3.svg"]),
  IRON_MINE: createOverlayVariantSet(["iron-mine-overlay-1.svg", "iron-mine-overlay-2.svg", "iron-mine-overlay-3.svg"]),
  GEMS_MINE: createOverlayVariantSet(["gems-mine-overlay-1.svg", "gems-mine-overlay-2.svg", "gems-mine-overlay-3.svg", "gems-mine-overlay-4.svg"])
} as const;
const resourceOverlayVariants = {
  FARM: createOverlayVariantSet(["farm-overlay-1.svg", "farm-overlay-2.svg", "farm-overlay-3.svg"]),
  FISH: createOverlayVariantSet(["fish-overlay-1.svg", "fish-overlay-2.svg", "fish-overlay-3.svg"]),
  FUR: createOverlayVariantSet(["fur-overlay-1.svg", "fur-overlay-2.svg", "fur-overlay-3.svg"]),
  IRON: createOverlayVariantSet(["iron-overlay-1.svg", "iron-overlay-2.svg", "iron-overlay-3.svg"]),
  GEMS: createOverlayVariantSet(["gems-overlay-1.svg", "gems-overlay-2.svg", "gems-overlay-3.svg", "gems-overlay-4.svg"])
} as const;
const shardOverlayVariants = {
  CACHE: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"]),
  FALL: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"])
} as const;

const textureCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = TERRAIN_TEXTURE_SIZE;
  canvas.height = TERRAIN_TEXTURE_SIZE;
  return canvas;
};
const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const tint = (r: number, g: number, b: number, delta: number): [number, number, number] => [
  clamp255(r + delta),
  clamp255(g + delta),
  clamp255(b + delta)
];
const terrainTextures = new Map<TerrainTextureId, HTMLCanvasElement>();
const makeTerrainTexture = (
  base: [number, number, number],
  options: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean }
): HTMLCanvasElement => {
  const canvas = textureCanvas();
  const tctx = canvas.getContext("2d");
  if (!tctx) return canvas;
  const img = tctx.createImageData(TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const index = (y * TERRAIN_TEXTURE_SIZE + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (options.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (options.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let delta = grain * options.grain + wave * (options.waveA ? 10 : 0);
      if (options.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        delta -= Math.max(0, crack) * options.crack;
      }
      if (options.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        delta += blade * 0.25;
      }
      if (options.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        delta += pebble * 14;
      }
      const [r, g, b] = tint(br, bg, bb, delta);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);
  return canvas;
};

export const initTerrainTextures = (): void => {
  terrainTextures.set("SEA_DEEP", makeTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 }));
  terrainTextures.set("SEA_COAST", makeTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 }));
  terrainTextures.set("SAND", makeTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 }));
  terrainTextures.set("GRASS_LIGHT", makeTerrainTexture([119, 142, 66], { grain: 10, grass: true }));
  terrainTextures.set("GRASS_DARK", makeTerrainTexture([94, 124, 48], { grain: 10, grass: true }));
  const mountain = makeTerrainTexture([126, 126, 129], { grain: 9, crack: 8, rock: true });
  const mctx = mountain.getContext("2d");
  if (mctx) {
    mctx.fillStyle = "rgba(78, 79, 82, 0.82)";
    mctx.beginPath();
    mctx.moveTo(8, 50);
    mctx.lineTo(28, 20);
    mctx.lineTo(46, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(97, 99, 103, 0.85)";
    mctx.beginPath();
    mctx.moveTo(20, 50);
    mctx.lineTo(41, 26);
    mctx.lineTo(56, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(225, 228, 232, 0.75)";
    mctx.beginPath();
    mctx.moveTo(27, 23);
    mctx.lineTo(32, 31);
    mctx.lineTo(37, 23);
    mctx.closePath();
    mctx.fill();
  }
  terrainTextures.set("MOUNTAIN", mountain);
};

export const overlayVariantIndexAt = (x: number, y: number, count: number): number => {
  const hash = (((x + 1) * 374761393) ^ ((y + 1) * 668265263)) >>> 0;
  return hash % count;
};

type VisualStyleLookup = (ownerId: string) => EmpireVisualStyle | undefined;

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((value) => `${value}${value}`).join("") : clean;
  const parsed = Number.parseInt(full, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
};
export const effectiveOverlayColor = (
  ownerId: string,
  deps: { ownerColor: (ownerId: string) => string; visualStyleForOwner: VisualStyleLookup }
): string => deps.ownerColor(ownerId);

export const borderColorForOwner = (
  ownerId: string,
  stateName: Tile["ownershipState"] | undefined,
  visualStyleForOwner: VisualStyleLookup
): string => {
  if (ownerId === "barbarian") return "rgba(95, 108, 122, 0.8)";
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
  if (style.borderStyle === "HEAVY") return "rgba(58, 66, 82, 0.9)";
  if (style.borderStyle === "DASHED") return "rgba(198, 167, 112, 0.82)";
  if (style.borderStyle === "SOFT") return "rgba(176, 221, 133, 0.88)";
  if (style.borderStyle === "GLOW") return "rgba(126, 208, 255, 0.92)";
  return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
};

export const shouldDrawOwnershipBorder = (tile: Tile, visualStyleForOwner: VisualStyleLookup): boolean => {
  if (!tile.ownerId || tile.ownershipState === "FRONTIER") return false;
  if (tile.ownerId === "barbarian") return true;
  const style = visualStyleForOwner(tile.ownerId);
  return Boolean(style && style.borderStyle !== "SHARP");
};

export const borderLineWidthForOwner = (
  ownerId: string,
  stateName: Tile["ownershipState"] | undefined,
  visualStyleForOwner: VisualStyleLookup
): number => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "SETTLED" ? 2 : 1;
  if (style.borderStyle === "HEAVY") return 3;
  if (style.borderStyle === "GLOW") return 2.5;
  if (style.borderStyle === "SOFT") return 2.25;
  return stateName === "SETTLED" ? 2 : 1.5;
};

export const structureAccentColor = (ownerId: string, fallback: string, visualStyleForOwner: VisualStyleLookup): string => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return fallback;
  if (style.structureAccent === "IRON") return "rgba(160, 176, 196, 0.96)";
  if (style.structureAccent === "SUPPLY") return "rgba(232, 176, 94, 0.95)";
  if (style.structureAccent === "FOOD") return "rgba(176, 233, 122, 0.95)";
  if (style.structureAccent === "CRYSTAL") return "rgba(131, 221, 255, 0.95)";
  return fallback;
};

const ownershipPatternTone = (ownerId: string, visualStyleForOwner: VisualStyleLookup): string => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return "rgba(255,255,255,0.14)";
  if (style.secondaryTint === "IRON") return "rgba(214, 225, 239, 0.16)";
  if (style.secondaryTint === "SUPPLY") return "rgba(238, 198, 126, 0.16)";
  if (style.secondaryTint === "FOOD") return "rgba(186, 238, 144, 0.16)";
  if (style.secondaryTint === "CRYSTAL") return "rgba(159, 220, 255, 0.16)";
  return "rgba(255,255,255,0.14)";
};

export const drawOwnershipSignature = (
  ctx: CanvasRenderingContext2D,
  ownerId: string,
  px: number,
  py: number,
  size: number,
  visualStyleForOwner: VisualStyleLookup
): void => {
  const style = visualStyleForOwner(ownerId);
  if (!style || size < 12) return;
  const tone = ownershipPatternTone(ownerId, visualStyleForOwner);
  ctx.save();
  ctx.strokeStyle = tone;
  ctx.fillStyle = tone;
  ctx.lineWidth = 1;
  if (style.borderStyle === "HEAVY") {
    ctx.fillRect(px + 2, py + 2, Math.max(2, Math.floor(size * 0.18)), size - 4);
    ctx.fillRect(px + size - Math.max(2, Math.floor(size * 0.18)) - 2, py + 2, Math.max(2, Math.floor(size * 0.18)), size - 4);
  } else if (style.borderStyle === "DASHED") {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px + 3, py + size - 4);
    ctx.lineTo(px + size - 4, py + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (style.borderStyle === "SOFT") {
    const radius = Math.max(1.5, size * 0.1);
    ctx.beginPath();
    ctx.arc(px + size * 0.32, py + size * 0.32, radius, 0, Math.PI * 2);
    ctx.arc(px + size * 0.68, py + size * 0.68, radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.borderStyle === "GLOW") {
    ctx.beginPath();
    ctx.moveTo(px + size / 2, py + 3);
    ctx.lineTo(px + size - 3, py + size / 2);
    ctx.lineTo(px + size / 2, py + size - 3);
    ctx.lineTo(px + 3, py + size / 2);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeRect(px + size * 0.28, py + size * 0.28, size * 0.44, size * 0.44);
  }
  ctx.restore();
};

const isCoastalSea = (x: number, y: number, wrapX: (value: number) => number, wrapY: (value: number) => number): boolean => {
  if (terrainAt(x, y) !== "SEA") return false;
  const neighbors = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return neighbors.includes("LAND");
};
const terrainTextureIdAt = (
  x: number,
  y: number,
  terrain: Tile["terrain"],
  wrapX: (value: number) => number,
  wrapY: (value: number) => number
): TerrainTextureId => {
  if (terrain === "SEA") return isCoastalSea(x, y, wrapX, wrapY) ? "SEA_COAST" : "SEA_DEEP";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(x, y);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  return grassShadeAt(x, y) === "DARK" ? "GRASS_DARK" : "GRASS_LIGHT";
};

export const drawTerrainTile = (
  ctx: CanvasRenderingContext2D,
  options: {
    wx: number;
    wy: number;
    terrain: Tile["terrain"];
    px: number;
    py: number;
    size: number;
    wrapX: (value: number) => number;
    wrapY: (value: number) => number;
    cachedTerrainColorAt: (x: number, y: number, terrain: Tile["terrain"]) => string;
  }
): void => {
  if (options.size < 8) {
    ctx.fillStyle = options.cachedTerrainColorAt(options.wx, options.wy, options.terrain);
    ctx.fillRect(options.px, options.py, options.size, options.size);
    return;
  }
  const id = terrainTextureIdAt(options.wx, options.wy, options.terrain, options.wrapX, options.wrapY);
  const texture = terrainTextures.get(id);
  if (!texture) {
    ctx.fillStyle = options.cachedTerrainColorAt(options.wx, options.wy, options.terrain);
    ctx.fillRect(options.px, options.py, options.size, options.size);
    return;
  }
  ctx.drawImage(texture, 0, 0, texture.width, texture.height, options.px, options.py, options.size, options.size);
};

export const drawForestOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number
): void => {
  if (size < 12 || !isForestTile(wx, wy)) return;
  const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.17 + wy * 0.11));
  const treeCount = size >= 44 ? 4 : size >= 24 ? 3 : 2;
  const anchors: Array<[number, number]> =
    treeCount === 4
      ? [[0.22, 0.6], [0.42, 0.44], [0.62, 0.58], [0.8, 0.42]]
      : treeCount === 3
        ? [[0.24, 0.62], [0.5, 0.42], [0.76, 0.58]]
        : [[0.34, 0.6], [0.68, 0.5]];
  ctx.save();
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor) continue;
    const [ax, ay] = anchor;
    const trunkW = Math.max(1, size * 0.045);
    const canopyW = size * (0.2 + i * 0.015);
    const canopyH = canopyW * 0.92;
    const tx = px + size * ax;
    const ty = py + size * ay;
    ctx.fillStyle = `rgba(28, 54, 27, ${0.4 + pulse * 0.16})`;
    ctx.fillRect(tx - trunkW / 2, ty - size * 0.02, trunkW, size * 0.12);
    ctx.fillStyle = `rgba(14, 41, 18, ${0.72 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.64);
    ctx.lineTo(tx - canopyW * 0.46, ty + canopyH * 0.14);
    ctx.lineTo(tx + canopyW * 0.46, ty + canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(52, 96, 45, ${0.32 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.52);
    ctx.lineTo(tx - canopyW * 0.24, ty - canopyH * 0.05);
    ctx.lineTo(tx + canopyW * 0.12, ty - canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

export const drawAetherBridgeLane = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  nowMs: number,
  options?: { compact?: boolean }
): void => {
  const compact = options?.compact ?? false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const pulseOffset = ((nowMs / 1100) % 1 + 1) % 1;
  const laneAngle = Math.atan2(dy, dx);
  const drawAnchorGlyph = (x: number, y: number, angle: number): void => {
    if (compact || !aetherBridgeAnchorImage.complete || !aetherBridgeAnchorImage.naturalWidth) {
      const ringColor = compact ? "rgba(192, 245, 255, 0.72)" : "rgba(192, 245, 255, 0.82)";
      const anchorFill = compact ? "rgba(20, 82, 102, 0.78)" : "rgba(18, 74, 96, 0.72)";
      const ringRadius = compact ? 2.4 : 8;
      const coreRadius = compact ? 1.25 : 3.8;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = compact ? 1 : 2;
      ctx.beginPath();
      ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = anchorFill;
      ctx.beginPath();
      ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const glyphSize = compact ? 8 : 28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = compact ? 0.9 : 0.98;
    ctx.drawImage(aetherBridgeAnchorImage, -glyphSize * 0.5, -glyphSize * 0.5, glyphSize, glyphSize);
    ctx.restore();
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = compact ? "rgba(81, 210, 255, 0.22)" : "rgba(81, 210, 255, 0.18)";
  ctx.lineWidth = compact ? 4 : 10;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.strokeStyle = compact ? "rgba(164, 240, 255, 0.55)" : "rgba(164, 240, 255, 0.48)";
  ctx.lineWidth = compact ? 1.6 : 3.5;
  ctx.setLineDash(compact ? [4, 3] : [12, 8]);
  ctx.lineDashOffset = -((nowMs / (compact ? 160 : 120)) % (compact ? 7 : 20));
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  drawAnchorGlyph(fromX, fromY, laneAngle);
  drawAnchorGlyph(toX, toY, laneAngle + Math.PI);
  const pulseCount = compact ? 2 : 3;
  for (let i = 0; i < pulseCount; i += 1) {
    const t = (pulseOffset + i / pulseCount) % 1;
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    ctx.fillStyle = compact ? "rgba(234, 252, 255, 0.9)" : "rgba(234, 252, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(px, py, compact ? 1.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = compact ? "rgba(112, 219, 255, 0.38)" : "rgba(112, 219, 255, 0.22)";
    ctx.beginPath();
    ctx.arc(px, py, compact ? 2.6 : 6.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const arcCount = compact ? 1 : 2;
  for (let i = 0; i < arcCount; i += 1) {
    const t = (pulseOffset * 0.85 + i / arcCount) % 1;
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    const normalScale = compact ? 2.2 : 6;
    const arcLength = compact ? 6 : 18;
    const ax = px - nx * arcLength * 0.5;
    const ay = py - ny * arcLength * 0.5;
    const bx = px + nx * arcLength * 0.5;
    const by = py + ny * arcLength * 0.5;
    ctx.strokeStyle = compact ? "rgba(156, 232, 255, 0.3)" : "rgba(156, 232, 255, 0.36)";
    ctx.lineWidth = compact ? 0.9 : 1.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(px + -ny * normalScale, py + nx * normalScale, bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(px + ny * normalScale, py + -nx * normalScale, bx, by);
    ctx.stroke();
  }
  ctx.restore();
};

const sharesBorderTerritory = (tile: Tile, neighbor?: Tile): boolean => {
  if (!neighbor || neighbor.fogged || neighbor.ownerId !== tile.ownerId) return false;
  return neighbor.ownershipState === tile.ownershipState;
};

export const drawExposedTileBorder = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
  deps: { tiles: TileMap; keyFor: (x: number, y: number) => string; wrapX: (value: number) => number; wrapY: (value: number) => number }
): void => {
  const top = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y - 1)));
  const right = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + 1), deps.wrapY(tile.y)));
  const bottom = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y + 1)));
  const left = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x - 1), deps.wrapY(tile.y)));
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  ctx.beginPath();
  if (!sharesBorderTerritory(tile, top)) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
  }
  if (!sharesBorderTerritory(tile, right)) {
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
  }
  if (!sharesBorderTerritory(tile, bottom)) {
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y2);
  }
  if (!sharesBorderTerritory(tile, left)) {
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
};

export const drawCenteredOverlay = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const drawSize = size * scale;
  const offset = (drawSize - size) / 2;
  ctx.drawImage(overlay, px - offset, py - offset, drawSize, drawSize);
};

export const drawCenteredOverlayWithAlpha = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08,
  alpha = 1
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  drawCenteredOverlay(ctx, overlay, px, py, size, scale);
  ctx.globalAlpha = prevAlpha;
};

const drawResourceMarkerIcon = (ctx: CanvasRenderingContext2D, resource: string | undefined, x: number, y: number, badge: number): void => {
  const icon =
    resource === "FARM" || resource === "FISH" ? "🍞"
    : resource === "IRON" ? "⛏"
    : resource === "GEMS" ? "💎"
    : resource === "FUR" ? "🦊"
    : resource === "WOOD" ? "🪵"
    : "";
  if (!icon) return;
  ctx.font = `${Math.max(8, badge * 0.8)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x + badge / 2, y + badge / 2 + 0.5);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
};

export const drawResourceCornerMarker = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
  resourceColor: (resource: string | undefined) => string | undefined
): void => {
  if (!tile.resource) return;
  const color = resourceColor(tile.resource);
  if (!color) return;
  const badge = Math.max(9, size * 0.22);
  const inset = Math.max(2, size * 0.03);
  ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
  ctx.fillRect(px + inset - 1, py + inset - 1, badge + 2, badge + 2);
  ctx.fillStyle = color;
  ctx.fillRect(px + inset, py + inset, badge, badge);
  ctx.fillStyle = "rgba(22, 24, 28, 0.95)";
  drawResourceMarkerIcon(ctx, tile.resource, px + inset, py + inset, badge);
};

export const drawTownMarker = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, fullTile = false): void => {
  const badge = fullTile ? Math.max(8, size - 2) : Math.max(9, size * 0.22);
  const inset = fullTile ? 1 : Math.max(2, size * 0.03);
  const x = px + inset;
  const y = py + inset;
  ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
  ctx.fillRect(x - 1, y - 1, badge + 2, badge + 2);
  ctx.fillStyle = "rgba(255, 208, 102, 0.98)";
  ctx.fillRect(x, y, badge, badge);
  const coinRadius = Math.max(2, badge * 0.28);
  const coinX = x + badge / 2;
  const coinY = y + badge / 2;
  ctx.fillStyle = "rgba(255, 233, 153, 0.98)";
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(173, 112, 18, 0.95)";
  ctx.lineWidth = Math.max(1, badge * 0.08);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 247, 221, 0.88)";
  ctx.lineWidth = Math.max(0.8, badge * 0.04);
  ctx.beginPath();
  ctx.arc(coinX - coinRadius * 0.18, coinY - coinRadius * 0.16, Math.max(1, coinRadius * 0.45), 0, Math.PI * 2);
  ctx.stroke();
};

export const drawTownOverlay = (ctx: CanvasRenderingContext2D, tile: Tile, px: number, py: number, size: number): void => {
  if (!tile.town) return;
  if (size < 16) {
    drawTownMarker(ctx, px, py, size, true);
    if (!tile.town.isFed) {
      const badgeSize = Math.max(6, size * 0.24);
      const badgeX = px + size - badgeSize - 1;
      const badgeY = py + 1;
      ctx.fillStyle = "rgba(201, 74, 56, 0.96)";
      ctx.beginPath();
      ctx.moveTo(badgeX, badgeY + badgeSize);
      ctx.lineTo(badgeX + badgeSize * 0.5, badgeY);
      ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  const accent = tile.town.type === "MARKET" ? "rgba(255, 212, 102, 0.9)" : "rgba(162, 241, 132, 0.88)";
  const biome = landBiomeAt(tile.x, tile.y);
  const overlaySet = biome === "GRASS" ? grassTownOverlayByTier : defaultTownOverlayByTier;
  const overlay = overlaySet[tile.town.populationTier];
  if (!overlay.complete || !overlay.naturalWidth) {
    const marker = Math.max(4, Math.floor(size * 0.34));
    const mx = px + Math.floor((size - marker) / 2);
    const my = py + Math.floor((size - marker) / 2);
    ctx.fillStyle = "rgba(10, 14, 24, 0.82)";
    ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
    ctx.fillStyle = tile.town.type === "MARKET" ? "rgba(255, 212, 102, 0.95)" : "rgba(162, 241, 132, 0.95)";
    ctx.fillRect(mx, my, marker, marker);
    return;
  }
  const scaleByTier =
    tile.town.populationTier === "SETTLEMENT" ? 0.94
    : tile.town.populationTier === "TOWN" ? 1.46
    : tile.town.populationTier === "CITY" ? 1.58
    : tile.town.populationTier === "GREAT_CITY" ? 1.72
    : 1.86;
  const drawSize = size * scaleByTier;
  const offsetX = (drawSize - size) / 2;
  const offsetY =
    tile.town.populationTier === "SETTLEMENT" ? drawSize * 0.06
    : tile.town.populationTier === "TOWN" ? drawSize * 0.28
    : tile.town.populationTier === "CITY" ? drawSize * 0.32
    : tile.town.populationTier === "GREAT_CITY" ? drawSize * 0.35
    : drawSize * 0.39;
  ctx.drawImage(overlay, px - offsetX, py - offsetY, drawSize, drawSize);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px + size * 0.22, py + size * 0.88);
  ctx.lineTo(px + size * 0.78, py + size * 0.88);
  ctx.stroke();
  ctx.lineWidth = 1;
  if (!tile.town.isFed) {
    const badgeSize = Math.max(8, size * 0.24);
    const badgeX = px + size * 0.72;
    const badgeY = py + size * 0.08;
    ctx.fillStyle = "rgba(201, 74, 56, 0.96)";
    ctx.beginPath();
    ctx.moveTo(badgeX, badgeY + badgeSize);
    ctx.lineTo(badgeX + badgeSize * 0.5, badgeY);
    ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(39, 14, 9, 0.78)";
    ctx.lineWidth = Math.max(1.2, size * 0.035);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 243, 219, 0.98)";
    ctx.font = `bold ${Math.max(8, size * 0.16)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", badgeX + badgeSize * 0.5, badgeY + badgeSize * 0.62);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  drawTownMarker(ctx, px, py, size, false);
};

export const drawBarbarianSkullOverlay = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void => {
  if (size < 10) return;
  const skullSize = Math.max(6, size * 0.48);
  const cx = px + size / 2;
  const cy = py + size / 2 - skullSize * 0.02;
  const craniumRadius = skullSize * 0.28;
  const jawWidth = skullSize * 0.38;
  const jawHeight = skullSize * 0.2;
  const jawX = cx - jawWidth / 2;
  const jawY = cy + skullSize * 0.1;
  ctx.save();
  ctx.fillStyle = "rgba(196, 203, 210, 0.72)";
  ctx.strokeStyle = "rgba(56, 62, 70, 0.5)";
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy - skullSize * 0.08, craniumRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(jawX, jawY, jawWidth, jawHeight, Math.max(1, skullSize * 0.05));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(43, 48, 56, 0.82)";
  const eyeRadius = skullSize * 0.065;
  ctx.beginPath();
  ctx.arc(cx - skullSize * 0.11, cy - skullSize * 0.09, eyeRadius, 0, Math.PI * 2);
  ctx.arc(cx + skullSize * 0.11, cy - skullSize * 0.09, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - skullSize * 0.01);
  ctx.lineTo(cx - skullSize * 0.05, cy + skullSize * 0.08);
  ctx.lineTo(cx + skullSize * 0.05, cy + skullSize * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(43, 48, 56, 0.65)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  const toothTop = jawY + jawHeight * 0.18;
  const toothBottom = jawY + jawHeight * 0.82;
  for (const offset of [-0.09, 0, 0.09]) {
    const toothX = cx + skullSize * offset;
    ctx.beginPath();
    ctx.moveTo(toothX, toothTop);
    ctx.lineTo(toothX, toothBottom);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawIncomingAttackOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  resolvesAt: number
): void => {
  if (size < 10) return;
  const remainingMs = Math.max(0, resolvesAt - Date.now());
  const urgency = Math.max(0.2, Math.min(1, 1 - remainingMs / 4000));
  const phase = Date.now() / 180 + wx * 0.9 + wy * 0.7;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase));
  const alpha = 0.18 + pulse * (0.16 + urgency * 0.22);
  const ringInset = 1 + Math.max(0, Math.floor(size * 0.08 * (1 - pulse)));
  ctx.save();
  ctx.fillStyle = `rgba(255, 72, 72, ${alpha.toFixed(3)})`;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.strokeStyle = `rgba(255, 214, 214, ${(0.38 + urgency * 0.34 + pulse * 0.08).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + ringInset, py + ringInset, size - ringInset * 2, size - ringInset * 2);
  const cx = px + size / 2;
  const cy = py + size / 2;
  const arm = Math.max(3, size * 0.18);
  ctx.strokeStyle = `rgba(72, 10, 10, ${(0.52 + urgency * 0.22).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy - arm);
  ctx.lineTo(cx + arm, cy + arm);
  ctx.moveTo(cx + arm, cy - arm);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.stroke();
  ctx.restore();
};

export const resourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource) return undefined;
  const variants = resourceOverlayVariants[tile.resource as keyof typeof resourceOverlayVariants];
  if (!variants) return undefined;
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const builtResourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource || !tile.economicStructure) return undefined;
  const key =
    tile.resource === "FARM" && tile.economicStructure.type === "FARMSTEAD" ? "FARM_FARMSTEAD"
    : tile.resource === "FISH" && tile.economicStructure.type === "FARMSTEAD" ? "FISH_FARMSTEAD"
    : tile.resource === "FUR" && tile.economicStructure.type === "CAMP" ? "FUR_CAMP"
    : tile.resource === "IRON" && tile.economicStructure.type === "MINE" ? "IRON_MINE"
    : tile.resource === "GEMS" && tile.economicStructure.type === "MINE" ? "GEMS_MINE"
    : undefined;
  if (!key) return undefined;
  const variants = builtResourceOverlayVariants[key];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const shardOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.shardSite) return undefined;
  const variants = shardOverlayVariants[tile.shardSite.kind];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const drawShardFallback = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void => {
  const cx = px + size / 2;
  ctx.fillStyle = "rgba(41, 26, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.76, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(22, 35, 49, 0.94)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.24);
  ctx.lineTo(px + size * 0.7, py + size * 0.42);
  ctx.lineTo(px + size * 0.63, py + size * 0.67);
  ctx.lineTo(px + size * 0.37, py + size * 0.67);
  ctx.lineTo(px + size * 0.3, py + size * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(50, 210, 233, 0.98)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.31);
  ctx.lineTo(px + size * 0.62, py + size * 0.45);
  ctx.lineTo(px + size * 0.57, py + size * 0.64);
  ctx.lineTo(px + size * 0.43, py + size * 0.64);
  ctx.lineTo(px + size * 0.38, py + size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 223, 132, 0.58)";
  ctx.lineWidth = Math.max(1.2, size * 0.045);
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.68, size * 0.2, size * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
};

export const resourceOverlayScaleForTile = (tile: Tile): number => {
  if (tile.resource === "FISH") return 1.3;
  if (tile.resource === "IRON") return 1.2;
  return 1.08;
};

export const economicStructureOverlayAlpha = (tile: Tile): number => {
  const status = tile.economicStructure?.status;
  if (status === "active") return 1;
  if (status === "under_construction") return 0.8;
  return 0.7;
};

export const hexWithAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
