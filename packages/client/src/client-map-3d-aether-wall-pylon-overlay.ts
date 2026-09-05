import {
  AdditiveBlending,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial
} from "three";

// Real 3D anchor pylons standing at each end of an active Aether Wall
// segment. The beam itself is still painted as a 2D canvas overlay (see
// drawAetherWallSegment) since a flat glowing line reads fine laid over
// terrain from any camera angle, but in true-3D mode the flat pylon glyphs
// at its endpoints (drawAetherWallSegment's `pylons` option) are suppressed
// and these frosted-crystal spires stand in their place: a splayed steel
// tripod base carrying a faceted ice-blue crystal shaft. One pooled Group
// per visible wall-edge endpoint; the orchestrator places them every frame
// from `state.activeAetherWalls` (via buildAetherWallSegments).

const STEEL = "#8496ad";
const STEEL_DARK = "#4a5668";
const CRYSTAL_CORE = "#bdeeff";
const AURA_COLOR = "#7fd6ff";

const LEG_COUNT = 3;
const LEG_SPLAY = 0.15;
const SHAFT_HEIGHT = 0.46;
const BASE_LIFT = 0.03;
const BOB_AMPLITUDE = 0.018;
const BOB_PERIOD_MS = 2200;
const PHASE_PER_PYLON = Math.PI * 0.6;
const PULSE_PERIOD_MS = 1200;

type Pylon = {
  readonly group: Group;
  readonly shaft: Mesh;
  readonly aura: Sprite;
};

const makeAuraTexture = (): CanvasTexture | null => {
  // Node test env has no `document`; the overlay still builds (no texture).
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(210, 249, 255, 0.75)");
  grad.addColorStop(0.45, "rgba(110, 210, 255, 0.28)");
  grad.addColorStop(1, "rgba(110, 210, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export type AetherWallPylonOverlay = {
  readonly group: Group;
  readonly beginFrame: () => void;
  readonly place: (sceneX: number, surfaceY: number, sceneZ: number, faceAngleY: number, nowMs: number) => void;
  readonly endFrame: () => void;
  readonly dispose: () => void;
};

export const createAetherWallPylonOverlay = (scene: Scene, maxPylons: number): AetherWallPylonOverlay => {
  const group = new Group();
  group.name = "aether-wall-pylon-overlay";
  scene.add(group);

  // Shared geometry — one set reused across every pooled pylon.
  const legGeometry = new CylinderGeometry(0.012, 0.02, 0.16, 5);
  const footGeometry = new ConeGeometry(0.03, 0.05, 5);
  const shaftGeometry = new ConeGeometry(0.06, SHAFT_HEIGHT * 0.6, 4);
  const shaftLowerGeometry = new ConeGeometry(0.06, SHAFT_HEIGHT * 0.4, 4);

  // Shared materials — the steel frame stays constant, the crystal pulses.
  const steelMaterial = new MeshStandardMaterial({
    color: STEEL,
    metalness: 0.4,
    roughness: 0.5,
    flatShading: true
  });
  const steelDarkMaterial = new MeshStandardMaterial({
    color: STEEL_DARK,
    metalness: 0.35,
    roughness: 0.6,
    flatShading: true
  });
  const crystalMaterial = new MeshBasicMaterial({
    toneMapped: false,
    color: CRYSTAL_CORE,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const auraTexture = makeAuraTexture();
  const auraMaterial = new SpriteMaterial({
    toneMapped: false,
    map: auraTexture,
    color: AURA_COLOR,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const buildPylon = (): Pylon => {
    const pylonGroup = new Group();

    for (let i = 0; i < LEG_COUNT; i += 1) {
      const angle = (i / LEG_COUNT) * Math.PI * 2;
      const leg = new Mesh(legGeometry, steelDarkMaterial);
      leg.position.set(Math.cos(angle) * LEG_SPLAY, 0.08, Math.sin(angle) * LEG_SPLAY);
      leg.rotation.x = Math.cos(angle) * 0.5;
      leg.rotation.z = -Math.sin(angle) * 0.5;
      pylonGroup.add(leg);

      const foot = new Mesh(footGeometry, steelMaterial);
      foot.position.set(Math.cos(angle) * LEG_SPLAY * 1.4, 0.02, Math.sin(angle) * LEG_SPLAY * 1.4);
      pylonGroup.add(foot);
    }

    const shaftLower = new Mesh(shaftLowerGeometry, crystalMaterial);
    shaftLower.position.y = 0.16 + (SHAFT_HEIGHT * 0.4) / 2;
    pylonGroup.add(shaftLower);

    const shaft = new Mesh(shaftGeometry, crystalMaterial);
    shaft.position.y = 0.16 + SHAFT_HEIGHT * 0.4 + (SHAFT_HEIGHT * 0.6) / 2;
    pylonGroup.add(shaft);

    const aura = new Sprite(auraMaterial);
    aura.scale.set(0.5, 0.5, 0.5);
    aura.position.y = 0.16 + SHAFT_HEIGHT * 0.55;
    pylonGroup.add(aura);

    pylonGroup.visible = false;
    group.add(pylonGroup);
    return { group: pylonGroup, shaft, aura };
  };

  const pool: Pylon[] = Array.from({ length: maxPylons }, buildPylon);
  let cursor = 0;

  const beginFrame = (): void => {
    cursor = 0;
  };

  const place = (sceneX: number, surfaceY: number, sceneZ: number, faceAngleY: number, nowMs: number): void => {
    if (cursor >= pool.length) return;
    const pylon = pool[cursor]!;
    const bobPhase = (nowMs / BOB_PERIOD_MS) * Math.PI * 2 + cursor * PHASE_PER_PYLON;
    const bob = Math.sin(bobPhase) * BOB_AMPLITUDE;
    pylon.group.position.set(sceneX, surfaceY + BASE_LIFT + bob, sceneZ);
    pylon.group.rotation.y = faceAngleY;
    // The crystal shaft pulses so the barrier reads as a charged, active
    // ward rather than a static prop.
    const pulse = 0.5 + 0.5 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2 + cursor);
    (pylon.shaft.material as MeshBasicMaterial).opacity = 0.4 + pulse * 0.4;
    const auraScale = 0.42 + pulse * 0.18;
    pylon.aura.scale.set(auraScale, auraScale, auraScale);
    pylon.group.visible = true;
    cursor += 1;
  };

  const endFrame = (): void => {
    for (let i = cursor; i < pool.length; i += 1) {
      pool[i]!.group.visible = false;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    legGeometry.dispose();
    footGeometry.dispose();
    shaftGeometry.dispose();
    shaftLowerGeometry.dispose();
    steelMaterial.dispose();
    steelDarkMaterial.dispose();
    crystalMaterial.dispose();
    auraMaterial.dispose();
    auraTexture?.dispose();
  };

  return { group, beginFrame, place, endFrame, dispose };
};
