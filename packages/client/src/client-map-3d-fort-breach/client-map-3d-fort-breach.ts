// Breached-fort layout for client-map-3d-fort-overlay.ts: a fort captured
// with its tile (shared capture-hold.ts) stands wrecked while the capturing
// troops hold it. The fort's own pieces are rearranged, in its own material:
// one wall is smashed through, leaving two broken stubs with jagged blocks on
// top and its stone spilled mostly inward where the attackers broke in, and
// the corner tower beside the gap is snapped to a stump with its top lying
// inside the walls. Pure layout (tile-local offsets), so it is testable
// without a renderer.

export type BreachDirection = "N" | "E" | "S" | "W";
const DIRECTIONS: readonly BreachDirection[] = ["N", "E", "S", "W"];

export type BreachDimensions = {
  readonly wallLength: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly wallOffset: number;
  readonly towerSide: number;
  readonly towerHeight: number;
  readonly towerOffset: number;
};

/** A box in tile-local space: centre, size, turn about y, then tilt about its own x. */
export type BreachBlock = { readonly x: number; readonly y: number; readonly z: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly yaw: number; readonly tilt: number };

export type FortBreachLayout = {
  /** The smashed wall, or undefined when every wall is an opening onto a neighbouring fort. */
  readonly direction: BreachDirection | undefined;
  /** Yaw turning local +x toward the breached wall, for ground details. */
  readonly facing: number;
  /** The two standing remnants of the smashed wall (wall geometry, scaled). */
  readonly stubs: readonly { readonly x: number; readonly z: number; readonly length: number; readonly heightFraction: number }[];
  /** Corner (0..3, as the overlay orders them) snapped to a stump. */
  readonly snappedCorner: number;
  readonly stumpFraction: number;
  /** The snapped tower's top, lying inside the walls (tower geometry). */
  readonly fallenTop: BreachBlock;
  /** Loose blocks of wall stone. */
  readonly blocks: readonly BreachBlock[];
};

const seeded = (seed: number): (() => number) => {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

/** Unit vectors for a wall: `along` runs its length, `out` points away from the fort. */
const wallAxes = (direction: BreachDirection): { ax: number; az: number; ox: number; oz: number } => {
  switch (direction) {
    case "N": return { ax: 1, az: 0, ox: 0, oz: -1 };
    case "S": return { ax: -1, az: 0, ox: 0, oz: 1 };
    case "E": return { ax: 0, az: 1, ox: 1, oz: 0 };
    case "W": return { ax: 0, az: -1, ox: -1, oz: 0 };
  }
};

// The overlay's corner order: (-,-), (+,-), (-,+), (+,+).
const cornerIndex = (x: number, z: number): number => (x < 0 ? 0 : 1) + (z < 0 ? 0 : 2);

export const fortBreachLayout = (dims: BreachDimensions, seed: number, openSides: ReadonlySet<BreachDirection>): FortBreachLayout => {
  const random = seeded(seed * 9301 + 49297);
  const start = Math.abs(Math.floor(seed)) % 4;
  const direction = [0, 1, 2, 3].map((i) => DIRECTIONS[(start + i) % 4]!).find((d) => !openSides.has(d));
  const axes = wallAxes(direction ?? DIRECTIONS[start]!);
  const facing = Math.atan2(-axes.oz, axes.ox);
  const half = dims.wallLength / 2;
  const gapFrom = -half + dims.wallLength * (0.34 + random() * 0.06);
  const gapTo = gapFrom + dims.wallLength * (0.34 + random() * 0.08);
  // A point `along` the wall and `out` from it, in tile-local space.
  const point = (along: number, out: number): [number, number] =>
    [axes.ox * dims.wallOffset + axes.ax * along + axes.ox * out, axes.oz * dims.wallOffset + axes.az * along + axes.oz * out];
  const stub = (from: number, to: number, heightFraction: number) => {
    const [x, z] = point((from + to) / 2, 0);
    return { x, z, length: to - from, heightFraction };
  };
  const stubs = direction ? [stub(-half, gapFrom, 0.72 + random() * 0.12), stub(gapTo, half, 0.42 + random() * 0.14)] : [];
  const blocks: BreachBlock[] = [];
  const gapCentre = (gapFrom + gapTo) / 2;
  const wallYaw = Math.atan2(-axes.az, axes.ax);
  /** A block resting on the ground: its lowest edge touching, slightly bedded in. */
  const settled = (x: number, z: number, sx: number, sy: number, sz: number, yaw: number, tilt: number): BreachBlock =>
    ({ x, y: (sy / 2) * Math.abs(Math.cos(tilt)) + (sz / 2) * Math.abs(Math.sin(tilt)) - sy * 0.12, z, sx, sy, sz, yaw, tilt });
  if (direction) {
    // Loose courses left on each stub's broken end, still lying along the wall.
    for (const [end, stub] of [[gapFrom, stubs[0]!], [gapTo, stubs[1]!]] as const) {
      const inward = end === gapFrom ? -1 : 1;
      const sy = dims.wallThickness * (0.45 + random() * 0.2);
      const [x, z] = point(end - inward * 0.05, (random() - 0.5) * 0.015);
      blocks.push({ x, y: dims.wallHeight * stub.heightFraction + sy * 0.4, z, sx: dims.wallThickness * 1.1, sy, sz: dims.wallThickness * 0.9, yaw: wallYaw + (random() - 0.5) * 0.3, tilt: (random() - 0.5) * 0.25 });
    }
    // Big slabs leaning against the broken ends where they slid off.
    for (const end of [gapFrom, gapTo]) {
      const inward = end === gapFrom ? 1 : -1;
      const [x, z] = point(end + inward * 0.05, -(dims.wallThickness * 0.9));
      blocks.push(settled(x, z, dims.wallThickness * 1.6, dims.wallThickness * 0.7, dims.wallHeight * 0.45, wallYaw + (random() - 0.5) * 0.4, 0.55 + random() * 0.3));
    }
    // Stone spilled through the gap: a fan thrown mostly inward where the attackers broke through,
    // the largest blocks at the foot of the gap and smaller ones flung further.
    for (let i = 0; i < 18; i += 1) {
      const reach = random() ** 1.5;
      const out = random() < 0.75 ? -(0.04 + reach * 0.32) : 0.03 + reach * 0.13;
      const spread = (gapTo - gapFrom) * (0.45 + Math.abs(out) * 1.6);
      const [x, z] = point(gapCentre + (random() - 0.5) * spread, out);
      const scale = 1 - reach * 0.5;
      blocks.push(settled(x, z, (0.06 + random() * 0.07) * scale, (0.035 + random() * 0.035) * scale, (0.05 + random() * 0.05) * scale, random() * Math.PI, (random() - 0.5) * 0.45));
    }
  }
  // The tower at the gap's far end, snapped and fallen inward.
  const towerX = (axes.ax + axes.ox) * dims.towerOffset;
  const towerZ = (axes.az + axes.oz) * dims.towerOffset;
  const stumpFraction = 0.36 + random() * 0.12;
  const topLength = dims.towerHeight * (1 - stumpFraction) * 0.85;
  const inX = -axes.ox;
  const inZ = -axes.oz;
  const fallenTop: BreachBlock = {
    x: towerX + inX * (dims.towerSide * 0.6 + topLength / 2) - axes.ax * 0.04,
    y: dims.towerSide * 0.48,
    z: towerZ + inZ * (dims.towerSide * 0.6 + topLength / 2) - axes.az * 0.04,
    sx: 1, sy: topLength / dims.towerHeight, sz: 1,
    yaw: Math.atan2(inX, inZ) + (random() - 0.5) * 0.4,
    tilt: Math.PI / 2
  };
  // The tower's broken stone, around its foot and along where its top came down.
  for (let i = 0; i < 6; i += 1) {
    const along = random() ** 1.4 * 0.16;
    const size = dims.towerSide * (0.22 + random() * 0.22) * (1 - along * 2);
    blocks.push(settled(towerX + inX * along + (random() - 0.5) * 0.08, towerZ + inZ * along + (random() - 0.5) * 0.08, size, size * 0.6, size * 0.9, random() * Math.PI, (random() - 0.5) * 0.4));
  }
  return { direction, facing, stubs, snappedCorner: cornerIndex(towerX, towerZ), stumpFraction, fallenTop, blocks };
};
