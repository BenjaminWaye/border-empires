import {
  gear, lampPost, octagonPlate, spinning, steamVent, tree,
  type TownBuilders
} from "@client/client-map-3d-town-overlay/town-parts.js";

export type SupportStudyKind = "MANUFACTORY" | "ANCILLARY_DEPOT" | "AETHER_CONDENSER";
export const SUPPORT_PLATE_RADIUS = 0.38;
export const SUPPORT_SOCKET_Y = 0.075;
export const CLUSTER_BASE_Y = 0.1;

const windowStrip = (t: TownBuilders, x: number, y: number, z: number, count: number): void => {
  for (let i = 0; i < count; i += 1) {
    const wx = x + (i - (count - 1) / 2) * 0.046;
    t.body.box(wx, y - 0.006, z, 0.028, 0.054, 0.009, "brassDark");
    t.glow.box(wx, y, z + 0.005, 0.018, 0.038, 0.004, "lampWarm");
    t.body.box(wx, y + 0.016, z + 0.008, 0.022, 0.004, 0.004, "iron");
  }
};

const crate = (t: TownBuilders, x: number, z: number): void => {
  t.body.box(x, 0.008, z, 0.055, 0.047, 0.052, "trunk");
  for (const dx of [-0.018, 0.018]) t.body.box(x + dx, 0.008, z, 0.004, 0.05, 0.055, "brassDark");
};

const hall = (t: TownBuilders, x: number, z: number, w: number, h: number, d: number): void => {
  t.body.box(x, 0.005, z, w + 0.022, 0.022, d + 0.02, "stoneLight");
  t.body.box(x, 0.027, z, w, h, d, "stoneDark");
  for (const side of [-1, 1]) {
    t.body.box(x + side * (w / 2 - 0.008), 0.026, z, 0.014, h, d + 0.012, "brassDark");
  }
  t.body.box(x, h + 0.025, z, w + 0.025, 0.012, d + 0.025, "brass");
  t.body.gable(x, h + 0.037, z, w + 0.035, 0.07, d + 0.035, "graphite");
  t.body.box(x, h + 0.105, z, w + 0.035, 0.006, 0.012, "brass");
  windowStrip(t, x, h * 0.48, z + d / 2 + 0.004, Math.max(2, Math.floor(w / 0.055)));
  // Stone buttresses and window mullions echo the smaller town towers.
  const bays = Math.max(2, Math.floor(w / 0.08));
  for (let i = 0; i <= bays; i += 1) {
    const bx = x - w / 2 + w * i / bays;
    t.body.box(bx, 0.027, z + d / 2 + 0.006, 0.01, h, 0.017, "stoneLight");
    t.body.box(bx, h + 0.039, z + d / 2 + 0.008, 0.017, 0.018, 0.023, "brass");
  }
  for (const side of [-1, 1]) {
    const sx = x + side * (w / 2 + 0.006);
    t.body.box(sx, 0.063, z, 0.009, Math.max(0.025, h * 0.42), d * 0.62, "brassDark");
    t.glow.box(sx, 0.068, z, 0.011, Math.max(0.015, h * 0.33), d * 0.55, "lampWarm");
    for (const dz of [-0.23, 0, 0.23]) {
      t.body.box(sx, 0.063, z + dz * d, 0.014, Math.max(0.025, h * 0.42), 0.006, "iron");
    }
  }
};

const manufactory = (t: TownBuilders): void => {
  hall(t, -0.035, -0.065, 0.36, 0.17, 0.23);
  // A loading door, steps, pallets and an exposed flywheel preserve the
  // civilian workshop silhouette instead of turning it into another tower.
  t.body.box(-0.035, 0.028, 0.057, 0.08, 0.12, 0.014, "ironDark");
  for (let i = 0; i < 3; i += 1) {
    t.body.box(-0.035, 0.002, 0.1 + i * 0.025, 0.1, 0.027 - i * 0.008, 0.027, "stoneLight");
  }
  for (const x of [-0.15, 0.09]) steamVent(t, x, 0.28, -0.12, 0.12);
  // Roof lanterns and paired vents give the roof its own readable rhythm.
  for (const x of [-0.15, -0.04, 0.07]) {
    t.body.box(x, 0.244, -0.03, 0.057, 0.03, 0.075, "brassDark");
    t.body.gable(x, 0.274, -0.03, 0.067, 0.02, 0.08, "iron");
    t.glow.box(x, 0.25, 0.01, 0.045, 0.014, 0.004, "lamp");
  }
  t.body.cylinder(0.19, 0.01, -0.035, 0.052, 0.06, 0.11, "iron", 10);
  for (const y of [0.025, 0.105]) t.body.ring(0.19, y, -0.035, 0.057, "brass", 0.07);
  gear(t, 0.19, 0.09, 0.075, 0.059, Math.PI / 2, 0.55);
  t.body.pipe(0.19, 0.11, -0.035, 0.12, 0.11, -0.035, 0.01, "brass");
  for (const x of [-0.19, 0.16, 0.22]) crate(t, x, 0.18);
  t.body.box(-0.13, 0.025, 0.18, 0.025, 0.018, 0.055, "iron");
};

const depot = (t: TownBuilders): void => {
  // Keep the depot's sealed drum and radial reserve pods, rebuilt with the
  // same stone footing, brass courses and roof treatment as the town.
  t.body.cylinder(0, 0.012, -0.025, 0.15, 0.17, 0.035, "stoneLight", 12);
  t.body.cylinder(0, 0.047, -0.025, 0.13, 0.13, 0.18, "iron", 12);
  t.body.cylinder(0, 0.22, -0.025, 0.143, 0.143, 0.013, "brass", 12);
  t.body.dome(0, 0.233, -0.025, 0.133, "graphite", 12, 0.5);
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * Math.PI * 2;
    const x = Math.sin(angle) * 0.163;
    const z = -0.025 + Math.cos(angle) * 0.163;
    t.body.box(x, 0.025, z, 0.054, 0.19, 0.065, "ironDark", angle);
    t.body.box(x, 0.025, z, 0.06, 0.015, 0.073, "brass", angle);
    t.body.box(x, 0.2, z, 0.06, 0.016, 0.073, "brass", angle);
    t.glow.box(x, 0.07, z, 0.057, 0.005, 0.069, "aether", angle);
    t.body.box(x, 0.11, z, 0.057, 0.005, 0.069, "brassDark", angle);
    t.body.box(x, 0.16, z, 0.057, 0.005, 0.069, "brassDark", angle);
  }
  hall(t, 0, 0.17, 0.15, 0.09, 0.1);
  t.body.box(0, 0.029, 0.226, 0.055, 0.07, 0.012, "ironDark");
  t.body.box(0, 0.005, 0.259, 0.09, 0.025, 0.035, "stoneLight");
  t.body.cylinder(0, 0.29, -0.025, 0.022, 0.032, 0.025, "brass", 8);
  t.glow.gem(0, 0.328, -0.025, 0.014, 0.023, "aether");
  crate(t, -0.19, 0.17);
  crate(t, 0.2, 0.16);
};

const condenser = (t: TownBuilders): void => {
  // Three differently sized vessels make the aether plant distinct from
  // the depot. Cyan is concentrated in the process machinery.
  const vessels = [[-0.11, 0, 0.085, 0.28], [0.11, 0.06, 0.065, 0.21], [0.08, -0.15, 0.055, 0.32]] as const;
  for (const [x, z, r, h] of vessels) {
    t.body.cylinder(x, 0.008, z, r + 0.015, r + 0.025, 0.025, "stoneLight", 10);
    t.body.cylinder(x, 0.033, z, r, r, h, "iron", 10);
    for (const y of [0.05, h * 0.55, h + 0.015]) t.body.ring(x, y, z, r + 0.003, "brass", 0.06);
    t.body.dome(x, h + 0.033, z, r, "graphite", 10, 0.5);
    t.body.cylinder(x, h + 0.033 + r * 0.45, z, r * 0.25, r * 0.36, 0.025, "brass", 8);
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      t.body.box(x + Math.sin(angle) * r, 0.05, z + Math.cos(angle) * r, 0.008, h * 0.88, 0.012, "brassDark", angle);
    }
    for (const side of [-1, 1]) {
      t.glow.box(x + side * r * 0.43, 0.09, z + r * 0.91, 0.009, h * 0.46, 0.006, "aether");
      t.body.box(x + side * r * 0.67, 0.072, z + r * 0.82, 0.008, h * 0.65, 0.014, "brassDark");
    }
  }
  t.body.pipe(-0.11, 0.15, 0, 0.11, 0.15, 0.06, 0.012, "brass");
  t.body.pipe(0.11, 0.18, 0.06, 0.08, 0.18, -0.15, 0.01, "brass");
  hall(t, -0.04, 0.18, 0.19, 0.09, 0.09);
  steamVent(t, -0.23, 0.03, -0.15, 0.16);
  spinning(t, -0.11, 0.38, 0, [0, 1, 0], 0.45, () => {
    t.body.ring(-0.11, 0.38, 0, 0.06, "brass", 0.055);
    for (const side of [-1, 1]) t.glow.gem(-0.11 + side * 0.06, 0.38, 0, 0.008, 0.013, "aether");
  });
};

const BUILDERS: Readonly<Record<SupportStudyKind, (t: TownBuilders) => void>> = {
  MANUFACTORY: manufactory, ANCILLARY_DEPOT: depot, AETHER_CONDENSER: condenser
};

export const buildSupportStudy = (t: TownBuilders, kind: SupportStudyKind): void => {
  octagonPlate(t, SUPPORT_PLATE_RADIUS, false);
  // Identical trim, service sockets, paving and small landscaping give the
  // family a common scale without making every building the same shape.
  for (const side of [-1, 1]) {
    lampPost(t, side * 0.235, 0.23, 0.085);
    tree(t, side * 0.26, -0.18, 0.075);
    t.body.box(side * 0.26, 0.001, -0.18, 0.047, 0.012, 0.048, "stoneLight");
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    const x = Math.sin(angle) * 0.341;
    const z = Math.cos(angle) * 0.341;
    t.body.cylinder(x, 0, z, 0.022, 0.027, SUPPORT_SOCKET_Y, "iron", 8);
    t.body.cylinder(x, SUPPORT_SOCKET_Y - 0.008, z, 0.028, 0.028, 0.009, "brass", 8);
    t.glow.gem(x, SUPPORT_SOCKET_Y + 0.008, z, 0.008, 0.013, "lamp");
  }
  BUILDERS[kind](t);
};
