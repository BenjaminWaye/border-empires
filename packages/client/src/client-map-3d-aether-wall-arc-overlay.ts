import { AdditiveBlending, CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, Quaternion, Scene, TubeGeometry, Vector3 } from "three";

// Pulsing electric arcs strung between each Aether Wall segment's two pylons
// (see client-map-3d-aether-wall-pylon-overlay.ts), so the barrier reads as
// a live current rather than two disconnected props. Each pooled arc is a
// jittered lightning-bolt tube built once in local unit space (0,0,0) to
// (1,0,0) and re-oriented/rescaled every frame to span its pylon pair --
// cheap, since only the transform changes, never the geometry.
const ARC_RADIUS = 0.014;
const ARC_COLOR = "#d8fbff";
const FLICKER_PERIOD_MS = 90;
const PULSE_PERIOD_MS = 1200;
const JITTER_SEED_COUNT = 3;

type Arc = { readonly mesh: Mesh; readonly seed: number };

// A handful of fixed jitter patterns (not random per-frame -- a bolt whose
// zigzag reshapes every tick reads as noise, not electricity) cycled across
// pooled arcs so adjacent segments don't all bend identically.
const buildBoltGeometry = (seed: number): TubeGeometry => {
  const rand = (n: number): number => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x) - 0.5;
  };
  const points: Vector3[] = [];
  const steps = 7;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const edgeTaper = Math.sin(t * Math.PI);
    const jitterY = i === 0 || i === steps ? 0 : rand(i) * 0.14 * edgeTaper;
    const jitterZ = i === 0 || i === steps ? 0 : rand(i + 0.5) * 0.14 * edgeTaper;
    points.push(new Vector3(t, jitterY, jitterZ));
  }
  const curve = new CatmullRomCurve3(points);
  return new TubeGeometry(curve, 16, ARC_RADIUS, 5, false);
};

export type AetherWallArcOverlay = {
  readonly group: Group;
  readonly beginFrame: () => void;
  readonly place: (
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    nowMs: number
  ) => void;
  readonly endFrame: () => void;
  readonly dispose: () => void;
};

export const createAetherWallArcOverlay = (scene: Scene, maxArcs: number): AetherWallArcOverlay => {
  const group = new Group();
  group.name = "aether-wall-arc-overlay";
  scene.add(group);

  const boltGeometries = Array.from({ length: JITTER_SEED_COUNT }, (_, i) => buildBoltGeometry(i + 1));
  const arcMaterial = new MeshBasicMaterial({
    toneMapped: false,
    color: ARC_COLOR,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const pool: Arc[] = Array.from({ length: maxArcs }, (_, i) => {
    const seed = i % JITTER_SEED_COUNT;
    const mesh = new Mesh(boltGeometries[seed]!, arcMaterial);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, seed };
  });
  let cursor = 0;

  const beginFrame = (): void => {
    cursor = 0;
  };

  const from = new Vector3();
  const to = new Vector3();
  const direction = new Vector3();
  const unitX = new Vector3(1, 0, 0);
  const orientation = new Quaternion();
  const place = (
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    nowMs: number
  ): void => {
    if (cursor >= pool.length) return;
    const arc = pool[cursor]!;
    from.set(fromX, fromY, fromZ);
    to.set(toX, toY, toZ);
    const distance = from.distanceTo(to);
    direction.copy(to).sub(from).normalize();
    orientation.setFromUnitVectors(unitX, direction);
    arc.mesh.position.copy(from);
    // The bolt geometry runs from local x=0 to x=1 with a fixed absolute
    // radius, so only the length axis is rescaled -- otherwise a long span
    // would balloon the tube's radius along with it.
    arc.mesh.scale.set(distance, 1, 1);
    arc.mesh.quaternion.copy(orientation);
    // Flicker (fast, jagged) layered on a slower pulse so the current reads
    // as live electricity, not a smooth breathing glow like the crystals.
    const pulse = 0.6 + 0.4 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2 + arc.seed * 2.1);
    const flickerPhase = Math.floor(nowMs / FLICKER_PERIOD_MS) + arc.seed * 7;
    const flicker = 0.75 + 0.25 * Math.abs(Math.sin(flickerPhase * 12.9898));
    (arc.mesh.material as MeshBasicMaterial).opacity = 0.35 + pulse * flicker * 0.55;
    arc.mesh.visible = true;
    cursor += 1;
  };

  const endFrame = (): void => {
    for (let i = cursor; i < pool.length; i += 1) {
      pool[i]!.mesh.visible = false;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const geometry of boltGeometries) geometry.dispose();
    arcMaterial.dispose();
  };

  return { group, beginFrame, place, endFrame, dispose };
};
