// 2D canvas counterpart of the Holo-Locked Stack (holo-crate-model-3d.ts):
// three armoured crates on a hexagonal anti-grav pad under a hovering
// glowing orb, drawn in a light oblique projection in a 100x100 box per
// tile. With an opening pose (holo-crate-open-fx.ts) the orb flares and bursts, the
// front-left crate's door drops like a ramp, a reward core rises and the site
// teleports out.
import type { WaystationOpenPose } from "./holo-crate-open-fx.js";

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
const OX = 0.55, OY = -0.45;
const C = { front: "#3a424d", frontLow: "#272d35", top: "#59636f", side: "#21262d", panel: "#47505c", band: "#181c21", brass: "#c79a52", brassDark: "#7f6232", ink: "#07090b", led: "#ffb347" };
const cyan = (a: number): string => `rgba(90,224,240,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

const poly = (ctx: Ctx, pts: readonly Pt[], fill: string | CanvasGradient): void => {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
};

/** One armoured crate: shaded faces, a rim highlight, belt with light strip, brass corner guards and a status light. */
const crate = (ctx: Ctx, x: number, y: number, w: number, h: number, d: number, light: number, front = true): void => {
  const ox = d * OX, oy = d * OY;
  poly(ctx, [[x + w, y], [x + w + ox, y + oy], [x + w + ox, y + h + oy], [x + w, y + h]], C.side);
  const top = ctx.createLinearGradient(x, y + oy, x, y);
  top.addColorStop(0, C.top); top.addColorStop(1, "#4b545f");
  poly(ctx, [[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]], top);
  if (front) {
    const face = ctx.createLinearGradient(0, y, 0, y + h);
    face.addColorStop(0, C.front); face.addColorStop(1, C.frontLow);
    ctx.fillStyle = face;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.panel;
    ctx.fillRect(x + w * 0.12, y + h * 0.18, w * 0.76, h * 0.22);
  }
  // Rim light along the top front edge.
  ctx.fillStyle = "rgba(220,235,245,.28)";
  ctx.fillRect(x, y, w, 0.8);
  // Belt and the right-side light strip.
  ctx.fillStyle = C.band;
  poly(ctx, [[x + w, y + h * 0.5 - 1.6], [x + w + ox, y + h * 0.5 - 1.6 + oy], [x + w + ox, y + h * 0.5 + 1.6 + oy], [x + w, y + h * 0.5 + 1.6]], C.band);
  ctx.fillStyle = cyan(0.55 + 0.4 * light);
  poly(ctx, [[x + w + ox * 0.25, y + h * 0.5 + oy * 0.25 - 0.4], [x + w + ox * 0.75, y + h * 0.5 + oy * 0.75 - 0.4], [x + w + ox * 0.75, y + h * 0.5 + oy * 0.75 + 0.6], [x + w + ox * 0.25, y + h * 0.5 + oy * 0.25 + 0.6]], cyan(0.55 + 0.4 * light));
  if (front) {
    ctx.fillStyle = C.band;
    ctx.fillRect(x - 0.6, y + h * 0.5 - 1.8, w + 1.2, 3.6);
    ctx.fillStyle = cyan(0.18 * light);
    ctx.fillRect(x + w * 0.18, y + h * 0.5 - 1.6, w * 0.64, 3.2);
    ctx.fillStyle = cyan(0.65 + 0.35 * light);
    ctx.fillRect(x + w * 0.2, y + h * 0.5 - 0.5, w * 0.6, 1);
    ctx.fillStyle = C.led;
    ctx.fillRect(x + w - 6, y + 3, 2.4, 1.6);
  }
  // Brass corner guards, front corners plus the far top corner.
  ctx.fillStyle = C.brass;
  const k = 2.8;
  for (const [bx, by] of [[x - 0.6, y - 0.6], [x + w - k + 0.6, y - 0.6], [x - 0.6, y + h - k + 0.6], [x + w - k + 0.6, y + h - k + 0.6]] as const) ctx.fillRect(bx, by, k, k);
  ctx.fillStyle = C.brassDark;
  ctx.fillRect(x + w + ox - k * 0.6, y + oy - 0.4, k * 0.8, k * 0.8);
};

const pad = (ctx: Ctx, nowMs: number, boost: number): void => {
  const hex = (rx: number, ry: number, cy: number): Pt[] => Array.from({ length: 6 }, (_, i) => [50 + Math.cos((i * Math.PI) / 3) * rx, cy + Math.sin((i * Math.PI) / 3) * ry] as Pt);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(51, 84, 42, 11, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, hex(43, 12, 82), "#15191d");
  poly(ctx, hex(41, 11, 80), "#2a3037");
  poly(ctx, hex(36, 9.4, 80), "#20252b");
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0024);
  ctx.lineWidth = 3;
  ctx.strokeStyle = cyan(0.12 + 0.12 * pulse + 0.3 * boost);
  ctx.beginPath(); ctx.ellipse(50, 80, 37, 9.8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = cyan(0.6 + 0.3 * pulse + 0.3 * boost);
  ctx.stroke();
  for (const angle of [Math.PI / 6, (Math.PI * 5) / 6, (Math.PI * 3) / 2]) {
    const ex = 50 + Math.cos(angle) * 39, ey = 80 + Math.sin(angle) * 10.4;
    ctx.fillStyle = C.brass; ctx.fillRect(ex - 2, ey - 3, 4, 3.4);
    ctx.fillStyle = cyan(0.8); ctx.fillRect(ex - 1.2, ey - 4, 2.4, 1);
  }
};

/** Glowing seal orb in its projection beam, with a tilted orbit ring; `lock` 0 intact .. 1 burst. */
const sealOrb = (ctx: Ctx, nowMs: number, lock: number, still: boolean): void => {
  if (lock >= 1) return;
  const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(nowMs * 0.0024);
  const flare = Math.sin(Math.PI * Math.min(1, lock * 1.6));
  const a = 1 - lock;
  const bob = still ? 0 : Math.sin(nowMs * 0.0021) * 1.4;
  const cx = 50, cy = 15 + bob - lock * 4, s = 1 + lock * 1.4;
  // Projection beam from the emitter on the top crate.
  const cone = ctx.createLinearGradient(0, 36, 0, cy + 5);
  cone.addColorStop(0, cyan(0.3 * a)); cone.addColorStop(1, cyan(0.04 * a));
  poly(ctx, [[cx - 2, 36], [cx + 2, 36], [cx + 7, cy + 5], [cx - 7, cy + 5]], cone);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
  halo.addColorStop(0, cyan((0.55 + 0.2 * breath + 0.4 * flare) * a));
  halo.addColorStop(0.45, cyan((0.22 + 0.1 * breath + 0.3 * flare) * a));
  halo.addColorStop(1, cyan(0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(232,252,255,${(0.95 * a).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
  const spin = still ? 0.6 : nowMs * 0.0011;
  ctx.strokeStyle = cyan((0.55 + 0.25 * breath) * a); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 2.6, -0.35 + Math.sin(spin) * 0.08, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = cyan(0.95 * a);
  ctx.fillRect(Math.cos(spin) * 8.5 - 0.8, Math.sin(spin) * 2.6 - 0.8 - Math.cos(spin) * 2.9, 1.6, 1.6);
  ctx.restore();
  if (lock > 0) {
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + 0.3, r = 4 + lock * 22;
      ctx.fillStyle = cyan((1 - lock) * 0.9);
      ctx.fillRect(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * 0.7, 1.6, 1.6);
    }
  }
};

/** Draws the site at the origin of a 100x100 box. */
const drawStack = (ctx: Ctx, nowMs: number, pose: WaystationOpenPose | undefined, still: boolean): void => {
  const glow = pose?.glow ?? 0;
  const idle = still ? 0.5 : 0.5 + 0.5 * Math.sin(nowMs * 0.0024);
  pad(ctx, nowMs, Math.min(1, glow));
  const hover = still ? 0 : Math.sin(nowMs / 900) * 0.6;
  ctx.save();
  ctx.translate(0, hover);
  crate(ctx, 50, 54, 31, 23, 16, idle);
  crate(ctx, 33, 32, 28, 21, 14, idle);
  // Emitter and handles on the top crate.
  ctx.fillStyle = C.brass; ctx.fillRect(43, 29, 2, 2); ctx.fillRect(55, 27, 2, 2);
  ctx.fillStyle = cyan(0.9); ctx.fillRect(48.6, 27.4, 2.8, 1.2);
  const x = 15, y = 57, w = 33, h = 23;
  const door = pose?.door ?? 0;
  crate(ctx, x, y, w, h, 16, idle, door <= 0);
  if (door > 0) {
    // Lit cavity, reward core and the door folded down toward the viewer.
    ctx.fillStyle = C.ink; ctx.fillRect(x + 3, y + 3, w - 6, h - 3);
    const g = ctx.createRadialGradient(x + w / 2, y + h * 0.6, 0, x + w / 2, y + h * 0.6, w * 0.75);
    g.addColorStop(0, cyan(0.7 * Math.min(1, glow))); g.addColorStop(1, cyan(0));
    ctx.fillStyle = g; ctx.fillRect(x - 12, y - 14, w + 24, h + 30);
    const angle = Math.min(1.08, door) * (Math.PI / 2);
    const bl: Pt = [x + 2, y + h], br: Pt = [x + w - 2, y + h], len = h * 0.9;
    const ex = -len * OX * Math.sin(angle) * 0.75, ey = -len * Math.cos(angle) - len * OY * Math.sin(angle) * 0.75;
    poly(ctx, [bl, br, [br[0] + ex, br[1] + ey], [bl[0] + ex, bl[1] + ey]], angle > 1.1 ? C.top : C.front);
    ctx.fillStyle = cyan(0.7);
    ctx.fillRect(Math.min(bl[0], bl[0] + ex) + 6, (bl[1] + bl[1] + ey) / 2, w - 16, 0.9);
    ctx.strokeStyle = C.brass; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(bl[0] + ex, bl[1] + ey); ctx.lineTo(br[0] + ex, br[1] + ey); ctx.stroke();
  }
  ctx.restore();
  if (pose && pose.core > 0) {
    const cx = x + w / 2 - 2, cy = y + h * 0.55 - pose.core * 22 + Math.sin(nowMs / 420) * 1.2;
    const shaft = ctx.createLinearGradient(0, cy, 0, cy - 55);
    shaft.addColorStop(0, cyan(0.45 * Math.min(1, glow))); shaft.addColorStop(1, cyan(0));
    poly(ctx, [[cx - 6, cy + 4], [cx + 6, cy + 4], [cx + 14, cy - 55], [cx - 14, cy - 55]], shaft);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 9);
    halo.addColorStop(0, "rgba(234,252,255,.95)"); halo.addColorStop(0.4, cyan(0.6 * pose.core)); halo.addColorStop(1, cyan(0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 14; i += 1) {
      const life = (nowMs / 1000 * 0.6 + i / 14) % 1;
      const sx = cx + Math.sin(i * 2.4 + nowMs / 500) * (3 + life * 9);
      ctx.fillStyle = cyan((1 - life) * Math.min(1, glow));
      ctx.fillRect(sx, cy - life * 48, 1.3, 1.3);
    }
  }
  sealOrb(ctx, nowMs, pose?.lock ?? 0, still);
};

export const drawHoloCrates2D = (
  ctx: Ctx, px: number, py: number, size: number, nowMs: number,
  options: { pose?: WaystationOpenPose; still?: boolean } = {}
): void => {
  const { pose, still = false } = options;
  if (pose?.done) return;
  // A remembered (fogged) site is drawn as last seen: one fixed moment, no pulse or flicker.
  if (still) nowMs = 0;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(size / 100, size / 100);
  const out = pose?.out ?? 0;
  if (out > 0) {
    // Teleport-out: the stack squeezes into a beam and fades under scanlines.
    ctx.save();
    ctx.globalAlpha *= 1 - out;
    ctx.translate(50, 80);
    ctx.scale(1 - out * out * 0.9, 1 + out * 0.3);
    ctx.translate(-50, -80);
    drawStack(ctx, nowMs, pose, still);
    ctx.restore();
    const beam = ctx.createLinearGradient(0, 0, 0, 92);
    beam.addColorStop(0, cyan(0)); beam.addColorStop(0.65, cyan(0.75 * Math.sin(Math.PI * out))); beam.addColorStop(1, cyan(0));
    ctx.fillStyle = beam;
    const half = 30 * (1 - out * 0.6);
    ctx.fillRect(50 - half, 0, half * 2, 92);
    ctx.fillStyle = cyan(0.9 * (1 - out));
    ctx.fillRect(50 - half, 84 - out * 80, half * 2, 1.2);
  } else {
    drawStack(ctx, nowMs, pose, still);
  }
  ctx.restore();
};
