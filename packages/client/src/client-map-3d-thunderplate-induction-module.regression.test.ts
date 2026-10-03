// Regression tests for the Thunderplate Induction (TPL) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is ONE induction rig — a heavy horizontal
// armor blank clamped in the grip of a huge coil of three BROAD copper loops
// standing on edge around the plate's short dimension (not thin wire), that two
// chunky electrode arms rise at the plate's long ends and reach in to a narrow
// contact gap with a bright cyan-white arc jumping each one (electrically
// energized armor, the mirror image of the physically stamping Master-Die), that
// a compact transformer block feeds the rig from behind and under the plate, and
// that the whole assembly stays inside the shared bay.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  THUNDERPLATE_INDUCTION_BASE_RADIUS,
  THUNDERPLATE_INDUCTION_MODULE_HEIGHT,
  THUNDERPLATE_INDUCTION_SCALE as S,
  createThunderplateInductionModuleOverlay
} from "./client-map-3d-thunderplate-induction-module.js";
import {
  TPL_ARC,
  TPL_CAPACITOR,
  TPL_ELECTRODE_COLUMN,
  TPL_PLATE,
  TPL_PLATE_BLANK,
  TPL_POD_CROWN,
  TPL_RING_STATIONS_X,
  TPL_TOWER_TOP
} from "./client-map-3d-thunderplate-induction-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  arcMesh,
  baseMesh,
  bounds,
  capacitorCapMesh,
  capacitorFinMesh,
  capacitorMesh,
  columnCollarMesh,
  columnMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  envelope,
  headMesh,
  instancedMeshes,
  materialOf,
  params,
  plateMesh,
  blankMesh,
  podMesh,
  ringMesh,
  translation,
  zAxisColumn
} from "./client-map-3d-thunderplate-induction-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createThunderplateInductionModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createThunderplateInductionModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("thunderplate induction module construction", () => {
  it("builds every part of the silhouette: seat, pod, plate, blank, coil, electrodes, arcs, transformer, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(plateMesh(scene)).toBeDefined();
    expect(blankMesh(scene)).toBeDefined();
    expect(ringMesh(scene)).toBeDefined();
    expect(columnMesh(scene)).toBeDefined();
    expect(columnCollarMesh(scene)).toBeDefined();
    expect(headMesh(scene)).toBeDefined();
    expect(arcMesh(scene)).toBeDefined();
    expect(capacitorMesh(scene)).toBeDefined();
    expect(capacitorCapMesh(scene)).toBeDefined();
    expect(capacitorFinMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("holds the heavy armor blank horizontal above the pod crown", () => {
    // MAIN_READ: the blank is THE armor piece mid-production — a thick slab hung
    // level, centered, clear of the pod by a real margin, and broad enough in
    // plan to dwarf the coil that wraps it.
    const { scene } = build();
    expect(plateMesh(scene)!.count).toBe(1);
    const t = translation(plateMesh(scene)!, 0);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.z).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(TPL_PLATE.y * S, 6);
    const plateTop = t.y + (TPL_PLATE.h * S) / 2;
    const plateMin = t.y - (TPL_PLATE.h * S) / 2;
    expect(plateMin).toBeGreaterThan(TPL_POD_CROWN * S + 0.03);
    expect(plateTop).toBeLessThan(0.34);
    // A thick slab: its height is far smaller than its plan footprint.
    expect(TPL_PLATE.h).toBeLessThan(TPL_PLATE.d);
    expect(TPL_PLATE.d).toBeLessThan(TPL_PLATE.w);
  });

  it("shows a paler un-energized inset in the blank's top", () => {
    const { scene } = build();
    expect(blankMesh(scene)!.count).toBe(1);
    const blankT = translation(blankMesh(scene)!, 0);
    expect(blankT.x).toBeCloseTo(0, 6);
    expect(blankT.z).toBeCloseTo(0, 6);
    // The inset sits on the blank's upper face, slightly proud of the plate.
    const plateTop = translation(plateMesh(scene)!, 0).y + (TPL_PLATE.h * S) / 2;
    expect(Math.abs(blankT.y - (TPL_PLATE_BLANK.y * S))).toBeCloseTo(0, 6);
    expect(Math.abs((blankT.y - (TPL_PLATE_BLANK.h * S) / 2) - plateTop)).toBeLessThan(0.005);
    // And it is paler than the armor around it — the not-yet-charged region.
    const blankMat = materialOf(blankMesh(scene)!);
    expect(blankMat.color.g).toBeGreaterThan(materialOf(plateMesh(scene)!).color.g);
  });

  it("wraps a broad induction coil around the plate's short dimension", () => {
    // MAIN_READ: three BROAD copper loops stand on edge around the blank, their
    // holes along X sweeping the plate's short dimension like a solenoid wound
    // around its length — thick rings, not wire.
    const rings = ringMesh(build().scene)!;
    expect(rings.count).toBe(TPL_RING_STATIONS_X.length);
    const stations = [0, 1, 2].map((i) => translation(rings, i).x).sort((a, b) => a - b);
    for (let i = 0; i < stations.length; i += 1) {
      expect(stations[i]!).toBeCloseTo(TPL_RING_STATIONS_X[i]! * S, 6);
      expect(translation(rings, i).y).toBeCloseTo(TPL_PLATE.y * S, 6);
      expect(translation(rings, i).z).toBeCloseTo(0, 6);
      const holeAxis = zAxisColumn(rings, i);
      expect(Math.abs(holeAxis.x)).toBeGreaterThan(Math.abs(holeAxis.y));
      expect(Math.abs(holeAxis.x)).toBeGreaterThan(Math.abs(holeAxis.z));
    }
    // The coil is broad: rings far thicker than wire, enclosing the plate's
    // depth and rising clear above the blank.
    expect(TPL_RING_STATIONS_X.length).toBeGreaterThan(1);
    expect(bounds(rings).maxY).toBeGreaterThan(translation(plateMesh(build().scene)!, 0).y + (TPL_PLATE.h * S) / 2);
  });

  it("hugs the blank tight inside the coil", () => {
    const { scene } = build();
    for (let i = 0; i < ringMesh(scene)!.count; i += 1) {
      const ringT = translation(ringMesh(scene)!, i);
      const throat = (0.045 - 0.0065) * S;
      const plateHalfDepth = (TPL_PLATE.d * S) / 2;
      // The ring's inner edge is a millimetre off the plate's face — a clamped,
      // almost-touching coil, never a loose free-standing coil.
      expect(throat - plateHalfDepth).toBeGreaterThan(0);
      expect(throat - plateHalfDepth).toBeLessThan(0.002);
      // The ring clears the plate at its equator (the face the ring hugs) and
      // rises past the plate's top and bottom elsewhere — a full wrap.
      expect(ringT.y).toBeCloseTo(TPL_PLATE.y * S, 6);
    }
    const ringMax = bounds(ringMesh(scene)!).maxY;
    const plateMax = translation(plateMesh(scene)!, 0).y + (TPL_PLATE.h * S) / 2;
    expect(ringMax).toBeGreaterThan(plateMax);
  });

  it("rises two chunky electrode columns at the plate's long ends", () => {
    const { scene } = build();
    const columns = columnMesh(scene)!;
    expect(columns.count).toBe(2);
    const xs = [0, 1].map((i) => translation(columns, i).x).sort((a, b) => a - b);
    expect(xs[0]!).toBeCloseTo(-TPL_ELECTRODE_COLUMN.x * S, 6);
    expect(xs[1]!).toBeCloseTo(TPL_ELECTRODE_COLUMN.x * S, 6);
    for (const i of [0, 1]) {
      const t = translation(columns, i);
      expect(Math.abs(t.z)).toBeLessThan(0.001);
      expect(t.y).toBeCloseTo(TPL_ELECTRODE_COLUMN.yC * S, 6);
    }
    // The columns tower over the coil and the blank: the terminals are the
    // module's tallest point.
    expect(bounds(columns).maxY).toBeGreaterThan(bounds(ringMesh(scene)!).maxY);
    // Each column carries a brass collar at its base, wider than the column.
    const collars = columnCollarMesh(scene)!;
    expect(collars.count).toBe(2);
    expect(materialOf(collars).metalness).toBeGreaterThan(0.7);
  });

  it("reaches each electrode head to a contact pad just off the plate's end face", () => {
    const { scene } = build();
    const heads = headMesh(scene)!;
    expect(heads.count).toBe(2);
    const plateEnd = (TPL_PLATE.w * S) / 2;
    for (const i of [0, 1]) {
      const t = translation(heads, i);
      const headInner = Math.abs(t.x) - (0.016 * S) / 2;
      // The pad is a few millimetres OFF the metal — a deliberate air gap,
      // not an electrical short.
      const gap = headInner - plateEnd;
      expect(gap).toBeGreaterThan(0.004 * S);
      expect(gap).toBeLessThan(0.008 * S);
      // At the plate's mid height, straddling its long axis.
      expect(Math.abs(t.y - TPL_PLATE.y * S)).toBeLessThan(0.005);
    }
  });

  it("jumps each contact gap with bright cyan-white arcs", () => {
    const { scene } = build();
    const arcs = arcMesh(scene)!;
    expect(arcs.count).toBe(4);
    const plateEnd = (TPL_PLATE.w * S) / 2;
    const headInner = 0.06 * S - (0.016 * S) / 2;
    for (let i = 0; i < arcs.count; i += 1) {
      const t = translation(arcs, i);
      // Each arc node sits BETWEEN the head's inner face and the plate's end —
      // over the air gap it is jumping, one node per side.
      expect(Math.abs(t.x)).toBeGreaterThan(plateEnd);
      expect(Math.abs(t.x)).toBeLessThan(headInner);
    }
    const arcMat = materialOf(arcs);
    expect(arcMat.emissiveIntensity).toBeLessThanOrEqual(1);
    // Cyan-WHITE: the arc glows brighter than the cyan AFC tip, leaning white.
    expect(arcMat.emissive.b).toBeGreaterThan(arcMat.emissive.g);
    expect(arcMat.emissive.g).toBeGreaterThan(arcMat.emissive.r);
  });

  it("rides one compact transformer block behind and under the assembly", () => {
    const { scene } = build();
    const capT = translation(capacitorMesh(scene)!, 0);
    // Behind the plate's centre line, clear of the coil.
    expect(capT.x).toBeLessThan(-0.03 * S);
    // Under the plate (the block feeds the rig from below, not through it).
    const capTop = capT.y + (0.03 * S) / 2;
    const plateBottom = translation(plateMesh(scene)!, 0).y - (TPL_PLATE.h * S) / 2;
    expect(capTop).toBeLessThan(plateBottom - 0.004);
    // Brass-capped and copper-finned.
    const cap = capacitorCapMesh(scene)!;
    expect(cap.count).toBe(1);
    expect(materialOf(cap).metalness).toBeGreaterThan(0.7);
    const fins = capacitorFinMesh(scene)!;
    expect(fins.count).toBe(2);
    expect(materialOf(fins)).toBe(materialOf(ringMesh(scene)!));
  });

  it("keeps the transformer clear of the rear electrode column", () => {
    const { scene } = build();
    const capRear = translation(capacitorMesh(scene)!, 0).x - (0.024 * S) / 2;
    const colInner = -TPL_ELECTRODE_COLUMN.x * S + (0.02 * S) / 2;
    expect(capRear).toBeGreaterThan(colInner + 0.005);
  });

  it("uses armor-grade titanium for the blank and aged copper for the coils, brass for trim", () => {
    const { scene } = build();
    // The armor blank is the light titanium-grey armor steel (linear-space g
    // well above the dark iron/steel frame), distinct from the drive machine.
    const plateMat = materialOf(plateMesh(scene)!);
    expect(plateMat.color.g).toBeGreaterThan(0.25);
    // The coil is aged copper — warm and reddish, not the brass of the trim.
    const copper = materialOf(ringMesh(scene)!);
    expect(copper.color.r).toBeGreaterThan(copper.color.g);
    expect(copper.metalness).toBeGreaterThan(0.7);
    // The brass trim is shared by the collars and the capacitor's cap.
    expect(materialOf(columnCollarMesh(scene)!)).toBe(materialOf(capacitorCapMesh(scene)!));
    expect(materialOf(columnCollarMesh(scene)!).metalness).toBeGreaterThan(0.7);
  });
});

describe("thunderplate induction module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
    expect(bounds(baseMesh(scene)!).minY).toBeCloseTo(0, 4);
  });

  it("stays inside the module height cap, its tallest point the electrode terminals", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The induction rig reads as a tall energizer over a low pod: it clears the
    // 0.3 floor and the electrode columns tower clear of the coil top.
    expect(env.maxY).toBeGreaterThan(0.3);
    expect(env.maxY).toBeGreaterThan(TPL_POD_CROWN * S + 0.1);
    expect(env.maxY).toBeCloseTo(TPL_TOWER_TOP * S, 4);
  });

  it("publishes its height as the top of the electrode terminals", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = THUNDERPLATE_INDUCTION_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo(TPL_TOWER_TOP * S, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the electrode columns", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    const columns = columnMesh(scene)!;
    expect(bounds(columns).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(columns).maxRadius).toBeGreaterThan(0.1);
    expect(bounds(columns).maxRadius).toBeGreaterThan(bounds(ringMesh(scene)!).maxRadius);
    expect(bounds(columns).maxRadius).toBeGreaterThan(bounds(plateMesh(scene)!).maxRadius);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * S, 6);
    expect(THUNDERPLATE_INDUCTION_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("thunderplate induction module palette", () => {
  it("keeps the electric glow cyan and restrained to the arcs plus the AFC tip", () => {
    // The induction glow budget is strict: only the four arc nodes and the cyan
    // AFC contact tip emit — no glowing coils, no hot plate. (Default
    // emissiveIntensity is 1 with a BLACK emissive, so the presence of a lit
    // material is decided by the emissive colour, not the intensity.)
    const { scene } = build();
    const lit: { isCyan: boolean }[] = [];
    for (const mesh of instancedMeshes(scene)) {
      const m = materialOf(mesh);
      if (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0) lit.push({ isCyan: m.emissive.b > m.emissive.r });
    }
    expect(lit.length).toBe(2);
    expect(lit.every((entry) => entry.isCyan)).toBe(true);
    for (const mesh of instancedMeshes(scene)) expect(materialOf(mesh).emissiveIntensity).toBeLessThan(1.1);
  });
});

describe("thunderplate induction module lifecycle", () => {
  it("clears every slot", () => {
    const { scene, overlay } = build(2);
    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) expect(mesh.count).toBe(0);
  });

  it("caps its instance count", () => {
    const { overlay } = build(1);
    expect(overlay.addInstance(9, 9, 0, 0, 0, 0)).toBe(-1);
  });

  it("removes and frees everything it owns on dispose", () => {
    const { scene, overlay } = build(1);
    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    overlay.dispose();
    expect(instancedMeshes(scene).length).toBe(0);
  });

  it("renders once and holds still — update is a no-op", () => {
    // A static family: the induction rig energizes armor from its silhouette —
    // a huge coil clamping a plate with live arcs jumping energized contacts —
    // and nothing pulses on the clock. Any drift over a long render window is a
    // bug.
    const { scene, overlay } = build(2);
    const before = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    overlay.update(4000);
    const after = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    expect(after).toEqual(before);
  });
});

describe("thunderplate induction module docking", () => {
  it("spaces instances apart on the socket ring, yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The pod's origin is the module's dock point: yaw it hard and the pod must
    // stay exactly on the socket, not swing around the world origin.
    const yawed = new Scene();
    const overlay = createThunderplateInductionModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedPod = translation(podMesh(yawed)!, 0);
    expect(yawedPod.x).toBeCloseTo(3, 6);
    expect(yawedPod.z).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createThunderplateInductionModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const podOrigin = translation(podMesh(scene)!, 0);
    const podDist = Math.hypot(podOrigin.x, podOrigin.z);
    expect(podDist).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The module runs outward down the socket: the front electrode column rides
    // further from the AFC core than the pod, the rear one closer, and the rear
    // coupling hangs closest of all.
    const columnRadii = [0, 1].map((i) => Math.hypot(translation(columnMesh(scene)!, i).x, translation(columnMesh(scene)!, i).z));
    expect(Math.max(...columnRadii)).toBeGreaterThan(podDist + 0.03);
    expect(Math.min(...columnRadii)).toBeLessThan(podDist - 0.03);
    const couplingOrigin = translation(couplingMesh(scene)!, 0);
    expect(Math.hypot(couplingOrigin.x, couplingOrigin.z)).toBeLessThan(podDist - 0.05);
  });
});