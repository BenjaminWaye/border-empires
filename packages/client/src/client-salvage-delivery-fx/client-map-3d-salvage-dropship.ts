import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import {
  SALVAGE_RAMP_HINGE_DY,
  SALVAGE_RAMP_LENGTH,
  SALVAGE_RAMP_OPEN_ANGLE,
  SALVAGE_SHIP_HOVER_HEIGHT,
  salvageNavLight,
  type SalvageShipFrame
} from "./client-salvage-delivery-fx.js";

// The Court's Imperial dropship, built in code for the salvage delivery
// (client-map-3d-salvage-delivery-fx.ts). Ship-local space: belly at y=0,
// nose (and the ramp) toward +Z, one tile ~ one unit. A bevelled, swept
// ivory hull with a stepped upper deck and a smoked-glass canopy; gold
// leading edges, spine and canted tail fins; twin rear main engines and four
// downward lift thrusters, each with a layered plume and glow; three landing
// legs that telescope down for the touchdown; port/starboard/strobe
// navigation lights; and a telescoping ramp lit from the hold. PBR metal
// throughout, reflecting the shared building environment map.

type Point = readonly [number, number];

/** Top-view outline (x east, z toward the nose), right half; mirrored for the left. */
const HULL_RIGHT: readonly Point[] = [
  [0, 0.56], [0.08, 0.46], [0.15, 0.24], [0.2, 0.1], [0.6, -0.16], [0.6, -0.24],
  [0.48, -0.27], [0.22, -0.22], [0.2, -0.46], [0.09, -0.56], [0, -0.56]
];
const DECK_RIGHT: readonly Point[] = [[0, 0.44], [0.09, 0.32], [0.12, 0.05], [0.12, -0.36], [0.07, -0.52], [0, -0.52]];

/** ExtrudeGeometry of a mirrored outline, laid flat (extruded upward) with bevelled edges. */
const extrudedOutline = (right: readonly Point[], depth: number, bevel: number): BufferGeometry => {
  const shape = new Shape();
  const ring = [...right, ...[...right].reverse().map(([x, z]) => [-x, z] as Point)];
  // Shape y is ship -z once the geometry is laid flat (rotateX(-PI/2) maps shape y to -z).
  ring.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
};

export type Thruster = { readonly plume: Mesh; readonly core: Mesh; readonly glow: Sprite };

export type SalvageDropship = {
  readonly group: Group;
  readonly update: (frame: SalvageShipFrame, ageMs: number) => void;
  readonly dispose: () => void;
};

const HULL = "#ebe5d6";
const GOLD = "#caa547";
const DARK = "#2a2f37";

export const createSalvageDropship = (glowTexture: Texture | null, envMap?: Texture): SalvageDropship => {
  const group = new Group();
  group.name = "salvage-dropship";
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <G extends BufferGeometry>(g: G): G => { geometries.push(g); return g; };
  const solid = (color: string, metalness: number, roughness: number, glowing?: { emissive: string; emissiveIntensity: number }): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({ color, metalness, roughness, transparent: true, ...glowing });
    applyBuildingEnvMap(material, envMap);
    materials.push(material);
    return material;
  };
  const additive = (color: string, map?: Texture | null): MeshBasicMaterial => {
    const material = new MeshBasicMaterial({ toneMapped: false, color, ...(map ? { map } : {}), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    materials.push(material);
    return material;
  };
  const glow = (color: string, scale: number): Sprite => {
    const material = new SpriteMaterial({ toneMapped: false, map: glowTexture, color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    materials.push(material);
    const sprite = new Sprite(material);
    sprite.scale.setScalar(scale);
    return sprite;
  };
  const add = (mesh: Mesh, x: number, y: number, z: number): Mesh => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };

  const hullMat = solid(HULL, 0.55, 0.32);
  const goldMat = solid(GOLD, 0.95, 0.22);
  const darkMat = solid(DARK, 0.75, 0.45);
  const glassMat = solid("#0d1824", 1, 0.06, { emissive: "#1d4f73", emissiveIntensity: 0.55 });
  const engineMat = solid("#fff1cf", 0, 1, { emissive: "#ffcf86", emissiveIntensity: 2 });

  // Hull, upper deck, canopy.
  add(new Mesh(geo(extrudedOutline(HULL_RIGHT, 0.07, 0.035)), hullMat), 0, 0.035, 0);
  add(new Mesh(geo(extrudedOutline(DECK_RIGHT, 0.06, 0.03)), hullMat), 0, 0.14, 0);
  add(new Mesh(geo(extrudedOutline(DECK_RIGHT.map(([x, z]) => [x * 0.55, z * 0.8] as Point), 0.004, 0.006)), goldMat), 0, 0.235, -0.02);
  const canopy = add(new Mesh(geo(new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), glassMat), 0, 0.2, 0.24);
  canopy.scale.set(0.075, 0.06, 0.15);
  // Dark intakes along the deck sides, and the belly keel.
  for (const side of [-1, 1]) {
    add(new Mesh(geo(new BoxGeometry(0.035, 0.05, 0.22)), darkMat), side * 0.13, 0.17, -0.12);
  }
  add(new Mesh(geo(new BoxGeometry(0.16, 0.03, 0.62)), darkMat), 0, 0.005, -0.04);

  // Gold leading edges along each wing.
  for (const side of [-1, 1]) {
    const [x0, z0] = [0.2, 0.1];
    const [x1, z1] = [0.6, -0.16];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const edge = add(new Mesh(geo(new BoxGeometry(0.03, 0.03, length)), goldMat), side * (x0 + x1) / 2, 0.085, (z0 + z1) / 2);
    edge.rotation.y = side * Math.atan2(x1 - x0, z1 - z0);
    // Canted tail fins.
    const fin = add(new Mesh(geo(new BoxGeometry(0.018, 0.17, 0.2)), hullMat), side * 0.15, 0.25, -0.42);
    fin.rotation.z = -side * 0.38;
    const finTip = add(new Mesh(geo(new BoxGeometry(0.022, 0.03, 0.12)), goldMat), side * 0.185, 0.33, -0.45);
    finTip.rotation.z = -side * 0.38;
  }

  // Twin rear main engines with glowing nozzles.
  const rearGlows: Sprite[] = [];
  for (const side of [-1, 1]) {
    const nacelle = add(new Mesh(geo(new CylinderGeometry(0.06, 0.07, 0.24, 18)), darkMat), side * 0.1, 0.12, -0.46);
    nacelle.rotation.x = Math.PI / 2;
    const ring = add(new Mesh(geo(new TorusGeometry(0.058, 0.012, 8, 24)), goldMat), side * 0.1, 0.12, -0.58);
    ring.rotation.y = Math.PI;
    const nozzle = add(new Mesh(geo(new CylinderGeometry(0.048, 0.048, 0.01, 18)), engineMat), side * 0.1, 0.12, -0.585);
    nozzle.rotation.x = Math.PI / 2;
    const g = glow("#ffd9a0", 0.32);
    g.position.set(side * 0.1, 0.12, -0.62);
    group.add(g);
    rearGlows.push(g);
  }

  // Four downward lift thrusters: wing pods and a forward pair under the nose.
  const plumeGeometry = geo(new CylinderGeometry(0.075, 0.012, 1, 16, 1, true));
  const coreGeometry = geo(new CylinderGeometry(0.032, 0.004, 1, 12, 1, true));
  const thrusters: Thruster[] = [];
  for (const [x, z, r] of [[-0.4, -0.13, 1], [0.4, -0.13, 1], [-0.08, 0.26, 0.7], [0.08, 0.26, 0.7]] as const) {
    add(new Mesh(geo(new CylinderGeometry(0.075 * r, 0.085 * r, 0.07, 18)), darkMat), x, 0, z);
    const ring = add(new Mesh(geo(new TorusGeometry(0.07 * r, 0.01, 8, 24)), goldMat), x, -0.035, z);
    ring.rotation.x = Math.PI / 2;
    const plume = add(new Mesh(plumeGeometry, additive("#ffab55")), x, 0, z);
    plume.scale.set(r, 1, r);
    const core = add(new Mesh(coreGeometry, additive("#fff4dc")), x, 0, z);
    core.scale.set(r, 1, r);
    const g = glow("#ffc27a", 0.4 * r);
    g.position.set(x, -0.06, z);
    group.add(g);
    thrusters.push({ plume, core, glow: g });
  }

  // Landing legs: telescoping struts with foot pads.
  const legs: Group[] = [];
  const strutGeometry = geo(new CylinderGeometry(0.014, 0.018, 1, 8));
  const padGeometry = geo(new CylinderGeometry(0.045, 0.05, 0.015, 14));
  for (const [x, z] of [[0, 0.16], [-0.2, -0.3], [0.2, -0.3]] as const) {
    const leg = new Group();
    leg.position.set(x, 0, z);
    const strut = new Mesh(strutGeometry, darkMat);
    const pad = new Mesh(padGeometry, goldMat);
    leg.add(strut, pad);
    leg.userData = { strut, pad };
    group.add(leg);
    legs.push(leg);
  }

  // Navigation lights: port red, starboard green, white strobe on the spine.
  const lightGeometry = geo(new SphereGeometry(0.016, 8, 6));
  const navLights = ([[-0.6, 0.06, -0.2, "#ff3b30"], [0.6, 0.06, -0.2, "#3bff6a"], [0, 0.25, -0.3, "#ffffff"]] as const).map(([x, y, z, color]) => {
    const bulb = add(new Mesh(lightGeometry, additive(color)), x, y, z);
    const halo = glow(color, 0.22);
    halo.position.set(x, y, z);
    group.add(halo);
    return { bulb, halo };
  });

  // Ramp: telescopes out of the nose at its open slope; the hold lights it from inside.
  const rampPivot = new Group();
  rampPivot.position.set(0, 0, SALVAGE_RAMP_HINGE_DY);
  rampPivot.rotation.x = SALVAGE_RAMP_OPEN_ANGLE;
  const ramp = new Mesh(geo(new BoxGeometry(0.22, 0.018, 1)), solid("#9d9686", 0.6, 0.5));
  const rampStripe = new Mesh(geo(new BoxGeometry(0.03, 0.02, 1)), engineMat);
  rampPivot.add(ramp, rampStripe);
  group.add(rampPivot);
  const holdGlow = glow("#ffe2a0", 0.6);
  holdGlow.position.set(0, 0.06, SALVAGE_RAMP_HINGE_DY - 0.02);
  group.add(holdGlow);

  const fadeable = materials.filter((m): m is MeshStandardMaterial => m instanceof MeshStandardMaterial);

  const update = (frame: SalvageShipFrame, ageMs: number): void => {
    group.visible = frame.visible;
    if (!frame.visible) return;
    for (const m of fadeable) m.opacity = frame.alpha;
    const flicker = 0.88 + 0.12 * Math.sin(ageMs / 29) * Math.sin(ageMs / 47);
    // Lift thrusters: long hard plumes on the dive, a soft idle while unloading.
    const plumeLength = (0.12 + 0.9 * frame.burn) * flicker;
    for (const t of thrusters) {
      const r = t.plume.scale.x;
      t.plume.scale.set(r, plumeLength, r);
      t.plume.position.y = -0.035 - plumeLength / 2;
      t.core.scale.set(r, plumeLength * 0.6, r);
      t.core.position.y = -0.035 - plumeLength * 0.3;
      (t.plume.material as MeshBasicMaterial).opacity = 0.6 * frame.burn * frame.alpha;
      (t.core.material as MeshBasicMaterial).opacity = 0.9 * frame.burn * frame.alpha;
      t.glow.material.opacity = 0.85 * frame.burn * frame.alpha;
    }
    for (const g of rearGlows) g.material.opacity = (0.35 + 0.5 * frame.burn) * frame.alpha * flicker;
    for (const leg of legs) {
      const { strut, pad } = leg.userData as { strut: Mesh; pad: Mesh };
      const length = Math.max(0.02, SALVAGE_SHIP_HOVER_HEIGHT * frame.legs);
      strut.scale.y = length;
      strut.position.y = -length / 2;
      pad.position.y = -length;
      leg.visible = frame.legs > 0.01;
    }
    navLights.forEach(({ bulb, halo }, i) => {
      const on = salvageNavLight(ageMs, i) * frame.alpha;
      (bulb.material as MeshBasicMaterial).opacity = on;
      halo.material.opacity = on * 0.9;
    });
    ramp.visible = rampStripe.visible = frame.rampOpen > 0.02;
    const rampLength = SALVAGE_RAMP_LENGTH * Math.max(0.02, frame.rampOpen);
    for (const part of [ramp, rampStripe]) {
      part.scale.z = rampLength;
      part.position.z = rampLength / 2;
    }
    rampStripe.position.y = 0.002;
    holdGlow.material.opacity = 0.8 * frame.rampOpen * frame.alpha;
  };

  const dispose = (): void => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return { group, update, dispose };
};
