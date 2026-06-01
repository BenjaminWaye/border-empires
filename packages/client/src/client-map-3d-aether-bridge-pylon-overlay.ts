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
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace
} from "three";

// Real 3D anchor pylons standing at each end of an active Aether Bridge.
// The bridge lane itself is still painted as a 2D canvas overlay (it reads
// well as a flat sea-lane), but in true-3D mode the flat anchor glyphs are
// suppressed (see drawAetherBridgeLane's `anchors` option) and these
// perspective pylons stand in their place: twin faceted crystal spires
// flanking a glowing energy core, capped with bright orbs and wrapped in a
// soft additive aura. One pooled Group per visible bridge endpoint; the
// orchestrator places them every frame from `state.activeAetherBridges`.

// Palette mirrors the 2D aether-pylon SVG: pale crystal -> cyan -> deep blue.
const SPIRE_COLOR = "#6fd3ff";
const SPIRE_EMISSIVE = "#2f90e3";
const ORB_COLOR = "#eafcff";
const CORE_COLOR = "#bdf3ff";
const AURA_COLOR = "#9fe6ff";

const SPIRE_OFFSET_X = 0.17;
const SPIRE_HEIGHT = 0.62;
const BASE_LIFT = 0.04;
const BOB_AMPLITUDE = 0.025;
const BOB_PERIOD_MS = 2600;
const PHASE_PER_PYLON = Math.PI * 0.5;
const PULSE_PERIOD_MS = 1500;

type Pylon = {
  readonly group: Group;
  readonly core: Mesh;
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
  grad.addColorStop(0, "rgba(196, 246, 255, 0.85)");
  grad.addColorStop(0.45, "rgba(83, 207, 255, 0.35)");
  grad.addColorStop(1, "rgba(83, 207, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export type AetherBridgePylonOverlay = {
  readonly group: Group;
  readonly beginFrame: () => void;
  readonly place: (
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    faceAngleY: number,
    nowMs: number
  ) => void;
  readonly endFrame: () => void;
  readonly dispose: () => void;
};

export const createAetherBridgePylonOverlay = (
  scene: Scene,
  maxPylons: number
): AetherBridgePylonOverlay => {
  const group = new Group();
  group.name = "aether-bridge-pylon-overlay";
  scene.add(group);

  // Shared geometry — one set reused across every pooled pylon.
  const spireGeometry = new ConeGeometry(0.07, SPIRE_HEIGHT, 5);
  const orbGeometry = new SphereGeometry(0.05, 12, 12);
  const coreGeometry = new CylinderGeometry(0.035, 0.05, SPIRE_HEIGHT * 0.92, 6);
  const baseGeometry = new CylinderGeometry(0.12, 0.16, 0.06, 8);

  // Shared materials — animated uniformly each frame.
  const spireMaterial = new MeshStandardMaterial({
    color: SPIRE_COLOR,
    emissive: SPIRE_EMISSIVE,
    emissiveIntensity: 0.6,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
    flatShading: true
  });
  const orbMaterial = new MeshBasicMaterial({ color: ORB_COLOR, transparent: true, opacity: 0.95 });
  const coreMaterial = new MeshBasicMaterial({
    color: CORE_COLOR,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const baseMaterial = new MeshStandardMaterial({
    color: SPIRE_EMISSIVE,
    emissive: SPIRE_EMISSIVE,
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85
  });
  const auraTexture = makeAuraTexture();
  const auraMaterial = new SpriteMaterial({
    map: auraTexture,
    color: AURA_COLOR,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const buildPylon = (): Pylon => {
    const pylonGroup = new Group();

    const base = new Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.03;
    pylonGroup.add(base);

    for (const sign of [-1, 1]) {
      const spire = new Mesh(spireGeometry, spireMaterial);
      spire.position.set(sign * SPIRE_OFFSET_X, SPIRE_HEIGHT / 2 + 0.05, 0);
      spire.rotation.z = sign * -0.12;
      pylonGroup.add(spire);

      const orb = new Mesh(orbGeometry, orbMaterial);
      orb.position.set(sign * (SPIRE_OFFSET_X + 0.02), SPIRE_HEIGHT + 0.05, 0);
      pylonGroup.add(orb);
    }

    const core = new Mesh(coreGeometry, coreMaterial);
    core.position.y = SPIRE_HEIGHT * 0.5 + 0.05;
    pylonGroup.add(core);

    const aura = new Sprite(auraMaterial);
    aura.scale.set(0.9, 0.9, 0.9);
    aura.position.y = SPIRE_HEIGHT * 0.55;
    pylonGroup.add(aura);

    pylonGroup.visible = false;
    group.add(pylonGroup);
    return { group: pylonGroup, core, aura };
  };

  const pool: Pylon[] = Array.from({ length: maxPylons }, buildPylon);
  let cursor = 0;

  const beginFrame = (): void => {
    cursor = 0;
  };

  const place = (
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    faceAngleY: number,
    nowMs: number
  ): void => {
    if (cursor >= pool.length) return;
    const pylon = pool[cursor]!;
    const bobPhase = (nowMs / BOB_PERIOD_MS) * Math.PI * 2 + cursor * PHASE_PER_PYLON;
    const bob = Math.sin(bobPhase) * BOB_AMPLITUDE;
    pylon.group.position.set(sceneX, surfaceY + BASE_LIFT + bob, sceneZ);
    pylon.group.rotation.y = faceAngleY;
    // Pulse the energy core + aura so the gate reads as "charged".
    const pulse = 0.5 + 0.5 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2 + cursor);
    pylon.core.rotation.y = nowMs / 700;
    (pylon.core.material as MeshBasicMaterial).opacity = 0.35 + pulse * 0.4;
    const auraScale = 0.8 + pulse * 0.25;
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
    spireGeometry.dispose();
    orbGeometry.dispose();
    coreGeometry.dispose();
    baseGeometry.dispose();
    spireMaterial.dispose();
    orbMaterial.dispose();
    coreMaterial.dispose();
    baseMaterial.dispose();
    auraMaterial.dispose();
    auraTexture?.dispose();
  };

  return { group, beginFrame, place, endFrame, dispose };
};
