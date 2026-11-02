// 2D canvas capture aftermath, counterpart of the true-3D
// client-map-3d-capture-aftermath-fx.ts (see client-capture-aftermath.ts for
// the rules): rubble chunks for a razed Relay Beacon / Siege Battery or a
// wrecked captured fort, and dark smoke rising off a captured resource,
// until the capturing troops' hold ends.
import { captureAftermathForTile, type CaptureRubbleKind } from "./client-capture-aftermath/client-capture-aftermath.js";
import type { Tile } from "./client-types.js";

const RUBBLE_FILL: Record<CaptureRubbleKind, readonly string[]> = {
  FORT: ["#8d8a82", "#6f6c66", "#a39f95"],
  RELAY_BEACON: ["#4a5058", "#5f6670", "#4fd6e0"],
  SIEGE_BATTERY: ["#5a4330", "#3e2f22", "#55585c"]
};
const PIECES = 7;
const SMOKE_PUFFS = 4;
const SMOKE_CYCLE_MS = 3200;

const hash = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const drawRubble = (ctx: CanvasRenderingContext2D, kind: CaptureRubbleKind, seed: number, px: number, py: number, size: number): void => {
  const fills = RUBBLE_FILL[kind];
  // A razed structure leaves a pile in the middle; a wrecked fort sheds
  // chunks along the tile's lower edge, in front of its standing walls.
  const fort = kind === "FORT";
  for (let i = 0; i < PIECES; i += 1) {
    const cx = px + size * (fort ? 0.12 + hash(seed, i) * 0.76 : 0.3 + hash(seed, i) * 0.4);
    const cy = py + size * (fort ? 0.82 + hash(seed, i + 11) * 0.1 : 0.55 + hash(seed, i + 11) * 0.25);
    const w = size * (0.07 + hash(seed, i + 23) * 0.07);
    const h = w * (0.55 + hash(seed, i + 37) * 0.4);
    ctx.fillStyle = fills[i % fills.length]!;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy + h / 2);
    ctx.lineTo(cx - w * 0.3, cy - h / 2);
    ctx.lineTo(cx + w * 0.4, cy - h * 0.35);
    ctx.lineTo(cx + w / 2, cy + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
};

const drawSmoke = (ctx: CanvasRenderingContext2D, seed: number, px: number, py: number, size: number, nowEpochMs: number): void => {
  for (let i = 0; i < SMOKE_PUFFS; i += 1) {
    const t = ((nowEpochMs + (i / SMOKE_PUFFS) * SMOKE_CYCLE_MS + hash(seed, i) * 400) % SMOKE_CYCLE_MS) / SMOKE_CYCLE_MS;
    const cx = px + size * (0.5 + (hash(seed, i + 5) - 0.5) * 0.3 + Math.sin(t * Math.PI * 2 + i) * 0.05);
    const cy = py + size * (0.6 - t * 0.55);
    ctx.globalAlpha = 0.55 * (1 - t);
    ctx.fillStyle = "#3a3633";
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.07 + t * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawCaptureAftermath2D = (ctx: CanvasRenderingContext2D, tile: Tile, tileKey: string, px: number, py: number, size: number, nowEpochMs: number): void => {
  if (size < 8) return;
  const aftermath = captureAftermathForTile(tile, tileKey, nowEpochMs);
  if (!aftermath) return;
  const seed = tile.x * 17 + tile.y * 31;
  ctx.save();
  ctx.lineWidth = Math.max(0.5, size * 0.015);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  for (const kind of aftermath.rubble) drawRubble(ctx, kind, seed + kind.length, px, py, size);
  if (aftermath.smoke) drawSmoke(ctx, seed, px, py, size, nowEpochMs);
  ctx.restore();
};
