// One-shot "a Module arrives at your AFC" sequence (docs/manifest-afc-module-delivery-animation-plan.md,
// prototype/demo build): a streak burns through atmosphere on the way down,
// sheds a few embers as it cools, then lands in a flash/shockwave/dust
// cloud with a lingering warm glow standing in for "the module powering
// on". Built entirely from techniques already used elsewhere in this
// codebase -- no custom shaders, no new geometry types:
//   - the concentric tapered-cylinder "beam that grows as it descends"
//     trick from popup-marine-strike-fx.ts
//   - a CanvasTexture radial-gradient Sprite for glow, exactly like
//     client-map-3d-aether-bridge-pylon-overlay.ts's aura sprite
//   - the impact ring/flash + staggered rising/drifting smoke puffs from
//     client-map-3d-bombard-fx.ts
// The one new ingredient is a vertical (not radial) gradient CanvasTexture
// mapped onto the streak's own cylinder UVs (V runs 0..1 along the
// height already), giving a white-hot-near-the-object-cooling-into-the-
// trail look for a few hundred bytes of texture instead of a shader.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace
} from "three";

const DROP_HEIGHT = 2.7;
const DESCEND_MS = 700;
const IMPACT_FLASH_MS = 160;
const SHOCKWAVE_MS = 900;
const SMOKE_MS = 2200;
const REVEAL_GLOW_MS = 1400; // starts at impact, glows through the smoke as it thins
const TOTAL_MS = DESCEND_MS + Math.max(SHOCKWAVE_MS, SMOKE_MS, REVEAL_GLOW_MS) + 50;

const EMBER_COUNT = 5;
// A thick, low-hanging bank that billows out wide enough to wrap the whole
// AFC footprint (3x3 tiles -- see the plan doc's own note on the complex's
// radius), not just a thin column rising from the landing point.
const SMOKE_PUFF_COUNT = 16;
const SMOKE_SPREAD_RADIUS = 1.3;
const SMOKE_DRIFT_HEIGHT = 0.7;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeIn = (t: number): number => t * t;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

const setOpacity = (material: Mesh["material"] | Sprite["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial | SpriteMaterial).opacity = clamp01(opacity);
};

/** Vertical gradient for the streak: white-hot near the falling end (v=0,
 * the cylinder's base) cooling through amber to a smoky fade at the
 * trailing end (v=1, the top). Built once, shared by every entry. */
const makeStreakTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const w = 8;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.22, "rgba(255,214,140,0.9)");
  grad.addColorStop(0.55, "rgba(255,140,60,0.55)");
  grad.addColorStop(1, "rgba(120,60,30,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

/** Radial glow, reused for both the streak's head and the post-landing
 * reveal glow (different colors/opacities via each Sprite's own tint). */
const makeGlowTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.4, "rgba(255,190,110,0.55)");
  grad.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

type Ember = { readonly mesh: Mesh; readonly delayMs: number; readonly driftX: number; readonly driftZ: number };
type SmokePuff = { readonly mesh: Mesh; readonly delayMs: number; readonly riseHeight: number; readonly driftX: number; readonly driftZ: number };

type DeliveryEntry = {
  readonly group: Group;
  readonly streak: Mesh;
  readonly streakCore: Mesh;
  readonly headGlow: Sprite;
  readonly embers: Ember[];
  readonly ring: Mesh;
  readonly flash: Mesh;
  readonly shockwave: Mesh;
  readonly smoke: SmokePuff[];
  readonly revealGlow: Sprite;
  readonly startedAt: number;
};

export type AfcModuleDeliveryFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, nowMs: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

export const createAfcModuleDeliveryFxLayer = (scene: Scene): AfcModuleDeliveryFxLayer => {
  const group = new Group();
  group.name = "afc-module-delivery-fx";
  scene.add(group);

  const streakTexture = makeStreakTexture();
  const glowTexture = makeGlowTexture();

  const streakGeometry = new CylinderGeometry(0.05, 0.05, 1, 8, 1, true);
  const streakCoreGeometry = new CylinderGeometry(0.02, 0.02, 1, 8, 1, true);
  const emberGeometry = new BoxGeometry(0.03, 0.03, 0.03);
  const ringGeometry = new RingGeometry(0.08, 0.32, 24);
  const flashGeometry = new CylinderGeometry(0.38, 0.38, 0.04, 16);
  const shockwaveGeometry = new RingGeometry(0.1, 0.2, 28);
  const smokeGeometry = new SphereGeometry(0.24, 8, 6);

  const entries: DeliveryEntry[] = [];

  const makeGlowMaterial = (color: string, opacity: number): SpriteMaterial =>
    new SpriteMaterial({ toneMapped: false, map: glowTexture, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const makeStreakMaterial = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, map: streakTexture, color: "#ffb066", transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const makeImpactMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const makeEmberMaterial = (): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: "#ffcf8a", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const makeSmokeMaterial = (): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: "#9a8c7c", transparent: true, opacity: 0, blending: NormalBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, nowMs: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY, sceneZ);

    const streak = new Mesh(streakGeometry, makeStreakMaterial(0));
    entryGroup.add(streak);
    const streakCore = new Mesh(streakCoreGeometry, makeStreakMaterial(0));
    entryGroup.add(streakCore);

    const headGlow = new Sprite(makeGlowMaterial("#ffe0b0", 0));
    headGlow.scale.set(0.3, 0.3, 0.3);
    entryGroup.add(headGlow);

    const embers: Ember[] = [];
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      const mesh = new Mesh(emberGeometry, makeEmberMaterial());
      entryGroup.add(mesh);
      embers.push({
        mesh,
        delayMs: (i / EMBER_COUNT) * DESCEND_MS * 0.75,
        driftX: (Math.random() - 0.5) * 0.5,
        driftZ: (Math.random() - 0.5) * 0.5
      });
    }

    const ring = new Mesh(ringGeometry, makeImpactMaterial("#ff9a3d", 0));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    entryGroup.add(ring);

    const flash = new Mesh(flashGeometry, makeImpactMaterial("#ffe0a8", 0));
    flash.position.y = 0.02;
    entryGroup.add(flash);

    const shockwave = new Mesh(shockwaveGeometry, makeImpactMaterial("#d99a5c", 0));
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.004;
    entryGroup.add(shockwave);

    const smoke: SmokePuff[] = [];
    for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
      const mesh = new Mesh(smokeGeometry, makeSmokeMaterial());
      mesh.position.y = 0.04;
      entryGroup.add(mesh);
      // Evenly spaced around the AFC plus jitter, at a random radius out to
      // SMOKE_SPREAD_RADIUS, so the bank billows out to wrap the whole
      // complex instead of rising as a thin column over the landing point.
      const angle = (i / SMOKE_PUFF_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const radius = SMOKE_SPREAD_RADIUS * (0.35 + Math.random() * 0.65);
      smoke.push({
        mesh,
        delayMs: i * 22 + Math.random() * 40,
        riseHeight: SMOKE_DRIFT_HEIGHT * (0.55 + Math.random() * 0.6),
        driftX: Math.cos(angle) * radius,
        driftZ: Math.sin(angle) * radius
      });
    }

    const revealGlow = new Sprite(makeGlowMaterial("#ffcf8a", 0));
    revealGlow.scale.set(0.5, 0.5, 0.5);
    revealGlow.position.y = 0.05;
    entryGroup.add(revealGlow);

    group.add(entryGroup);
    entries.push({ group: entryGroup, streak, streakCore, headGlow, embers, ring, flash, shockwave, smoke, revealGlow, startedAt: nowMs });
  };

  const disposeEntry = (entry: DeliveryEntry): void => {
    group.remove(entry.group);
    entry.group.traverse((child) => {
      const target = child as Mesh | Sprite;
      if (!("material" in target)) return;
      const material = target.material;
      if (Array.isArray(material)) for (const m of material) m.dispose();
      else material?.dispose();
    });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= TOTAL_MS) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }

      // Descent: the streak's bottom races down from DROP_HEIGHT, easing
      // in so the final approach reads fast/sudden -- same shape as
      // popup-marine-strike-fx.ts's beam, just recolored via the gradient
      // texture instead of a flat tint.
      const descendT = clamp01(age / DESCEND_MS);
      const bottomY = DROP_HEIGHT * (1 - easeIn(descendT));
      const height = Math.max(0.02, DROP_HEIGHT - bottomY);
      const midY = (DROP_HEIGHT + bottomY) / 2;
      const inDescent = age < DESCEND_MS;
      entry.streak.position.y = midY;
      entry.streak.scale.set(1, height, 1);
      entry.streakCore.position.y = midY;
      entry.streakCore.scale.set(1, height, 1);
      entry.headGlow.position.y = bottomY;

      const impactAge = age - DESCEND_MS;
      const streakFadeT = impactAge < 0 ? 0 : clamp01(impactAge / IMPACT_FLASH_MS);
      setOpacity(entry.streak.material, inDescent || impactAge < IMPACT_FLASH_MS ? 0.6 * (1 - streakFadeT) : 0);
      setOpacity(entry.streakCore.material, inDescent || impactAge < IMPACT_FLASH_MS ? 0.95 * (1 - streakFadeT) : 0);
      setOpacity(entry.headGlow.material, inDescent ? 0.8 : 0.8 * (1 - streakFadeT));

      for (const ember of entry.embers) {
        const emberAge = age - ember.delayMs;
        if (emberAge <= 0 || emberAge > 260) {
          setOpacity(ember.mesh.material, 0);
          continue;
        }
        const t = clamp01(emberAge / 260);
        ember.mesh.position.set(ember.driftX * t, bottomY + t * 0.15, ember.driftZ * t);
        setOpacity(ember.mesh.material, 0.85 * (1 - t));
      }

      if (impactAge < 0) {
        setOpacity(entry.flash.material, 0);
        setOpacity(entry.ring.material, 0);
        setOpacity(entry.shockwave.material, 0);
        setOpacity(entry.revealGlow.material, 0);
        for (const puff of entry.smoke) setOpacity(puff.mesh.material, 0);
        continue;
      }

      const flashT = clamp01(impactAge / IMPACT_FLASH_MS);
      setOpacity(entry.flash.material, impactAge < IMPACT_FLASH_MS ? 0.9 * (1 - flashT) : 0);

      const ringT = clamp01(impactAge / (IMPACT_FLASH_MS * 3));
      const ringScale = 1 + easeOut(ringT) * 1.6;
      entry.ring.scale.set(ringScale, ringScale, ringScale);
      setOpacity(entry.ring.material, impactAge < IMPACT_FLASH_MS ? 0.9 : 0.9 * (1 - ringT));

      const shockT = clamp01(impactAge / SHOCKWAVE_MS);
      const shockScale = 1 + easeOut(shockT) * 5;
      entry.shockwave.scale.set(shockScale, shockScale, shockScale);
      setOpacity(entry.shockwave.material, 0.35 * (1 - shockT));

      for (const puff of entry.smoke) {
        const puffAge = impactAge - puff.delayMs;
        if (puffAge <= 0) {
          setOpacity(puff.mesh.material, 0);
          continue;
        }
        const puffT = clamp01(puffAge / SMOKE_MS);
        // Fast outward billow (most of the spread happens in the first
        // third of the puff's life) so the bank engulfs the AFC quickly,
        // then a slow fade while it lingers and thins.
        const spreadT = easeOut(clamp01(puffAge / (SMOKE_MS * 0.35)));
        puff.mesh.position.y = 0.04 + spreadT * puff.riseHeight;
        puff.mesh.position.x = spreadT * puff.driftX;
        puff.mesh.position.z = spreadT * puff.driftZ;
        const scale = 0.7 + spreadT * 1.9;
        puff.mesh.scale.set(scale, scale, scale);
        const fizzleIn = clamp01(puffAge / 150);
        setOpacity(puff.mesh.material, 0.62 * fizzleIn * (1 - easeIn(puffT)));
      }

      const glowT = clamp01(impactAge / REVEAL_GLOW_MS);
      const glowFadeIn = clamp01(impactAge / 120);
      setOpacity(entry.revealGlow.material, 0.55 * glowFadeIn * (1 - easeIn(glowT)));
    }
  };

  const clear = (): void => {
    while (entries.length > 0) disposeEntry(entries.pop()!);
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    streakGeometry.dispose();
    streakCoreGeometry.dispose();
    emberGeometry.dispose();
    ringGeometry.dispose();
    flashGeometry.dispose();
    shockwaveGeometry.dispose();
    smokeGeometry.dispose();
    streakTexture?.dispose();
    glowTexture?.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
