// Regression tests for the Titanium Synthesis (TIT) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family is genuinely TALL rather than accidentally
// horizontal, that its widest part still fits the shared bay, that the module's
// published height is the crucible's mouth and not the pod, and that the slit
// really is white-hot rather than merely bright orange.
//
// The verticality and white-hot checks are the two that matter most, and both
// were confirmed to fail when their behaviour is deliberately broken — see the
// notes on those cases below.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createTitaniumSynthesisModuleOverlay, TITANIUM_SYNTHESIS_BASE_RADIUS, TITANIUM_SYNTHESIS_MODULE_HEIGHT, TITANIUM_SYNTHESIS_SCALE } from "./client-map-3d-titanium-synthesis-module.js";
import { podTopAt, TIT_BAND, TIT_CAP, TIT_CRUCIBLE, TIT_CRUCIBLE_OUTER_WIDTH, TIT_CRUCIBLE_VISIBLE_HEIGHT, TIT_INJECTOR, TIT_POD, TIT_POD_CROWN, TIT_SLIT } from "./client-map-3d-titanium-synthesis-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { baseMesh, bandWrapsVertical, params, yAxisColumn, bounds, crucibleMesh, crucibleMouthHeight, crucibleStandsVertical, envelope, feedPipeMesh, glowIsWhiteHot, injectorBandMesh, injectorMesh, instancedMeshes, podMesh, slitFrameMesh, slitGlowMesh, translation, valveKnobMesh, crucibleBandMesh, capRingMesh } from "./client-map-3d-titanium-synthesis-inspect.js";

const build = (instances = 1) => {
  const scene = new Scene();
  const overlay = createTitaniumSynthesisModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("titanium synthesis module construction", () => {
  it("builds every part of the silhouette: pod, crucible, hoops, cap, slit, injectors, valves, feed pipes", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(crucibleMesh(scene)).toBeDefined();
    expect(crucibleBandMesh(scene)).toBeDefined();
    expect(capRingMesh(scene)).toBeDefined();
    expect(slitFrameMesh(scene)).toBeDefined();
    expect(slitGlowMesh(scene)).toBeDefined();
    expect(injectorMesh(scene)).toBeDefined();
    expect(injectorBandMesh(scene)).toBeDefined();
    expect(valveKnobMesh(scene)).toBeDefined();
    expect(feedPipeMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
  });

  it("wraps the crucible in exactly three broad brass hoops", () => {
    const { scene } = build();
    const bands = crucibleBandMesh(scene)!;
    expect(bands.count).toBe(3);
  });

  it("places one cap ring, and it is the tallest thing on the module", () => {
    const { scene } = build();
    const cap = capRingMesh(scene)!;
    expect(cap.count).toBe(1);
    const capTop = bounds(cap).maxY;
    const env = envelope(scene);
    expect(capTop).toBeGreaterThan(bounds(crucibleMesh(scene)!).maxY);
    expect(capTop).toBeLessThanOrEqual(env.maxY + 1e-9);
  });

  it("stands the crucible UP rather than lying it across the pod", () => {
    const { scene } = build();
    expect(crucibleStandsVertical(crucibleMesh(scene)!)).toBe(true);
    // The vessel must also be taller than it is wide, or "vertical" is only a
    // rotation rather than a proportion.
    expect(TIT_CRUCIBLE.height).toBeGreaterThan(TIT_CRUCIBLE.radius * 2);
  });

  it("is TALLER than it is wide above the pod — a tower, not a drum with bands", () => {
    // This is the assertion that makes the family read as a vertical crucible.
    // The pod's crown is 0.146 of a 0.2556 height budget, so a fat vessel leaves
    // the visible section shorter than its own hoops are wide — which reads as a
    // squat drum no matter how many bands are wrapped round it. An earlier
    // draft of this module was exactly that, and no amount of banding fixed it:
    // the visible height has to clear the broadest hoop.
    expect(TIT_CRUCIBLE_VISIBLE_HEIGHT).toBeGreaterThan(TIT_CRUCIBLE_OUTER_WIDTH);
    // And in rendered terms, with a margin: a hair above is not a read.
    expect(TIT_CRUCIBLE_VISIBLE_HEIGHT / TIT_CRUCIBLE_OUTER_WIDTH).toBeGreaterThan(1.05);
  });

  it("wraps every band AROUND the vertical vessel, not down onto it", () => {
    const { scene } = build();
    const bands = crucibleBandMesh(scene)!;
    for (let i = 0; i < bands.count; i += 1) {
      expect(bandWrapsVertical(bands, i)).toBe(true);
    }
    expect(bandWrapsVertical(capRingMesh(scene)!)).toBe(true);
  });

  it("spreads the three hoops up the vessel's height", () => {
    const { scene } = build();
    const bands = crucibleBandMesh(scene)!;
    const ys = [0, 1, 2].map((i) => translation(bands, i).y).sort((a, b) => a - b);
    // Evenly spaced and each genuinely separated, so the vessel reads as
    // banded rather than ringed.
    expect(ys[1]! - ys[0]!).toBeGreaterThan(0.02 * TITANIUM_SYNTHESIS_SCALE);
    expect(ys[2]! - ys[1]!).toBeGreaterThan(0.02 * TITANIUM_SYNTHESIS_SCALE);
    expect(ys[0]!).toBeCloseTo(TIT_BAND.y0 * TITANIUM_SYNTHESIS_SCALE, 6);
    expect(ys[2]!).toBeCloseTo(TIT_BAND.y2 * TITANIUM_SYNTHESIS_SCALE, 6);
  });

  it("points both injectors inward and slightly upward, into the vessel's base", () => {
    const { scene } = build();
    const injector = injectorMesh(scene)!;
    expect(injector.count).toBe(2);
    const sides = [0, 1].map((i) => Math.sign(translation(injector, i).z)).sort();
    expect(sides).toEqual([-1, 1]);
    // Each injector's inner end climbs: the two instances sit at the same height
    // but their noses point at the crucible, so their axes tilt toward the centre
    // and upward rather than lying flat.
    for (let i = 0; i < injector.count; i += 1) {
      const axis = yAxisColumn(injector, i);
      expect(axis.y).toBeGreaterThan(0);
      expect(Math.abs(axis.x)).toBeLessThan(1e-6);
    }
  });

  it("sinks the crucible's belly into the pod instead of balancing it on the crown", () => {
    // The vessel's belly is below the pod's crown, so it is cast into the pod.
    const crucibleBottom = TIT_CRUCIBLE.y - TIT_CRUCIBLE.height * 0.5;
    expect(crucibleBottom).toBeLessThan(TIT_POD_CROWN);
    // …and its visible crown still clears the pod, so the module has a base to
    // stand on rather than being one solid lump.
    const crucibleTop = TIT_CRUCIBLE.y + TIT_CRUCIBLE.height * 0.5;
    expect(crucibleTop).toBeGreaterThan(TIT_POD_CROWN + 0.04);
  });

  it("publishes its height as the crucible's mouth, above the cap ring", () => {
    const { scene } = build();
    const mouth = crucibleMouthHeight(crucibleMesh(scene)!);
    const published = TITANIUM_SYNTHESIS_MODULE_HEIGHT;
    // The published height must cover the cap ring that closes the mouth, or
    // callers that reserve the published height will clip the top of the family.
    expect(published).toBeGreaterThan(mouth);
    expect(published).toBeGreaterThan(bounds(capRingMesh(scene)!).maxY);
    expect(published).toBeCloseTo((TIT_CAP.y + TIT_CAP.tube) * TITANIUM_SYNTHESIS_SCALE, 6);
  });

  it("stays inside the module height cap", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    expect(env.maxY).toBeGreaterThan(0.28);
  });

  it("stands the slit proud of the crucible in a layered bezel, and shows white-hot inside", () => {
    const { scene } = build();
    const frame = slitFrameMesh(scene)!;
    const glow = slitGlowMesh(scene)!;
    const frameX = translation(frame, 0).x;
    const glowX = translation(glow, 0).x;
    // The hot bar stands slightly proud of its own dark bezel, and the bezel
    // stands proud of the vessel: three distinct depths, not one flat plate.
    expect(glowX).toBeGreaterThan(frameX);
    expect(frameX).toBeGreaterThan(TIT_CRUCIBLE.radius * 0.85);
    expect(glowIsWhiteHot(glow)).toBe(true);
    // Narrow, as specified: a viewing slit, not a window.
    expect(TIT_SLIT.glowWidth).toBeLessThan(TIT_SLIT.frameWidth);
  });

  it("lands the feed pipes on the pod's curved shoulder, not in mid air or sunk into it", () => {
    const { scene } = build();
    const pipe = feedPipeMesh(scene)!;
    expect(pipe.count).toBe(2);
    // A feed pipe is a unit rod stretched onto a tilt, so it has real length:
    // a pipe collapsed to nothing would still be present in the scene graph and
    // would still look like a pipe in a part-list test.
    const b = bounds(pipe);
    expect(b.maxY - b.minY).toBeGreaterThan(0.01);
    // The pod's surface function must agree with the pod's actual crown at the
    // centre, or every foot placement is wrong by that much.
    expect(podTopAt(0)).toBeCloseTo(TIT_POD_CROWN, 6);
    // A foot out on the shoulder is lower than the crown: a capsule is curved,
    // and a flat guessed height would be wrong everywhere but the middle.
    expect(podTopAt(TIT_INJECTOR.z)).toBeLessThan(podTopAt(0));
  });

  it("keeps the widest elevated part inside the AFC bay", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The injectors are what set this family's width, and this is the one that
    // came within a hundredth of the limit while the vessel was being sized.
    const injector = injectorMesh(scene)!;
    expect(bounds(injector).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(injector).maxRadius).toBeGreaterThan(0.1);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    // The seat flares outward toward the pad, as it does on every family, so it
    // is measured at the flare.
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * TITANIUM_SYNTHESIS_SCALE, 6);
    expect(TITANIUM_SYNTHESIS_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });

  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("spaces instances apart on the socket ring, and yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // Asserting the pod's DISTANCE from the world origin proves nothing about a
    // folded origin: a rotation preserves that distance, so both a correct
    // composition and yaw·(origin + local) pass it. What distinguishes them is
    // a laterally offset part. The two injectors sit at local z = ±0.063, so
    // they are exactly symmetric about the module's own centre line — and their
    // midpoint must therefore land on the socket itself. Fold the origin and
    // that midpoint lands on the SOCKET'S ROTATION instead, which is a
    // different point whenever yaw ≠ 0.
    const yawed = new Scene();
    const overlay = createTitaniumSynthesisModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedInjectors = injectorMesh(yawed)!;
    const left = translation(yawedInjectors, 0);
    const right = translation(yawedInjectors, 1);
    expect((left.x + right.x) * 0.5).toBeCloseTo(3, 6);
    expect((left.z + right.z) * 0.5).toBeCloseTo(-2, 6);
  });
});

describe("titanium synthesis module lifecycle", () => {
  it("clears every slot", () => {
    const { scene, overlay } = build(2);
    // clear() drops the pending counts; commit() is what publishes them to the
    // meshes, so a clear is only visible to the renderer once committed.
    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) expect(mesh.count).toBe(0);
  });

  it("caps its instance count", () => {
    const { overlay } = build(1);
    expect(overlay.addInstance(9, 9, 0, 0, 0, 0)).toBe(-1);
  });

  it("renders statically: update does not move anything", () => {
    const { scene, overlay } = build(2);
    const before = instancedMeshes(scene).map((m) => m.instanceMatrix.array.slice());
    overlay.update(0);
    overlay.update(5000);
    overlay.commit();
    const after = instancedMeshes(scene).map((m) => m.instanceMatrix.array.slice());
    expect(after).toEqual(before);
  });

  it("removes and frees everything it owns on dispose", () => {
    const { scene, overlay } = build(1);
    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    overlay.dispose();
    expect(instancedMeshes(scene).length).toBe(0);
  });
});

describe("titanium synthesis docking", () => {
  it("docks on the real AFC socket ring without swinging off its socket", () => {
    // The real attachment, from the real AFC, rather than a hand-written
    // position: this is the check that catches an origin folded into the yaw.
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createTitaniumSynthesisModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The crucible stands on the socket, and the pod's own origin is the socket
    // point — not the world origin pulled through the yaw.
    const pod = podMesh(scene)!;
    const podOrigin = translation(pod, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    expect(podOrigin.y).toBeCloseTo(attachment.y + TIT_POD.y * TITANIUM_SYNTHESIS_SCALE, 5);
    // And it is still vertical after the dock yaw is applied.
    expect(crucibleStandsVertical(crucibleMesh(scene)!)).toBe(true);
    // The same symmetric-pair check as above, on the real socket: the injector
    // pair must straddle the socket it was handed, not the socket swung round
    // the world origin by the dock yaw.
    const injectors = injectorMesh(scene)!;
    const a = translation(injectors, 0);
    const b = translation(injectors, 1);
    expect((a.x + b.x) * 0.5).toBeCloseTo(attachment.x, 5);
    expect((a.z + b.z) * 0.5).toBeCloseTo(attachment.z, 5);
  });
});
