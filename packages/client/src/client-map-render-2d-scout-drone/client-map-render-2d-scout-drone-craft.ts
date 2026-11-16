// The top-down Survey Quad glyph for the 2D canvas (client-map-render-2d-scout-drone.ts), nose
// along +X, matching the 3D drone (client-map-3d-scout-drone/): a clean X of slim arms, four open
// props shown as faint translucent discs with a blade streak and a thin guard arc on the outer
// side, brass motor caps, a rounded graphite body with its GPS puck, a cyan
// camera dot at the nose, a cyan status dot, red/green nav lights on the front arms and a cyan
// heading wedge, plus the camera's REC blink while outbound. `lights` is the running-lights level
// (1 at home, 0 running dark): the nav lights, REC and heading wedge follow it; the camera and
// status dots only dim (`sensor`). No allocation.

const CYAN = "#4fd8ff";
const GRAPHITE = "#474d55";
const BELLY = "#1d2025";
const FRAME = "#15171b";
const BRASS = "#c49a58";
const ARM = 0.4; // motor distance from the centre along each diagonal, in glyph units
const PROP = 0.17;
const ROTORS: ReadonlyArray<readonly [number, number]> = [[ARM * Math.SQRT1_2, -ARM * Math.SQRT1_2], [ARM * Math.SQRT1_2, ARM * Math.SQRT1_2], [-ARM * Math.SQRT1_2, ARM * Math.SQRT1_2], [-ARM * Math.SQRT1_2, -ARM * Math.SQRT1_2]];

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

export const drawScoutCraft2D = (ctx: CanvasRenderingContext2D, s: number, rotorPhase: number, pulse: number, lights: number, sensor: number, rec: number): void => {
  // Heading wedge ahead of the nose: full at home, a faint hint when running dark.
  ctx.globalAlpha = 0.25 * sensor;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0);
  ctx.lineTo(s * 0.86, -s * 0.13);
  ctx.lineTo(s * 0.86, s * 0.13);
  ctx.closePath();
  ctx.fill();
  // Arms in an X.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = FRAME;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  for (const [ax, ay] of ROTORS) {
    ctx.moveTo(ax * 0.25 * s, ay * 0.25 * s);
    ctx.lineTo(ax * s, ay * s);
  }
  ctx.stroke();
  // Props: a faint disc, a blade streak, a guard arc on the outer side, a brass motor cap.
  for (let k = 0; k < ROTORS.length; k += 1) {
    const [ax, ay] = ROTORS[k]!;
    const rx = ax * s;
    const ry = ay * s;
    const r = PROP * s;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#c8d4dc";
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#e8f0f5";
    ctx.lineWidth = Math.max(1, s * 0.02);
    const a = (k % 2 === 0 ? 1 : -1) * rotorPhase + k;
    ctx.beginPath();
    ctx.moveTo(rx - Math.cos(a) * r * 0.9, ry - Math.sin(a) * r * 0.9);
    ctx.lineTo(rx + Math.cos(a) * r * 0.9, ry + Math.sin(a) * r * 0.9);
    ctx.stroke();
    const outward = Math.atan2(ay, ax);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.12, outward - 1.3, outward + 1.3);
    ctx.stroke();
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.arc(rx, ry, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  // The body, read as a raised dome from above: a soft drop shadow, the darker waist rim, the
  // graphite shell, then a highlight on its upper-left and a shade on its lower-right.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000000";
  roundedRect(ctx, -s * 0.21, -s * 0.11, s * 0.46, s * 0.28, s * 0.09);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = BELLY;
  roundedRect(ctx, -s * 0.23, -s * 0.14, s * 0.46, s * 0.28, s * 0.08);
  ctx.fill();
  ctx.fillStyle = GRAPHITE;
  roundedRect(ctx, -s * 0.2, -s * 0.115, s * 0.4, s * 0.23, s * 0.065);
  ctx.fill();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000000";
  roundedRect(ctx, -s * 0.12, -s * 0.02, s * 0.32, s * 0.135, s * 0.06);
  ctx.fill();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, -s * 0.17, -s * 0.095, s * 0.24, s * 0.09, s * 0.045);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = BELLY;
  ctx.beginPath();
  ctx.arc(-s * 0.08, 0, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  // Cyan camera dot at the nose and the status dot: never out, only dimmed past the border.
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = (4 + 4 * pulse) * sensor;
  ctx.globalAlpha = 0.35 + 0.65 * sensor;
  ctx.beginPath();
  ctx.arc(s * 0.22, 0, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  // A crisp bright core in the camera dot.
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e8fbff";
  ctx.beginPath();
  ctx.arc(s * 0.22, 0, s * 0.016, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(-s * 0.15, s * 0.07, s * 0.016, 0, Math.PI * 2);
  ctx.fill();
  // The REC light on the camera, blinking while outbound (`rec` already carries the blink and running lights).
  if (rec > 0.005) {
    ctx.globalAlpha = rec;
    ctx.fillStyle = "#ff2a1a";
    ctx.beginPath();
    ctx.arc(s * 0.18, -s * 0.035, s * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  // Red/green nav lights on the front arms: running lights, off past the border.
  if (lights > 0.005) {
    const [fx, fy] = ROTORS[0]!;
    ctx.globalAlpha = lights;
    ctx.shadowBlur = 6 * lights;
    ctx.fillStyle = "#ff3b26";
    ctx.shadowColor = "#ff3b26";
    ctx.beginPath();
    ctx.arc(fx * s * 1.08, fy * s * 1.08, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3dff8a";
    ctx.shadowColor = "#3dff8a";
    ctx.beginPath();
    ctx.arc(fx * s * 1.08, -fy * s * 1.08, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.lineCap = "butt";
};
