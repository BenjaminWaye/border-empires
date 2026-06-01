import {
  AdditiveBlending,
  BoxGeometry,
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
  SRGBColorSpace,
  TorusGeometry
} from "three";

// Real 3D anchor pylons standing at each end of an active Aether Bridge.
// The bridge lane itself is still painted as a 2D canvas overlay (it reads
// well as a flat sea-lane), but in true-3D mode the flat anchor glyphs are
// suppressed (see drawAetherBridgeLane's `anchors` option) and these
// steampunk pylons stand in their place: a riveted iron plinth carrying
// two brass towers braced by a slowly turning brass cog, with copper bands
// and finials, all channelling a glowing cyan aether core between the
// towers. One pooled Group per visible bridge endpoint; the orchestrator
// places them every frame from `state.activeAetherBridges`.

const BRASS = "#c2954a";
const COPPER = "#b5673a";
const DARK_IRON = "#2e2a26";
const AETHER_CORE = "#bdf3ff";
const AURA_COLOR = "#9fe6ff";

const TOWER_OFFSET_X = 0.16;
const TOWER_HEIGHT = 0.5;
const TOWER_LEAN = 0.1;
const RIVET_COUNT = 6;
const GEAR_TEETH = 8;
const GEAR_RADIUS = 0.085;
const BASE_LIFT = 0.04;
const BOB_AMPLITUDE = 0.022;
const BOB_PERIOD_MS = 2600;
const PHASE_PER_PYLON = Math.PI * 0.5;
const PULSE_PERIOD_MS = 1500;

type Pylon = {
  readonly group: Group;
  readonly gear: Group;
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
  grad.addColorStop(0, "rgba(196, 246, 255, 0.8)");
  grad.addColorStop(0.45, "rgba(83, 207, 255, 0.32)");
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
  const plinthGeometry = new CylinderGeometry(0.16, 0.2, 0.1, 8);
  const rivetGeometry = new SphereGeometry(0.018, 6, 6);
  const towerGeometry = new CylinderGeometry(0.035, 0.06, TOWER_HEIGHT, 8);
  const bandGeometry = new TorusGeometry(0.05, 0.014, 6, 12);
  const finialGeometry = new ConeGeometry(0.04, 0.09, 6);
  const pipeGeometry = new CylinderGeometry(0.012, 0.012, TOWER_HEIGHT * 0.7, 6);
  const coreGeometry = new CylinderGeometry(0.03, 0.045, TOWER_HEIGHT * 0.9, 6);
  const gearDiscGeometry = new CylinderGeometry(GEAR_RADIUS, GEAR_RADIUS, 0.026, 12);
  const gearToothGeometry = new BoxGeometry(0.03, 0.026, 0.026);
  const gearHubGeometry = new CylinderGeometry(0.03, 0.03, 0.04, 8);

  // Shared materials — the metals stay constant, the aether glows pulse.
  // Low-ish metalness + flat shading + warm emissive so the brass/copper
  // read as warm metal under the scene's plain lighting (there is no
  // environment map for metals to reflect, so pure metalness goes grey).
  const brassMaterial = new MeshStandardMaterial({
    color: BRASS,
    metalness: 0.5,
    roughness: 0.42,
    emissive: "#6b4a16",
    emissiveIntensity: 0.4,
    flatShading: true
  });
  const copperMaterial = new MeshStandardMaterial({
    color: COPPER,
    metalness: 0.45,
    roughness: 0.5,
    emissive: "#5a2c12",
    emissiveIntensity: 0.4,
    flatShading: true
  });
  const ironMaterial = new MeshStandardMaterial({
    color: DARK_IRON,
    metalness: 0.5,
    roughness: 0.62,
    flatShading: true
  });
  const coreMaterial = new MeshBasicMaterial({
    color: AETHER_CORE,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const auraTexture = makeAuraTexture();
  const auraMaterial = new SpriteMaterial({
    map: auraTexture,
    color: AURA_COLOR,
    transparent: true,
    opacity: 0.6,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const buildTower = (sign: number): Group => {
    const tower = new Group();
    tower.position.set(sign * TOWER_OFFSET_X, 0, 0);
    tower.rotation.z = sign * -TOWER_LEAN;

    const shaft = new Mesh(towerGeometry, brassMaterial);
    shaft.position.y = TOWER_HEIGHT / 2 + 0.06;
    tower.add(shaft);

    for (const bandY of [0.22, 0.42]) {
      const band = new Mesh(bandGeometry, copperMaterial);
      band.rotation.x = Math.PI / 2;
      band.position.y = bandY;
      tower.add(band);
    }

    const finial = new Mesh(finialGeometry, copperMaterial);
    finial.position.y = TOWER_HEIGHT + 0.12;
    tower.add(finial);

    const pipe = new Mesh(pipeGeometry, ironMaterial);
    pipe.position.set(sign * 0.03, TOWER_HEIGHT * 0.42, 0.05);
    tower.add(pipe);

    return tower;
  };

  const buildGear = (): Group => {
    const gear = new Group();
    const disc = new Mesh(gearDiscGeometry, brassMaterial);
    disc.rotation.x = Math.PI / 2; // face along local +Z
    gear.add(disc);
    for (let i = 0; i < GEAR_TEETH; i += 1) {
      const angle = (i / GEAR_TEETH) * Math.PI * 2;
      const tooth = new Mesh(gearToothGeometry, brassMaterial);
      tooth.position.set(Math.cos(angle) * GEAR_RADIUS, Math.sin(angle) * GEAR_RADIUS, 0);
      tooth.rotation.z = angle;
      gear.add(tooth);
    }
    const hub = new Mesh(gearHubGeometry, copperMaterial);
    hub.rotation.x = Math.PI / 2;
    gear.add(hub);
    return gear;
  };

  const buildPylon = (): Pylon => {
    const pylonGroup = new Group();

    const plinth = new Mesh(plinthGeometry, ironMaterial);
    plinth.position.y = 0.05;
    pylonGroup.add(plinth);

    for (let i = 0; i < RIVET_COUNT; i += 1) {
      const angle = (i / RIVET_COUNT) * Math.PI * 2;
      const rivet = new Mesh(rivetGeometry, brassMaterial);
      rivet.position.set(Math.cos(angle) * 0.17, 0.1, Math.sin(angle) * 0.17);
      pylonGroup.add(rivet);
    }

    pylonGroup.add(buildTower(-1));
    pylonGroup.add(buildTower(1));

    const core = new Mesh(coreGeometry, coreMaterial);
    core.position.y = TOWER_HEIGHT * 0.5 + 0.08;
    pylonGroup.add(core);

    const gear = buildGear();
    gear.position.set(0, TOWER_HEIGHT * 0.45, 0.04);
    pylonGroup.add(gear);

    const aura = new Sprite(auraMaterial);
    aura.scale.set(0.85, 0.85, 0.85);
    aura.position.y = TOWER_HEIGHT * 0.55;
    pylonGroup.add(aura);

    pylonGroup.visible = false;
    group.add(pylonGroup);
    return { group: pylonGroup, gear, core, aura };
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
    // The brass cog turns, and the aether core + aura pulse so the gate
    // reads as a charged, working mechanism.
    pylon.gear.rotation.z = nowMs / 900 + cursor;
    const pulse = 0.5 + 0.5 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2 + cursor);
    (pylon.core.material as MeshBasicMaterial).opacity = 0.38 + pulse * 0.38;
    const auraScale = 0.78 + pulse * 0.24;
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
    plinthGeometry.dispose();
    rivetGeometry.dispose();
    towerGeometry.dispose();
    bandGeometry.dispose();
    finialGeometry.dispose();
    pipeGeometry.dispose();
    coreGeometry.dispose();
    gearDiscGeometry.dispose();
    gearToothGeometry.dispose();
    gearHubGeometry.dispose();
    brassMaterial.dispose();
    copperMaterial.dispose();
    ironMaterial.dispose();
    coreMaterial.dispose();
    auraMaterial.dispose();
    auraTexture?.dispose();
  };

  return { group, beginFrame, place, endFrame, dispose };
};
