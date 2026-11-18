import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture
} from "three";
import { makeGlowTexture, makeStreakTexture } from "../client-map-3d-afc-module-delivery-fx.js";
import { loadPopupMarineTemplate, type PopupMarineTemplate } from "../client-map-3d-popup-marine/popup-marine-asset.js";
import { createSalvageAncillaryColumn, type SalvageAncillaryColumn } from "./client-map-3d-salvage-ancillaries.js";
import { createSalvageDropship, type SalvageDropship } from "./client-map-3d-salvage-dropship.js";
import {
  SALVAGE_DELIVERY_TOTAL_MS,
  SALVAGE_SHIP_APPROACH_DY,
  SALVAGE_SHIP_HOVER_HEIGHT,
  SALVAGE_SHIP_ORBIT_HEIGHT,
  salvageShipAt,
  type SalvageDeliveryFxEntry
} from "./client-salvage-delivery-fx.js";

// True-3D Imperial delivery for a load of salvage shipped to the Court
// (timeline: client-salvage-delivery-fx.ts; 2D companion:
// client-map-2d-salvage-delivery.ts). The Court's dropship
// (client-map-3d-salvage-dropship.ts) dives in on a slant wrapped in a
// re-entry streak, levels out, brakes on its lift thrusters, drops its legs
// and settles over the Reclamation Works in a billowing smoke bank. Its ramp
// runs out and the Ancillaries -- the game's own marine, in the House's
// colour (client-map-3d-salvage-ancillaries.ts) -- march down it and off
// across the House's land, fading as they disappear into the territory. The
// ramp draws in and the ship climbs back out the way it came.

type SmokePuff = { readonly sprite: Sprite; readonly angle: number; readonly radius: number; readonly rise: number; readonly delay: number };

type Entry = {
  readonly group: Group;
  readonly shipRoot: Group;
  readonly ship: SalvageDropship;
  readonly streak: Mesh;
  readonly streakCore: Mesh;
  readonly heatGlow: Sprite;
  readonly shadow: Mesh;
  readonly blast: Mesh;
  readonly ring: Mesh;
  readonly smoke: readonly SmokePuff[];
  readonly materials: readonly Material[];
  readonly entry: SalvageDeliveryFxEntry;
  readonly surfaceDeltas: readonly number[];
  column: SalvageAncillaryColumn | undefined;
  readonly startedAt: number;
};

export type SalvageDeliveryFxLayer = {
  readonly group: Group;
  /**
   * Starts a delivery whose timeline began at `startedAt` (performance.now() ms;
   * may be in the past). `marcherSurfaceY` is each Ancillary's target ground
   * height, so the column follows the land as it marches out.
   */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, entry: SalvageDeliveryFxEntry, startedAt: number, marcherSurfaceY: readonly number[]) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const MAX_ACTIVE = 4;
const SMOKE_PUFFS = 22;
const STREAK_LENGTH = 3.2;
/** The dive's slope: the streak trails back up along it. */
const APPROACH_TILT = Math.atan2(-SALVAGE_SHIP_APPROACH_DY, SALVAGE_SHIP_ORBIT_HEIGHT - SALVAGE_SHIP_HOVER_HEIGHT);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Soft warm-grey puff; overlapping puffs blend into a bank rather than a stack of discs. */
const makeSmokeTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(188,172,150,0.9)");
  grad.addColorStop(0.55, "rgba(170,156,138,0.45)");
  grad.addColorStop(1, "rgba(160,146,130,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export const createSalvageDeliveryFxLayer = (
  scene: Object3D,
  envMap?: Texture,
  loadTemplate: () => Promise<PopupMarineTemplate> = () => loadPopupMarineTemplate("standard")
): SalvageDeliveryFxLayer => {
  const group = new Group();
  group.name = "salvage-delivery-fx";
  scene.add(group);

  const glowTexture = makeGlowTexture();
  const streakTexture = makeStreakTexture();
  const smokeTexture = makeSmokeTexture();
  const streakGeometry = new CylinderGeometry(0.55, 0.55, 1, 18, 1, true);
  const streakCoreGeometry = new CylinderGeometry(0.22, 0.22, 1, 12, 1, true);
  const shadowGeometry = new CircleGeometry(0.6, 32);
  const blastGeometry = new CircleGeometry(1, 32);
  const ringGeometry = new RingGeometry(0.8, 0.95, 48);
  const entries: Entry[] = [];

  // The marine model loads on the first delivery (cached and shared with the
  // battle overlay); a delivery spawned before it arrives gets its column when
  // it does -- the Ancillaries only step out a couple of seconds in.
  let template: PopupMarineTemplate | undefined;
  let requested = false;
  let disposed = false;
  const requestTemplate = (): void => {
    if (requested) return;
    requested = true;
    loadTemplate()
      .then((loaded) => {
        if (disposed) return;
        template = loaded;
        for (const e of entries) attachColumn(e);
      })
      .catch((err: unknown) => console.error("salvage delivery: marine model failed to load; the Ancillaries will not render", err));
  };

  const attachColumn = (e: Entry): void => {
    if (!template || e.column) return;
    e.column = createSalvageAncillaryColumn(e.group, template, e.entry.color, e.entry.marchers, e.surfaceDeltas);
  };

  const disposeEntry = (e: Entry): void => {
    e.column?.dispose();
    e.ship.dispose();
    group.remove(e.group);
    for (const material of e.materials) material.dispose();
  };

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, delivery: SalvageDeliveryFxEntry, startedAt: number, marcherSurfaceY: readonly number[]): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY, sceneZ);
    const materials: Material[] = [];
    const additive = (color: string, map?: Texture | null): MeshBasicMaterial => {
      const m = new MeshBasicMaterial({ toneMapped: false, color, ...(map ? { map } : {}), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
      materials.push(m);
      return m;
    };
    const sprite = (color: string, map: Texture | null, blending = AdditiveBlending as typeof AdditiveBlending | typeof NormalBlending): Sprite => {
      const m = new SpriteMaterial({ toneMapped: false, map, color, transparent: true, opacity: 0, blending, depthWrite: false });
      materials.push(m);
      return new Sprite(m);
    };

    const ship = createSalvageDropship(glowTexture, envMap);
    const shipRoot = new Group();
    shipRoot.add(ship.group);
    const streak = new Mesh(streakGeometry, additive("#ffb066", streakTexture));
    const streakCore = new Mesh(streakCoreGeometry, additive("#fff0d0", streakTexture));
    const heatGlow = sprite("#ffd6a0", glowTexture);
    heatGlow.scale.setScalar(2.4);
    const shadow = new Mesh(shadowGeometry, (() => {
      const m = new MeshBasicMaterial({ toneMapped: false, color: "#000000", transparent: true, opacity: 0, depthWrite: false });
      materials.push(m);
      return m;
    })());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    const blast = new Mesh(blastGeometry, additive("#ffb266", glowTexture));
    blast.rotation.x = -Math.PI / 2;
    blast.position.y = 0.014;
    const ring = new Mesh(ringGeometry, additive("#e7c08a"));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.016;
    const smoke: SmokePuff[] = [];
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const puff = sprite("#ffffff", smokeTexture, NormalBlending);
      entryGroup.add(puff);
      const noise = Math.abs(Math.sin((delivery.x * 131 + delivery.y * 17 + i) * 12.9898) * 43758.5453) % 1;
      smoke.push({ sprite: puff, angle: (i / SMOKE_PUFFS) * Math.PI * 2 + noise * 0.6, radius: 0.7 + noise * 1.0, rise: 0.25 + noise * 0.45, delay: noise * 260 });
    }
    entryGroup.add(shipRoot, streak, streakCore, heatGlow, shadow, blast, ring);
    group.add(entryGroup);

    const e: Entry = {
      group: entryGroup, shipRoot, ship, streak, streakCore, heatGlow, shadow, blast, ring, smoke, materials,
      entry: delivery, surfaceDeltas: delivery.marchers.map((_, i) => (marcherSurfaceY[i] ?? surfaceY) - surfaceY),
      column: undefined, startedAt
    };
    entries.push(e);
    requestTemplate();
    attachColumn(e);
    while (entries.length > MAX_ACTIVE) disposeEntry(entries.shift()!);
  };

  const updateEntry = (e: Entry, age: number): void => {
    const frame = salvageShipAt(age);
    e.shipRoot.position.set(0, frame.height, frame.offsetDy);
    e.shipRoot.rotation.x = frame.pitch;
    e.ship.update(frame, age);

    // Re-entry: a white-hot streak trailing back up the dive line, wrapped round the hull.
    const heat = frame.heat * frame.alpha;
    for (const s of [e.streak, e.streakCore]) {
      s.visible = heat > 0.01;
      s.scale.set(1, STREAK_LENGTH * (0.4 + 0.6 * frame.heat), 1);
      s.rotation.x = -APPROACH_TILT;
      const half = s.scale.y / 2;
      s.position.set(0, frame.height + 0.1 + Math.cos(APPROACH_TILT) * half, frame.offsetDy - Math.sin(APPROACH_TILT) * half);
    }
    (e.streak.material as MeshBasicMaterial).opacity = 0.6 * heat;
    (e.streakCore.material as MeshBasicMaterial).opacity = 0.8 * heat;
    e.heatGlow.position.set(0, frame.height + 0.1, frame.offsetDy);
    e.heatGlow.material.opacity = 0.9 * heat;

    // Shadow sharpens under the ship as it comes down.
    const near = clamp01(1 - frame.height / SALVAGE_SHIP_ORBIT_HEIGHT);
    e.shadow.position.z = frame.offsetDy;
    e.shadow.scale.setScalar(0.5 + 0.7 * near);
    (e.shadow.material as MeshBasicMaterial).opacity = frame.visible ? frame.alpha * (0.08 + 0.32 * near * near) : 0;

    // Thruster wash on the ground, the touchdown shockwave ring, and the smoke bank.
    const wash = frame.burn * clamp01(1 - (frame.height - SALVAGE_SHIP_HOVER_HEIGHT) / 1.6) * frame.alpha;
    e.blast.scale.setScalar(0.5 + 0.5 * wash);
    (e.blast.material as MeshBasicMaterial).opacity = 0.55 * wash;
    const ringT = (age - 1700) / 900;
    e.ring.visible = ringT > 0 && ringT < 1;
    e.ring.scale.setScalar(0.4 + 2.2 * clamp01(ringT));
    (e.ring.material as MeshBasicMaterial).opacity = 0.5 * (1 - clamp01(ringT));
    for (const puff of e.smoke) {
      const d = frame.dust * clamp01((age - 1500 - puff.delay) / 400 + 0.4);
      const r = puff.radius * (0.45 + 0.55 * frame.dust);
      puff.sprite.position.set(Math.cos(puff.angle) * r, 0.1 + puff.rise * frame.dust, Math.sin(puff.angle) * r * 0.85);
      puff.sprite.scale.setScalar(0.7 + 0.9 * frame.dust);
      puff.sprite.material.opacity = 0.32 * d;
    }

    e.column?.update(age);
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const e = entries[i]!;
      const age = nowMs - e.startedAt;
      if (age >= SALVAGE_DELIVERY_TOTAL_MS) {
        disposeEntry(e);
        entries.splice(i, 1);
        continue;
      }
      updateEntry(e, age);
    }
  };

  const clear = (): void => {
    for (const e of entries) disposeEntry(e);
    entries.length = 0;
  };

  const dispose = (): void => {
    disposed = true;
    clear();
    for (const g of [streakGeometry, streakCoreGeometry, shadowGeometry, blastGeometry, ringGeometry]) g.dispose();
    for (const t of [glowTexture, streakTexture, smokeTexture]) t?.dispose();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
