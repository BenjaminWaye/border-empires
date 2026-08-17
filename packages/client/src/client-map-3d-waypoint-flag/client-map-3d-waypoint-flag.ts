import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry
} from "three";

// The waypoint flag is a small planted pennant: iron pole, spiked tip,
// a banner-color pennant, and a ground glow ring. Deliberately modest —
// it marks a mere movement destination, not a rallying point — unlike
// the elaborate tower used for mustering (client-map-3d-muster-overlay.ts).
// Extracted here so both the live 3D renderer and Storybook can build the
// identical model — one active waypoint (full empire-color tint, full
// opacity) plus any number of queued waypoints behind it (dimmed,
// grayscale tint, numbered) all come from this one factory.
const POLE_COLOR = "#2d2d3c";
const SPIKE_COLOR = "#4a4a5c";

const POLE_H = 0.62;
const POLE_R_BOT = 0.026;
const POLE_R_TOP = 0.020;
const PENNANT_W = 0.30;
const PENNANT_H = 0.17;
const SPIKE_H = 0.11;
const SPIKE_R = 0.026;
const GLOW_R = 0.24;
const QUEUE_BADGE_SIZE = 0.26;

export type WaypointFlag = {
  readonly group: Group;
  // bannerColor drives the pennant fabric; glowColor drives the ground
  // glow ring. The pole/spike stay metallic — only the "energy" reads as
  // empire-colored (or desaturated gray for a queued, non-active waypoint).
  readonly setTint: (bannerColor: string, glowColor: string) => void;
  // Multiplies every material's base opacity. 1 = full active flag,
  // < 1 dims a queued waypoint so it visually recedes behind the active one.
  readonly setOpacityScale: (scale: number) => void;
  // A blocked/halted waypoint reads brighter on the glow ring (more
  // "urgent") than a normal active waypoint.
  readonly setHalted: (isHalted: boolean) => void;
  // undefined hides the badge (used for the active, first-in-queue flag).
  // A number shows "2", "3", etc. above the pennant.
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

// Right-pointing triangle: top-left, bottom-left, right tip.
const buildPennantGeometry = (): BufferGeometry => {
  const g = new BufferGeometry();
  const hh = PENNANT_H * 0.5;
  g.setAttribute("position", new BufferAttribute(new Float32Array([
    0, hh, 0,
    0, -hh, 0,
    PENNANT_W, 0, 0
  ]), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1
  ]), 3));
  g.setIndex([0, 1, 2]);
  return g;
};

export const createWaypointFlag = (): WaypointFlag => {
  const group = new Group();

  const glowMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const glow = new Mesh(new TorusGeometry(GLOW_R, 0.02, 4, 16), glowMaterial);
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.01;

  const poleMaterial = new MeshBasicMaterial({ toneMapped: false, color: POLE_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const pole = new Mesh(new CylinderGeometry(POLE_R_TOP, POLE_R_BOT, POLE_H, 8), poleMaterial);
  pole.position.y = POLE_H * 0.5;

  const spikeMaterial = new MeshBasicMaterial({ toneMapped: false, color: SPIKE_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const spike = new Mesh(new ConeGeometry(SPIKE_R, SPIKE_H, 4), spikeMaterial);
  spike.position.y = POLE_H + SPIKE_H * 0.5;

  // Pennant top-left corner anchors near the pole top, hangs rightward.
  const pennantMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", side: DoubleSide, transparent: true, opacity: 0.97, depthTest: false, depthWrite: false });
  const pennant = new Mesh(buildPennantGeometry(), pennantMaterial);
  pennant.position.y = POLE_H - PENNANT_H * 0.35;

  group.add(glow, pole, spike, pennant);

  // Render order controls draw sequence for these depthTest:false,
  // transparent meshes so the flag reads front-to-back correctly.
  glow.renderOrder = 30;
  pole.renderOrder = 31;
  spike.renderOrder = 32;
  pennant.renderOrder = 32;

  // Base opacity each material was constructed with — setOpacityScale
  // multiplies against these rather than the material's current
  // (possibly already-scaled) opacity, so repeated calls stay stable.
  // glowMaterial gets its base opacity from setHalted (a blocked waypoint
  // reads brighter/more urgent) rather than this fixed list.
  const dimmable: ReadonlyArray<{ material: MeshBasicMaterial; baseOpacity: number }> = [
    { material: poleMaterial, baseOpacity: 0.95 },
    { material: spikeMaterial, baseOpacity: 0.95 },
    { material: pennantMaterial, baseOpacity: 0.97 }
  ];
  let opacityScale = 1;
  let halted = false;

  const applyGlowOpacity = (): void => {
    glowMaterial.opacity = (halted ? 0.9 : 0.7) * opacityScale;
  };

  const setTint = (bannerColor: string, glowColor: string): void => {
    pennantMaterial.color.set(bannerColor);
    glowMaterial.color.set(glowColor);
  };

  // A blocked/halted waypoint (no path currently reachable) reads
  // brighter on the glow ring than a normal active waypoint — callers
  // pair this with an amber/warning tint via setTint so the whole
  // assembly reads as "stuck", not just dimmer.
  const setHalted = (isHalted: boolean): void => {
    halted = isHalted;
    applyGlowOpacity();
  };

  const setOpacityScale = (scale: number): void => {
    opacityScale = Math.max(0, Math.min(1, scale));
    for (const { material, baseOpacity } of dimmable) {
      material.opacity = baseOpacity * opacityScale;
    }
    applyGlowOpacity();
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
    badgeSprite.position.set(0, POLE_H + SPIKE_H + 0.14, 0);
    // Added lazily (only once a queue number is ever set), after the live
    // renderer's one-time "set every child frustumCulled=false" pass — set
    // it here directly so a late-added badge isn't culled at screen edges.
    badgeSprite.frustumCulled = false;
    group.add(badgeSprite);
  };

  const tick = (nowMs: number): void => {
    const t = nowMs / 1000;
    group.position.y += Math.sin(t * 1.4) * 0.02;
    glow.rotation.z = t * 0.2;
    pennant.rotation.y = Math.sin(t * 2.4) * 0.18;
  };

  const dispose = (): void => {
    if (badgeSprite) {
      (badgeSprite.material as SpriteMaterial).dispose();
      badgeTexture?.dispose();
    }
    const materials: Material[] = [glowMaterial, poleMaterial, spikeMaterial, pennantMaterial];
    for (const material of materials) material.dispose();
    for (const mesh of [glow, pole, spike, pennant]) mesh.geometry.dispose();
  };

  applyGlowOpacity();

  return { group, setTint, setOpacityScale, setHalted, setQueueNumber, tick, dispose };
};
