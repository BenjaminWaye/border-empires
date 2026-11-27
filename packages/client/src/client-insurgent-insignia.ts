// The Insurgent mark (docs/lore/galactic-lore.md §4, "Insurgents"): a raised
// fist, the sign of defense forces that survived the Court's purge and still
// hold the ground. Stamped faintly, in one flat colour, on every Insurgent
// FRONTIER tile so their land reads as held instead of as empty terrain;
// camps show their patrolling soldiers instead. Not a status badge: no
// background, no rim, just the mark on the ground.
//
// One sprite for both renderers: painted once at SPRITE_PX and reused, so
// there is no per-size cache to grow. The 2D map draws it scaled per tile
// (client-map-render-planetary-defense-overlay.ts) and the 3D map uses it as
// its ground decal's texture (client-map-3d-insurgent-insignia-overlay.ts).

/** Flat ink of the mark, faint by design: dark slate at low alpha over any terrain. */
export const INSURGENT_MARK_COLOR = "rgba(40, 44, 50, 0.42)";
const SPRITE_PX = 128;
// The fist spans this fraction of the sprite, leaving room for the cut lines' caps.
const MARK_FRACTION = 0.9;
// Cut lines stay at least this many sprite pixels wide so they survive downscaling.
const MIN_CUT_PX = 3;

/** The fist's outline in a 100-unit box centred on the origin: knuckles, little-finger side, forearm, thumb bulge. */
export const traceFistSilhouette = (ctx: CanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(-28, -20);
  ctx.quadraticCurveTo(-29, -40, -19, -40);
  ctx.quadraticCurveTo(-13, -41, -11, -36);
  ctx.quadraticCurveTo(-9, -44, 1, -43);
  ctx.quadraticCurveTo(8, -42, 9, -36);
  ctx.quadraticCurveTo(12, -42, 19, -40);
  ctx.quadraticCurveTo(25, -38, 25, -31);
  ctx.quadraticCurveTo(31, -33, 32, -25);
  ctx.quadraticCurveTo(33, -6, 25, 8);
  ctx.lineTo(18, 16);
  ctx.lineTo(21, 50);
  ctx.lineTo(-19, 50);
  ctx.lineTo(-16, 16);
  ctx.quadraticCurveTo(-31, 8, -32, -6);
  ctx.quadraticCurveTo(-33, -16, -28, -20);
  ctx.closePath();
};

/** Lines cut out of the silhouette: finger gaps, the thumb folded across, the wrist crease. */
export const traceFistCuts = (ctx: CanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(-11, -35);
  ctx.lineTo(-10, -20);
  ctx.moveTo(9, -35);
  ctx.lineTo(8, -20);
  ctx.moveTo(25, -30);
  ctx.lineTo(24, -18);
  ctx.moveTo(-29, -14);
  ctx.quadraticCurveTo(-12, -22, 6, -16);
  ctx.quadraticCurveTo(11, -14, 9, -9);
  ctx.moveTo(-27, -2);
  ctx.quadraticCurveTo(-10, -4, 9, -9);
  ctx.moveTo(-14, 17);
  ctx.quadraticCurveTo(2, 20, 17, 17);
};

/** Paints the mark, centred, into a square context `px` wide: fill, cut the lines out, then tint to the single colour. */
export const paintInsurgentMark = (ctx: CanvasRenderingContext2D, px: number): void => {
  const unit = (px * MARK_FRACTION) / 100;
  ctx.save();
  ctx.translate(px / 2, px / 2);
  ctx.scale(unit, unit);
  traceFistSilhouette(ctx);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3.2, MIN_CUT_PX / unit);
  traceFistCuts(ctx);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = INSURGENT_MARK_COLOR;
  ctx.fillRect(0, 0, px, px);
  ctx.restore();
};

let sprite: HTMLCanvasElement | null | undefined;

/** The shared mark sprite, painted on first use; null where there is no DOM canvas (Node tests). */
export const insurgentMarkSprite = (): HTMLCanvasElement | null => {
  if (sprite !== undefined) return sprite;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_PX;
  canvas.height = SPRITE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    sprite = null;
    return sprite;
  }
  paintInsurgentMark(ctx, SPRITE_PX);
  sprite = canvas;
  return sprite;
};

/** Draws the mark centred on (cx, cy), `size` pixels across. No-op without a DOM canvas. */
export const drawInsurgentInsignia = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void => {
  const image = insurgentMarkSprite();
  if (!image) return;
  ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
};
