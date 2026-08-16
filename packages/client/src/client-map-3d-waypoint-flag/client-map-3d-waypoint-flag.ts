import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry
} from "three";

// The waypoint flag is a full steampunk tower: octagonal glow base, wide
// brass pedestal with two side cannons, a banner-bearing trunk, a winged
// gear medallion, a brass dome, and a spire. Extracted from
// client-map-3d.ts so both the live 3D renderer and Storybook can build
// the identical model — one active waypoint (full empire-color tint,
// full opacity) plus any number of queued waypoints behind it (dimmed,
// grayscale tint, numbered) all come from this one factory.
const BRASS_HI = "#d2a76a";
const BRASS_LO = "#8b6f47";
const COPPER = "#a85d36";

const QUEUE_BADGE_SIZE = 0.26;

export type WaypointFlag = {
  readonly group: Group;
  // bannerColor drives the banner face; glowColor drives the base ring,
  // pedestal glow, and medallion face. The brass/copper structural bits
  // never change color — only the "energy" reads as empire-colored (or
  // desaturated gray for a queued, non-active waypoint).
  readonly setTint: (bannerColor: string, glowColor: string) => void;
  // Multiplies every material's base opacity. 1 = full active flag,
  // < 1 dims a queued waypoint so it visually recedes behind the active one.
  readonly setOpacityScale: (scale: number) => void;
  // A blocked/halted waypoint reads brighter on the glow ring and
  // smoke (more "urgent") than a normal active waypoint.
  readonly setHalted: (isHalted: boolean) => void;
  // undefined hides the badge (used for the active, first-in-queue flag).
  // A number shows "2", "3", etc. above the medallion.
  readonly setQueueNumber: (n: number | undefined) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

const drawQueueBadgeTexture = (n: number): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64);
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#4b5563";
    ctx.fill();
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f3f4f6";
    ctx.fillText(String(n), 32, 34);
  }
  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export const createWaypointFlag = (): WaypointFlag => {
  const group = new Group();

  const baseHexMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const baseHex = new Mesh(new TorusGeometry(0.55, 0.04, 4, 8), baseHexMaterial);
  baseHex.rotation.x = Math.PI / 2;
  baseHex.rotation.z = Math.PI / 8;
  baseHex.position.y = 0.01;

  const pedestalMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_LO, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const pedestal = new Mesh(new CylinderGeometry(0.42, 0.46, 0.16, 8), pedestalMaterial);
  pedestal.position.y = 0.1;

  const pedestalGlowMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  const pedestalGlow = new Mesh(new TorusGeometry(0.28, 0.03, 4, 16), pedestalGlowMaterial);
  pedestalGlow.rotation.x = Math.PI / 2;
  pedestalGlow.position.y = 0.19;

  const cannonMaterial = new MeshBasicMaterial({ toneMapped: false, color: COPPER, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const cannonLeft = new Mesh(new CylinderGeometry(0.04, 0.05, 0.32, 10), cannonMaterial);
  cannonLeft.rotation.z = Math.PI / 2;
  cannonLeft.position.set(-0.4, 0.24, 0);
  const cannonRight = new Mesh(new CylinderGeometry(0.04, 0.05, 0.32, 10), cannonMaterial);
  cannonRight.rotation.z = Math.PI / 2;
  cannonRight.position.set(0.4, 0.24, 0);

  const towerMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const towerTrunk = new Mesh(new CylinderGeometry(0.075, 0.1, 1.1, 12), towerMaterial);
  towerTrunk.position.y = 0.75;
  const towerBandMaterial = new MeshBasicMaterial({ toneMapped: false, color: COPPER, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const towerBandLow = new Mesh(new CylinderGeometry(0.105, 0.105, 0.04, 12), towerBandMaterial);
  towerBandLow.position.y = 0.4;
  const towerBandHi = new Mesh(new CylinderGeometry(0.085, 0.085, 0.04, 12), towerBandMaterial);
  towerBandHi.position.y = 1.05;

  const bannerArm = new Mesh(new CylinderGeometry(0.025, 0.025, 0.5, 8), towerMaterial);
  bannerArm.rotation.z = Math.PI / 2;
  bannerArm.position.y = 0.7;
  const bannerArmCapL = new Mesh(new SphereGeometry(0.04, 8, 6), towerMaterial);
  bannerArmCapL.position.set(-0.25, 0.7, 0);
  const bannerArmCapR = new Mesh(new SphereGeometry(0.04, 8, 6), towerMaterial);
  bannerArmCapR.position.set(0.25, 0.7, 0);

  const bannerBackingMaterial = new MeshBasicMaterial({ toneMapped: false, color: COPPER, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: DoubleSide });
  const bannerBacking = new Mesh(new PlaneGeometry(0.42, 0.7), bannerBackingMaterial);
  bannerBacking.position.set(0, 0.36, -0.005);
  const bannerMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.97, depthTest: false, depthWrite: false, side: DoubleSide });
  const banner = new Mesh(new PlaneGeometry(0.36, 0.62), bannerMaterial);
  banner.position.set(0, 0.38, 0);

  const bannerEmblemPlateMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_LO, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const bannerEmblemPlate = new Mesh(new CylinderGeometry(0.1, 0.1, 0.005, 16), bannerEmblemPlateMaterial);
  bannerEmblemPlate.rotation.x = Math.PI / 2;
  bannerEmblemPlate.position.set(0, 0.4, 0.01);
  const bannerEmblemRingMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const bannerEmblemRing = new Mesh(new TorusGeometry(0.1, 0.012, 6, 16), bannerEmblemRingMaterial);
  bannerEmblemRing.position.set(0, 0.4, 0.015);

  const medallionFrameMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const medallionFrame = new Mesh(new TorusGeometry(0.22, 0.025, 8, 24), medallionFrameMaterial);
  medallionFrame.position.y = 1.35;
  const medallionFaceMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const medallionFace = new Mesh(new CylinderGeometry(0.2, 0.2, 0.025, 18), medallionFaceMaterial);
  medallionFace.rotation.x = Math.PI / 2;
  medallionFace.position.y = 1.35;

  const wingMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const wingLeft = new Mesh(new ConeGeometry(0.06, 0.3, 5), wingMaterial);
  wingLeft.rotation.z = Math.PI / 2;
  wingLeft.position.set(-0.36, 1.35, 0);
  const wingRight = new Mesh(new ConeGeometry(0.06, 0.3, 5), wingMaterial);
  wingRight.rotation.z = -Math.PI / 2;
  wingRight.position.set(0.36, 1.35, 0);

  const domeMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const dome = new Mesh(new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial);
  dome.position.y = 1.5;
  const spireMaterial = new MeshBasicMaterial({ toneMapped: false, color: BRASS_HI, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  const spire = new Mesh(new ConeGeometry(0.025, 0.22, 8), spireMaterial);
  spire.position.y = 1.72;

  const smokeMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: DoubleSide });
  const smokeLeft = new Mesh(new PlaneGeometry(0.12, 0.5), smokeMaterial);
  smokeLeft.position.set(-0.28, 0.5, 0);
  const smokeRight = new Mesh(new PlaneGeometry(0.12, 0.5), smokeMaterial);
  smokeRight.position.set(0.28, 0.5, 0);

  group.add(
    baseHex,
    pedestal,
    pedestalGlow,
    cannonLeft,
    cannonRight,
    smokeLeft,
    smokeRight,
    towerTrunk,
    towerBandLow,
    towerBandHi,
    bannerArm,
    bannerArmCapL,
    bannerArmCapR,
    bannerBacking,
    banner,
    bannerEmblemPlate,
    bannerEmblemRing,
    medallionFrame,
    medallionFace,
    wingLeft,
    wingRight,
    dome,
    spire
  );

  // Render order controls draw sequence for these depthTest:false,
  // transparent meshes so the tower reads front-to-back correctly
  // (base ring behind the pedestal, banner in front of its backing, etc).
  baseHex.renderOrder = 30;
  pedestal.renderOrder = 31;
  pedestalGlow.renderOrder = 31;
  cannonLeft.renderOrder = 31;
  cannonRight.renderOrder = 31;
  smokeLeft.renderOrder = 30;
  smokeRight.renderOrder = 30;
  towerTrunk.renderOrder = 32;
  towerBandLow.renderOrder = 32;
  towerBandHi.renderOrder = 32;
  bannerArm.renderOrder = 32;
  bannerArmCapL.renderOrder = 32;
  bannerArmCapR.renderOrder = 32;
  bannerBacking.renderOrder = 32;
  banner.renderOrder = 33;
  bannerEmblemPlate.renderOrder = 34;
  bannerEmblemRing.renderOrder = 35;
  medallionFrame.renderOrder = 34;
  medallionFace.renderOrder = 33;
  wingLeft.renderOrder = 33;
  wingRight.renderOrder = 33;
  dome.renderOrder = 34;
  spire.renderOrder = 35;

  // Base opacity each material was constructed with — setOpacityScale
  // multiplies against these rather than the material's current
  // (possibly already-scaled) opacity, so repeated calls stay stable.
  // baseHex/pedestalGlow/smoke get their base opacity from setHalted
  // (a blocked waypoint reads brighter/more urgent) rather than this
  // fixed list — see applyGlowOpacities below.
  const dimmable: ReadonlyArray<{ material: MeshBasicMaterial; baseOpacity: number }> = [
    { material: pedestalMaterial, baseOpacity: 0.98 },
    { material: cannonMaterial, baseOpacity: 0.98 },
    { material: towerMaterial, baseOpacity: 0.98 },
    { material: towerBandMaterial, baseOpacity: 0.95 },
    { material: bannerBackingMaterial, baseOpacity: 0.95 },
    { material: bannerMaterial, baseOpacity: 0.97 },
    { material: bannerEmblemPlateMaterial, baseOpacity: 0.95 },
    { material: bannerEmblemRingMaterial, baseOpacity: 0.98 },
    { material: medallionFrameMaterial, baseOpacity: 0.98 },
    { material: medallionFaceMaterial, baseOpacity: 0.9 },
    { material: wingMaterial, baseOpacity: 0.95 },
    { material: domeMaterial, baseOpacity: 0.98 },
    { material: spireMaterial, baseOpacity: 0.98 }
  ];
  let opacityScale = 1;
  let halted = false;

  const applyGlowOpacities = (): void => {
    baseHexMaterial.opacity = (halted ? 0.85 : 0.7) * opacityScale;
    pedestalGlowMaterial.opacity = (halted ? 0.95 : 0.8) * opacityScale;
  };

  const setTint = (bannerColor: string, glowColor: string): void => {
    bannerMaterial.color.set(bannerColor);
    baseHexMaterial.color.set(glowColor);
    pedestalGlowMaterial.color.set(glowColor);
    medallionFaceMaterial.color.set(glowColor);
    smokeMaterial.color.set(glowColor);
  };

  // A blocked/halted waypoint (no path currently reachable) reads
  // brighter on the glow ring, pedestal ring, and smoke than a normal
  // active waypoint — callers pair this with an amber/warning tint via
  // setTint so the whole assembly reads as "stuck", not just dimmer.
  const setHalted = (isHalted: boolean): void => {
    halted = isHalted;
    applyGlowOpacities();
  };

  const setOpacityScale = (scale: number): void => {
    opacityScale = Math.max(0, Math.min(1, scale));
    for (const { material, baseOpacity } of dimmable) {
      material.opacity = baseOpacity * opacityScale;
    }
    applyGlowOpacities();
  };

  let badgeSprite: Sprite | undefined;
  let badgeTexture: Texture | undefined;
  let currentQueueNumber: number | undefined;

  const setQueueNumber = (n: number | undefined): void => {
    if (n === currentQueueNumber) return;
    currentQueueNumber = n;
    if (badgeSprite) {
      group.remove(badgeSprite);
      (badgeSprite.material as SpriteMaterial).dispose();
      badgeTexture?.dispose();
      badgeSprite = undefined;
      badgeTexture = undefined;
    }
    if (n === undefined) return;
    badgeTexture = drawQueueBadgeTexture(n);
    const material = new SpriteMaterial({ toneMapped: false, map: badgeTexture, transparent: true, depthTest: false, depthWrite: false });
    badgeSprite = new Sprite(material);
    badgeSprite.scale.set(QUEUE_BADGE_SIZE, QUEUE_BADGE_SIZE, 1);
    badgeSprite.position.set(0.3, 1.55, 0);
    // Added lazily (only once a queue number is ever set), after the live
    // renderer's one-time "set every child frustumCulled=false" pass — set
    // it here directly so a late-added badge isn't culled at screen edges.
    badgeSprite.frustumCulled = false;
    group.add(badgeSprite);
  };

  const tick = (nowMs: number): void => {
    const t = nowMs / 1000;
    group.position.y += Math.sin(t * 1.4) * 0.03;
    baseHex.rotation.z = Math.PI / 8 + t * 0.15;
    pedestalGlow.rotation.z = -t * 0.25;
    medallionFrame.rotation.z = t * 0.35;
    medallionFace.rotation.z = -t * 0.5;
    banner.rotation.y = Math.sin(t * 2.0) * 0.12;
    bannerBacking.rotation.y = banner.rotation.y;
    bannerEmblemPlate.rotation.y = banner.rotation.y;
    bannerEmblemRing.rotation.y = banner.rotation.y;
    const smokeBaseY = 0.5;
    const smokeWave = (Math.sin(t * 1.1) + 1) * 0.5;
    smokeLeft.position.y = smokeBaseY + smokeWave * 0.18;
    smokeRight.position.y = smokeBaseY + smokeWave * 0.18 + 0.06;
    smokeMaterial.opacity = ((halted ? 0.1 : 0.12) + smokeWave * 0.1) * opacityScale;
  };

  const dispose = (): void => {
    if (badgeSprite) {
      (badgeSprite.material as SpriteMaterial).dispose();
      badgeTexture?.dispose();
    }
    const materials: Material[] = [
      baseHexMaterial, pedestalMaterial, pedestalGlowMaterial, cannonMaterial,
      towerMaterial, towerBandMaterial, bannerBackingMaterial, bannerMaterial,
      bannerEmblemPlateMaterial, bannerEmblemRingMaterial, medallionFrameMaterial,
      medallionFaceMaterial, wingMaterial, domeMaterial, spireMaterial, smokeMaterial
    ];
    for (const material of materials) material.dispose();
    for (const mesh of [
      baseHex, pedestal, pedestalGlow, cannonLeft, cannonRight, smokeLeft, smokeRight,
      towerTrunk, towerBandLow, towerBandHi, bannerArm, bannerArmCapL, bannerArmCapR,
      bannerBacking, banner, bannerEmblemPlate, bannerEmblemRing, medallionFrame,
      medallionFace, wingLeft, wingRight, dome, spire
    ]) {
      mesh.geometry.dispose();
    }
  };

  applyGlowOpacities();

  return { group, setTint, setOpacityScale, setHalted, setQueueNumber, tick, dispose };
};
