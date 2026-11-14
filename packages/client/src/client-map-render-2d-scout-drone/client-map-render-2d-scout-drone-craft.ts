// The top-down scout drone glyph for the 2D canvas (client-map-render-2d-scout-drone.ts), nose
// along +X, drawn in the same hard-surface language as the 3D craft
// (client-map-3d-scout-drone/client-map-3d-scout-drone-geometry.ts): an angular arrowhead hull
// split into lit and shaded facets along its ridge, a panel seam across the plates, bronze chine
// edges with cyan seams just inside them, a faceted canopy, a bronze chevron House marking aft,
// four octagonal ducts with motion-blurred rotors on diamond struts, red/green nav lights and a
// cyan heading wedge. `lights` is the running-lights level (1 at home, 0 running dark); the nav lights
// and heading wedge follow it, the sensor glow only dims. No allocation.

const CYAN = "#4fd8ff";
const STEEL_LIT = "#3a434e";
const STEEL_SHADE = "#1c2128";
const BRONZE = "#b48a4c";
const ROTORS: ReadonlyArray<readonly [number, number]> = [[0.33, 0.33], [0.33, -0.33], [-0.33, 0.33], [-0.33, -0.33]];
// Unit octagon, flat sides facing the axes.
const OCTAGON: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 8 + (i * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)] as const;
});
// The hull outline, nose to tail, upper (negative y) half; the lower half mirrors it.
const HULL: ReadonlyArray<readonly [number, number]> = [[0.5, 0], [0.24, -0.1], [-0.02, -0.17], [-0.3, -0.12], [-0.46, -0.07], [-0.46, 0]];

const octagonPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void => {
  ctx.beginPath();
  for (let i = 0; i < OCTAGON.length; i += 1) {
    const [ox, oy] = OCTAGON[i]!;
    if (i === 0) ctx.moveTo(cx + ox * r, cy + oy * r);
    else ctx.lineTo(cx + ox * r, cy + oy * r);
  }
  ctx.closePath();
};

// One side of the hull as a closed facet from the ridge (y = 0) out to the chine.
const hullHalf = (ctx: CanvasRenderingContext2D, s: number, side: 1 | -1): void => {
  ctx.beginPath();
  for (let i = 0; i < HULL.length; i += 1) {
    const [hx, hy] = HULL[i]!;
    if (i === 0) ctx.moveTo(hx * s, hy * s * side);
    else ctx.lineTo(hx * s, hy * s * side);
  }
  ctx.closePath();
};

export const drawScoutCraft2D = (ctx: CanvasRenderingContext2D, s: number, rotorPhase: number, pulse: number, lights: number, sensor: number): void => {
  const fine = Math.max(0.8, s * 0.012);
  // Heading wedge ahead of the nose: full at home, a faint hint when running dark.
  ctx.globalAlpha = 0.28 * sensor;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(s * 0.6, 0);
  ctx.lineTo(s * 0.98, -s * 0.15);
  ctx.lineTo(s * 0.98, s * 0.15);
  ctx.closePath();
  ctx.fill();
  // Diamond-section struts.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  for (const [ax, ay] of ROTORS) {
    ctx.moveTo(ax * s * 0.25, ay * s * 0.3);
    ctx.lineTo(ax * s * 0.78, ay * s * 0.78);
  }
  ctx.stroke();
  // Octagonal ducts: a blurred rotor inside, a blade streak, a bronze rim.
  for (let k = 0; k < ROTORS.length; k += 1) {
    const [ax, ay] = ROTORS[k]!;
    const rx = ax * s;
    const ry = ay * s;
    const r = s * 0.17;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = STEEL_SHADE;
    octagonPath(ctx, rx, ry, r * 1.12);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#c8dbe6";
    octagonPath(ctx, rx, ry, r * 0.9);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#eef7ff";
    ctx.lineWidth = Math.max(1, s * 0.022);
    const a = (k % 2 === 0 ? 1 : -1) * rotorPhase + k;
    ctx.beginPath();
    ctx.moveTo(rx + Math.cos(a) * r * 0.2, ry + Math.sin(a) * r * 0.2);
    ctx.lineTo(rx + Math.cos(a) * r * 0.85, ry + Math.sin(a) * r * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BRONZE;
    ctx.lineWidth = Math.max(1.2, s * 0.04);
    octagonPath(ctx, rx, ry, r * 1.12);
    ctx.stroke();
  }
  // The hull: a lit facet and a shaded facet split along the ridge, crisp dark outline.
  ctx.fillStyle = STEEL_LIT;
  hullHalf(ctx, s, -1);
  ctx.fill();
  ctx.fillStyle = STEEL_SHADE;
  hullHalf(ctx, s, 1);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < HULL.length; i += 1) {
    const [hx, hy] = HULL[i]!;
    if (i === 0) ctx.moveTo(hx * s, hy * s);
    else ctx.lineTo(hx * s, hy * s);
  }
  for (let i = HULL.length - 1; i >= 0; i -= 1) ctx.lineTo(HULL[i]![0] * s, -HULL[i]![1] * s);
  ctx.closePath();
  ctx.stroke();
  // Bronze chine edges and the ridge line.
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = Math.max(1, s * 0.028);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(HULL[1]![0] * s, HULL[1]![1] * s * side);
    ctx.lineTo(HULL[2]![0] * s, HULL[2]![1] * s * side);
    ctx.lineTo(HULL[3]![0] * s, HULL[3]![1] * s * side);
  }
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(s * 0.42, 0);
  ctx.stroke();
  // Panel seams across the plates.
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = fine;
  ctx.beginPath();
  for (const px of [-0.28, -0.12, 0.1]) {
    ctx.moveTo(px * s, -s * 0.15);
    ctx.lineTo(px * s, s * 0.15);
  }
  ctx.stroke();
  // Cyan seams just inside the chines: dimmed, never off, when running dark.
  ctx.strokeStyle = CYAN;
  ctx.globalAlpha = 0.25 + 0.6 * sensor;
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(HULL[1]![0] * s * 0.95, HULL[1]![1] * s * side * 0.8);
    ctx.lineTo(HULL[2]![0] * s, HULL[2]![1] * s * side * 0.8);
    ctx.lineTo(HULL[3]![0] * s * 0.95, HULL[3]![1] * s * side * 0.8);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // The House marking: two bronze chevrons on the aft deck, pointing forward.
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.beginPath();
  for (const cx of [-0.36, -0.29]) {
    ctx.moveTo(cx * s, -s * 0.05);
    ctx.lineTo((cx + 0.04) * s, 0);
    ctx.lineTo(cx * s, s * 0.05);
  }
  ctx.stroke();
  // Faceted canopy: a glass diamond on the ridge.
  ctx.fillStyle = "#123744";
  ctx.beginPath();
  ctx.moveTo(s * 0.2, 0);
  ctx.lineTo(s * 0.04, -s * 0.06);
  ctx.lineTo(-s * 0.08, 0);
  ctx.lineTo(s * 0.04, s * 0.06);
  ctx.closePath();
  ctx.fill();
  // Sensor glow at the nose: never out, only dimmed past the border.
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = (5 + 4 * pulse) * sensor;
  ctx.globalAlpha = 0.35 + 0.65 * sensor;
  ctx.beginPath();
  ctx.moveTo(s * 0.44, 0);
  ctx.lineTo(s * 0.37, -s * 0.035);
  ctx.lineTo(s * 0.33, 0);
  ctx.lineTo(s * 0.37, s * 0.035);
  ctx.closePath();
  ctx.fill();
  // Red/green nav lights on the front ducts: running lights, off past the border.
  if (lights > 0.005) {
    ctx.globalAlpha = lights;
    ctx.fillStyle = "#ff3b26";
    ctx.shadowColor = "#ff3b26";
    ctx.shadowBlur = 6 * lights;
    ctx.beginPath();
    ctx.arc(s * 0.43, -s * 0.43, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3dff8a";
    ctx.shadowColor = "#3dff8a";
    ctx.beginPath();
    ctx.arc(s * 0.43, s * 0.43, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
};
