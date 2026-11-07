import { isTownGrowthActive, townGrowthRise, townGrowthSink, type TownPopulationTier, type TownTierUpgradeFxEntry } from "./client-town-tier-upgrade-fx.js";

// 2D canvas counterpart of the true-3D town growth (town-growth-shader.ts):
// the old tier's sprite sinks into the ground, then the new tier's sprite
// rises out of it in vertical strips, centre strips first and rippling
// outward, each springing a little past full height -- the same timeline the
// 3D buildings follow, so both maps play the same beat.

/** Where a tier's town sprite sits over its tile (moved out of client-map-render.ts). */
export const townSpriteRect = (tier: TownPopulationTier, px: number, py: number, size: number): { x: number; y: number; size: number } => {
  const scaleByTier = tier === "SETTLEMENT" ? 0.94 : tier === "TOWN" ? 1.46 : tier === "CITY" ? 1.58 : tier === "GREAT_CITY" ? 1.72 : 1.86;
  const drawSize = size * scaleByTier;
  const offsetY =
    tier === "SETTLEMENT" ? drawSize * 0.06
    : tier === "TOWN" ? drawSize * 0.28
    : tier === "CITY" ? drawSize * 0.32
    : tier === "GREAT_CITY" ? drawSize * 0.35
    : drawSize * 0.39;
  return { x: px - (drawSize - size) / 2, y: py - offsetY, size: drawSize };
};

/** Vertical strips the rising sprite is cut into. */
export const TOWN_GROWTH_STRIPS_2D = 12;
/** Fraction of the sprite's height its ground line sits at (the sprites have a little margin below the plate). */
const GROUND_LINE = 0.9;

type SpriteFor = (tier: TownPopulationTier) => CanvasImageSource | undefined;

/**
 * Draws a mid-upgrade town's sprites and returns true, or returns false
 * (drawing nothing) when the town is not mid-upgrade into `tier`.
 */
export const drawTownGrowthSprites2D = (
  ctx: CanvasRenderingContext2D,
  upgrade: TownTierUpgradeFxEntry | undefined,
  tier: TownPopulationTier,
  spriteFor: SpriteFor,
  px: number,
  py: number,
  size: number,
  nowEpochMs: number
): boolean => {
  if (!isTownGrowthActive(upgrade, nowEpochMs) || upgrade.tier !== tier) return false;
  const age = nowEpochMs - upgrade.startedAt;

  const oldSprite = spriteFor(upgrade.fromTier);
  const sink = townGrowthSink(age);
  if (oldSprite && sink > 0) {
    const rect = townSpriteRect(upgrade.fromTier, px, py, size);
    const ground = rect.y + rect.size * GROUND_LINE;
    const shake = Math.sin(age * 0.041) * size * 0.02 * (1 - sink);
    ctx.drawImage(oldSprite, rect.x + shake, ground - (ground - rect.y) * sink, rect.size, rect.size * sink);
  }

  const sprite = spriteFor(tier);
  if (!sprite) return true;
  const rect = townSpriteRect(tier, px, py, size);
  const ground = rect.y + rect.size * GROUND_LINE;
  const sourceWidth = imageWidth(sprite);
  const sourceHeight = imageHeight(sprite);
  const sourceGround = sourceHeight * GROUND_LINE;
  for (let i = 0; i < TOWN_GROWTH_STRIPS_2D; i += 1) {
    const centre = (i + 0.5) / TOWN_GROWTH_STRIPS_2D;
    const rise = townGrowthRise(age, Math.abs(centre - 0.5) * 2);
    if (rise <= 0) continue;
    const sx = (i / TOWN_GROWTH_STRIPS_2D) * sourceWidth;
    const dx = rect.x + (i / TOWN_GROWTH_STRIPS_2D) * rect.size;
    // Overlap strips by a pixel so no seams show between them, widening the
    // source slice to match so the strip is not stretched.
    const dw = rect.size / TOWN_GROWTH_STRIPS_2D + 1;
    const sw = Math.min(sourceWidth - sx, dw * (sourceWidth / rect.size));
    const standing = (ground - rect.y) * rise;
    // The part above the ground line rises; the margin below it stays put.
    ctx.drawImage(sprite, sx, 0, sw, sourceGround, dx, ground - standing, dw, standing);
    ctx.drawImage(sprite, sx, sourceGround, sw, sourceHeight - sourceGround, dx, ground, dw, rect.size * (1 - GROUND_LINE));
  }
  return true;
};

const imageWidth = (image: CanvasImageSource): number =>
  "naturalWidth" in image && image.naturalWidth ? image.naturalWidth : Number((image as { width?: number }).width ?? 1);
const imageHeight = (image: CanvasImageSource): number =>
  "naturalHeight" in image && image.naturalHeight ? image.naturalHeight : Number((image as { height?: number }).height ?? 1);
