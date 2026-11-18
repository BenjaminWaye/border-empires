import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Blending,
  type Material,
  type Object3D
} from "three";
import { makeGlowTexture } from "../client-map-3d-afc-module-delivery-fx.js";
import {
  SALVAGE_DELIVERY_TOTAL_MS,
  SALVAGE_RAMP_HINGE_DY,
  SALVAGE_RAMP_LENGTH,
  SALVAGE_RAMP_OPEN_ANGLE,
  salvageMarcherAt,
  salvageShipAt,
  type SalvageDeliveryFxEntry
} from "./client-salvage-delivery-fx.js";

// True-3D Imperial delivery for a load of salvage shipped to the Court
// (timeline: client-salvage-delivery-fx.ts; 2D companion:
// client-map-2d-salvage-delivery.ts). An ivory-and-gold dropship, built from
// a few primitives, fires down out of orbit on a downward retro-burn, settles
// over the Reclamation Works in a ring of dust, runs its ramp out to the
// ground, and the Ancillaries -- in the House's colour -- file down it and
// march away across the House's land, shrinking and fading as they disappear
// into the territory. The ramp draws in and the ship climbs back to orbit.

type Marcher = { readonly group: Group; readonly materials: readonly MeshStandardMaterial[] };

type Entry = {
  readonly group: Group;
  readonly ship: Group;
  readonly ramp: Mesh;
  readonly rampPivot: Group;
  readonly burnCone: Mesh;
  readonly burnGlow: Sprite;
  readonly holdGlow: Sprite;
  readonly shadow: Mesh;
  readonly dust: readonly Sprite[];
  readonly marchers: readonly Marcher[];
  readonly marcherSurfaceDeltas: readonly number[];
  readonly entry: SalvageDeliveryFxEntry;
  /** Opaque-when-solid ship materials, faded together. */
  readonly shipMaterials: readonly (MeshStandardMaterial | MeshBasicMaterial)[];
  readonly ownedMaterials: readonly Material[];
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
const DUST_PUFFS = 10;
/** Ancillaries are drawn larger than life so the column reads at map zoom. */
const MARCHER_SIZE = 1.6;
const HULL_COLOR = "#ece5d2";
const GOLD = "#c9a64a";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const createSalvageDeliveryFxLayer = (scene: Object3D): SalvageDeliveryFxLayer => {
  const group = new Group();
  group.name = "salvage-delivery-fx";
  scene.add(group);

  const glowTexture = makeGlowTexture();
  const hullGeometry = new BoxGeometry(0.34, 0.16, 0.8);
  const wingGeometry = new BoxGeometry(1.0, 0.04, 0.3);
  const spineGeometry = new BoxGeometry(0.08, 0.03, 0.72);
  const cockpitGeometry = new SphereGeometry(0.1, 12, 8);
  const podGeometry = new CylinderGeometry(0.07, 0.08, 0.1, 12);
  const burnGeometry = new CylinderGeometry(0.2, 0.02, 1, 16, 1, true);
  const rampGeometry = new BoxGeometry(0.24, 0.02, 1);
  const shadowGeometry = new CircleGeometry(0.5, 24);
  const bodyGeometry = new CylinderGeometry(0.028, 0.034, 0.09, 8);
  const headGeometry = new SphereGeometry(0.026, 8, 6);
  const sharedGeometries = [hullGeometry, wingGeometry, spineGeometry, cockpitGeometry, podGeometry, burnGeometry, rampGeometry, shadowGeometry, bodyGeometry, headGeometry];
  const entries: Entry[] = [];

  const glowSprite = (color: string, blending: Blending = AdditiveBlending): Sprite =>
    new Sprite(new SpriteMaterial({ toneMapped: false, map: glowTexture, color, transparent: true, opacity: 0, blending, depthWrite: false }));

  const disposeEntry = (entry: Entry): void => {
    group.remove(entry.group);
    for (const material of entry.ownedMaterials) material.dispose();
  };

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, delivery: SalvageDeliveryFxEntry, startedAt: number, marcherSurfaceY: readonly number[]): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY, sceneZ);
    const owned: Material[] = [];
    const own = <M extends Material>(m: M): M => { owned.push(m); return m; };

    const hullMat = own(new MeshStandardMaterial({ color: HULL_COLOR, roughness: 0.45, metalness: 0.35, transparent: true }));
    const goldMat = own(new MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8, transparent: true }));
    const glassMat = own(new MeshStandardMaterial({ color: "#24364a", roughness: 0.15, metalness: 0.6, transparent: true }));
    const rampMat = own(new MeshStandardMaterial({ color: "#a9a08a", roughness: 0.7, metalness: 0.3, transparent: true }));

    const ship = new Group();
    const hull = new Mesh(hullGeometry, hullMat); hull.position.y = 0.08;
    const wings = new Mesh(wingGeometry, hullMat); wings.position.set(0, 0.07, -0.08);
    const spine = new Mesh(spineGeometry, goldMat); spine.position.set(0, 0.175, -0.02);
    const cockpit = new Mesh(cockpitGeometry, glassMat); cockpit.position.set(0, 0.15, 0.24); cockpit.scale.set(0.8, 0.6, 1.2);
    const podL = new Mesh(podGeometry, goldMat); podL.position.set(-0.36, 0.03, -0.1);
    const podR = new Mesh(podGeometry, goldMat); podR.position.set(0.36, 0.03, -0.1);
    const burnCone = new Mesh(burnGeometry, own(new MeshBasicMaterial({ toneMapped: false, color: "#ffa64d", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })));
    const burnGlow = glowSprite("#ffc27a"); owned.push(burnGlow.material);
    const holdGlow = glowSprite("#ffe2a0"); owned.push(holdGlow.material);
    holdGlow.position.set(0, 0.06, SALVAGE_RAMP_HINGE_DY); holdGlow.scale.set(0.5, 0.5, 0.5);
    // The ramp runs out of the nose at its open slope (telescoping, so it never swings through the ground).
    const rampPivot = new Group();
    rampPivot.position.set(0, 0.0, SALVAGE_RAMP_HINGE_DY);
    rampPivot.rotation.x = SALVAGE_RAMP_OPEN_ANGLE;
    const ramp = new Mesh(rampGeometry, rampMat);
    rampPivot.add(ramp);
    ship.add(hull, wings, spine, cockpit, podL, podR, burnCone, burnGlow, holdGlow, rampPivot);

    const shadow = new Mesh(shadowGeometry, own(new MeshBasicMaterial({ toneMapped: false, color: "#000000", transparent: true, opacity: 0, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    const dust: Sprite[] = [];
    for (let i = 0; i < DUST_PUFFS; i += 1) {
      const puff = glowSprite("#c9b28f", NormalBlending); owned.push(puff.material);
      dust.push(puff);
    }
    entryGroup.add(ship, shadow, ...dust);

    const marchers: Marcher[] = delivery.marchers.map(() => {
      const body = own(new MeshStandardMaterial({ color: delivery.color, roughness: 0.6, metalness: 0.2, transparent: true }));
      const helm = own(new MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8, transparent: true }));
      const marcher = new Group();
      const torso = new Mesh(bodyGeometry, body); torso.position.y = 0.045;
      const head = new Mesh(headGeometry, helm); head.position.y = 0.115;
      marcher.add(torso, head);
      marcher.visible = false;
      entryGroup.add(marcher);
      return { group: marcher, materials: [body, helm] };
    });

    group.add(entryGroup);
    entries.push({
      group: entryGroup, ship, ramp, rampPivot, burnCone, burnGlow, holdGlow, shadow, dust, marchers,
      marcherSurfaceDeltas: delivery.marchers.map((_, i) => (marcherSurfaceY[i] ?? surfaceY) - surfaceY),
      entry: delivery, shipMaterials: [hullMat, goldMat, glassMat, rampMat], ownedMaterials: owned, startedAt
    });
    while (entries.length > MAX_ACTIVE) disposeEntry(entries.shift()!);
  };

  const updateEntry = (e: Entry, age: number): void => {
    const ship = salvageShipAt(age);
    e.ship.visible = ship.visible;
    e.ship.position.y = ship.height;
    for (const material of e.shipMaterials) material.opacity = ship.alpha;
    const flicker = 0.9 + 0.1 * Math.sin(age / 37);
    const burnLength = (0.2 + 1.4 * ship.burn) * flicker;
    e.burnCone.scale.set(1, burnLength, 1);
    e.burnCone.position.y = -burnLength / 2;
    (e.burnCone.material as MeshBasicMaterial).opacity = 0.75 * ship.burn * ship.alpha;
    e.burnGlow.position.y = -0.08;
    e.burnGlow.scale.setScalar(0.5 + 0.9 * ship.burn);
    e.burnGlow.material.opacity = 0.9 * ship.burn * ship.alpha;
    e.ramp.visible = ship.rampOpen > 0.02;
    e.ramp.scale.z = SALVAGE_RAMP_LENGTH * Math.max(0.02, ship.rampOpen);
    e.ramp.position.z = e.ramp.scale.z / 2;
    e.holdGlow.material.opacity = 0.7 * ship.rampOpen;
    const near = clamp01(1 - ship.height / 5);
    e.shadow.scale.setScalar(0.6 + 0.6 * near);
    (e.shadow.material as MeshBasicMaterial).opacity = ship.visible ? ship.alpha * (0.1 + 0.3 * near) : 0;
    e.dust.forEach((puff, i) => {
      const a = (i / e.dust.length) * Math.PI * 2;
      const r = 0.35 + 0.45 * ship.dust;
      puff.position.set(Math.cos(a) * r, 0.08 + 0.1 * ship.dust, Math.sin(a) * r);
      puff.scale.setScalar(0.35 + 0.35 * ship.dust);
      puff.material.opacity = 0.45 * ship.dust;
    });
    e.marchers.forEach((marcher, i) => {
      const target = e.entry.marchers[i]!;
      const m = salvageMarcherAt(target, i, age);
      marcher.group.visible = m.visible && m.alpha > 0.01;
      if (!marcher.group.visible) return;
      marcher.group.position.set(m.dx, m.lift + (e.marcherSurfaceDeltas[i] ?? 0) * m.groundProgress, m.dy);
      marcher.group.scale.setScalar(MARCHER_SIZE * m.scale);
      for (const material of marcher.materials) material.opacity = m.alpha;
    });
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
    clear();
    for (const geometry of sharedGeometries) geometry.dispose();
    glowTexture?.dispose();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
