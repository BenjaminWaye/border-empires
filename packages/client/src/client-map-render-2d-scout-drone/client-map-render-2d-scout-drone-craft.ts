// The top-down Sentinel glyph for the 2D canvas (client-map-render-2d-scout-drone.ts), nose along
// +X, matching the 3D drone (client-map-3d-scout-drone/): large faint rotor discs with three blade
// streaks each, four short dark arms out to chunky oval pods, a dark grey sphere with darker seam
// lines and a soft highlight, and the big cyan eye at its front edge. The pod LEDs are the running
// lights: red on the front-left pod, green on the front-right, cyan on the rear pods. `lights` is
// the running-lights level (1 at home, 0 running dark): the pod LEDs, strobe and REC follow it;
// the eye and the heading wedge only dim (`sensor`). No allocation.

const CYAN = "#4fd8ff";
const STROBE_WHITE = "#ffffff";
const PAINT = "#4a4f55";
const SEAM = "#24282d";
const RED = "#ff3b26";
const GREEN = "#3dff8a";
const BODY = 0.2; // sphere radius, in glyph units
const REACH = 0.5; // body centre to pod centre
const ROTOR = 0.27;
const POD_COLOURS = [RED, GREEN, CYAN, CYAN] as const; // per POD_ANGLES entry
const POD_ANGLES = [-0.96, 0.96, -2.18, 2.18] as const; // front-left, front-right, rear-left, rear-right (from the nose, +y to the right)

export const drawScoutCraft2D = (ctx: CanvasRenderingContext2D, s: number, rotorPhase: number, pulse: number, lights: number, sensor: number, rec: number, strobe: boolean): void => {
  // Heading wedge ahead of the eye: full at home, a faint hint when running dark.
  ctx.globalAlpha = 0.25 * sensor;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(s * 0.34, 0);
  ctx.lineTo(s * 0.7, -s * 0.12);
  ctx.lineTo(s * 0.7, s * 0.12);
  ctx.closePath();
  ctx.fill();
  // Rotors: a large faint disc and three blade streaks each.
  for (let k = 0; k < POD_ANGLES.length; k += 1) {
    const a = POD_ANGLES[k]!;
    const px = Math.cos(a) * REACH * s;
    const py = Math.sin(a) * REACH * s;
    const r = ROTOR * s;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#c8d4dc";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#1c1f23";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    for (let b = 0; b < 3; b += 1) {
      const t = (k % 2 === 0 ? 1 : -1) * rotorPhase + k + (b * Math.PI * 2) / 3;
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(t) * r * 0.95, py + Math.sin(t) * r * 0.95);
    }
    ctx.stroke();
  }
  // Arms, then the pods: chunky ovals along each arm, dark underside rim showing.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  for (const a of POD_ANGLES) {
    ctx.moveTo(Math.cos(a) * BODY * 0.9 * s, Math.sin(a) * BODY * 0.9 * s);
    ctx.lineTo(Math.cos(a) * REACH * s, Math.sin(a) * REACH * s);
  }
  ctx.stroke();
  for (const a of POD_ANGLES) {
    const px = Math.cos(a) * REACH * s;
    const py = Math.sin(a) * REACH * s;
    ctx.fillStyle = SEAM;
    ctx.beginPath();
    ctx.ellipse(px, py, s * 0.14, s * 0.08, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAINT;
    ctx.beginPath();
    ctx.ellipse(px, py, s * 0.125, s * 0.066, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // The sphere: a soft drop shadow, the paint, darker seam lines and a highlight upper-left.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(-s * 0.02, s * 0.03, BODY * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAINT;
  ctx.beginPath();
  ctx.arc(0, 0, BODY * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.beginPath();
  ctx.arc(0, 0, BODY * s * 0.62, -1.1, 1.1); // the eye ring's back edge
  ctx.moveTo(-BODY * s, 0);
  ctx.lineTo(BODY * s * 0.62 * Math.cos(Math.PI), 0);
  ctx.moveTo(-BODY * s * 0.35, -BODY * s * 0.94);
  ctx.lineTo(-BODY * s * 0.35, BODY * s * 0.94);
  ctx.stroke();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-s * 0.05, -s * 0.06, BODY * s * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // The eye at the front edge: a dark bezel and the cyan pupil, never out, only dimmed past the border.
  ctx.globalAlpha = 1;
  ctx.fillStyle = SEAM;
  ctx.beginPath();
  ctx.arc(BODY * s * 0.78, 0, s * 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = (4 + 4 * pulse) * sensor;
  ctx.globalAlpha = 0.35 + 0.65 * sensor;
  ctx.beginPath();
  ctx.arc(BODY * s * 0.82, 0, s * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e8fbff";
  ctx.beginPath();
  ctx.arc(BODY * s * 0.82, 0, s * 0.017, 0, Math.PI * 2);
  ctx.fill();
  // The REC light beside the eye, blinking while outbound (`rec` already carries the blink and running lights).
  if (rec > 0.005) {
    ctx.globalAlpha = rec;
    ctx.fillStyle = "#ff2a1a";
    ctx.beginPath();
    ctx.arc(BODY * s * 0.55, -BODY * s * 0.55, s * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
  // The pod LEDs at the pods' outer tips: running lights, off past the border.
  if (lights > 0.005) {
    ctx.globalAlpha = lights;
    ctx.shadowBlur = 6 * lights;
    for (let k = 0; k < POD_ANGLES.length; k += 1) {
      const a = POD_ANGLES[k]!;
      // The rear-left pod's LED is the white strobe's double flash, as in 3D.
      const colour = k === 2 && strobe ? STROBE_WHITE : POD_COLOURS[k]!;
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (REACH + 0.13) * s, Math.sin(a) * (REACH + 0.13) * s, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.lineCap = "butt";
};
