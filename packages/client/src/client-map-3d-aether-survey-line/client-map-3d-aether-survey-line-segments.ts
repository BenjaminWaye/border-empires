// Connecting-line pool for the Aether Survey Line (the reach border), split
// out of client-map-3d-aether-survey-line.ts. Each slot is a thin cylinder
// oriented between two pylon points, tinted per owner. The viewer's OWN
// border gets a thicker owner-coloured sheath plus a white-hot inner core and
// a slow breathing pulse; rival borders get a thinner, dimmer line with no
// core or pulse -- so "my border" is the one bright animated line on screen
// (see client-reach-border-emphasis.ts for the tuning values).

import { AdditiveBlending, CylinderGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import { createPoolDropCounter } from "../client-map-3d-pool-drop-counter/client-map-3d-pool-drop-counter.js";
import { lerpPoint, type Vec3Like } from "../client-map-3d-quad-fill/client-map-3d-quad-fill.js";
import { OWN_REACH_CORE_COLOR, OWN_REACH_CORE_RADIUS_SCALE, ownReachPulse, reachEmphasisStyle, type ReachBorderEmphasis } from "../client-reach-border-emphasis/client-reach-border-emphasis.js";

const AETHER_LINE = "#9fe6ff";
// Deliberately much thinner than the pylon post so it still reads as
// "hair-thin" per the brief, but large enough for its per-owner glow color to
// actually be visible at normal camera distance instead of anti-aliasing away
// to a pale gray thread.
const LINE_RADIUS = 0.026;
const LINE_BASE_OPACITY = 0.8;
const CORE_BASE_OPACITY = 0.9;

type LineSlot = {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly core: Mesh;
  readonly coreMaterial: MeshBasicMaterial;
};

export type SurveyLineSegmentPool = {
  readonly clear: () => void;
  readonly add: (p0: Vec3Like, p1: Vec3Like, ownerColor: string, laserFraction: number, emphasis: ReachBorderEmphasis, nowMs: number) => void;
  readonly commit: () => void;
  /** Re-applies the own-border breathing pulse to already-placed slots; call every frame. */
  readonly update: (nowMs: number) => void;
  readonly droppedCount: () => number;
  readonly dispose: () => void;
};

export const createSurveyLineSegmentPool = (group: Group, maxSegments: number): SurveyLineSegmentPool => {
  const lineMaterial = new MeshBasicMaterial({ toneMapped: false, color: AETHER_LINE, transparent: true, opacity: LINE_BASE_OPACITY, blending: AdditiveBlending, depthWrite: false });
  const coreMaterialBase = new MeshBasicMaterial({ toneMapped: false, color: OWN_REACH_CORE_COLOR, transparent: true, opacity: CORE_BASE_OPACITY, blending: AdditiveBlending, depthWrite: false });
  const lineGeometry = new CylinderGeometry(LINE_RADIUS, LINE_RADIUS, 1, 5);
  const coreGeometry = new CylinderGeometry(LINE_RADIUS * OWN_REACH_CORE_RADIUS_SCALE, LINE_RADIUS * OWN_REACH_CORE_RADIUS_SCALE, 1, 5);
  // Per-slot material clones so each line can be tinted per owner (pool slots are reused across owners frame to frame).
  const slots: LineSlot[] = Array.from({ length: maxSegments }, () => {
    const material = lineMaterial.clone();
    const mesh = new Mesh(lineGeometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    group.add(mesh);
    const coreMaterial = coreMaterialBase.clone();
    const core = new Mesh(coreGeometry, coreMaterial);
    core.visible = false;
    core.frustumCulled = false;
    core.renderOrder = 12;
    group.add(core);
    return { mesh, material, core, coreMaterial };
  });
  // Parallel to slots: what update() needs to re-derive this frame's opacity without clobbering a transition's laserFraction.
  const slotLaser: number[] = new Array(maxSegments).fill(1);
  const slotIsOwn: boolean[] = new Array(maxSegments).fill(false);
  let cursor = 0;
  const drops = createPoolDropCounter();

  const orient = (mesh: Mesh, p0: Vec3Like, p1: Vec3Like, length: number, radiusScale: number): void => {
    const mid = lerpPoint(p0, p1, 0.5);
    mesh.position.set(mid.x, mid.y, mid.z);
    // Orient the cylinder's local +Y axis along the chord direction.
    mesh.up.set(0, 0, 1);
    mesh.lookAt(p1.x, p1.y, p1.z);
    mesh.rotateX(Math.PI / 2);
    mesh.scale.set(radiusScale, length, radiusScale);
  };

  const applyOpacity = (slot: LineSlot, index: number, nowMs: number): void => {
    const laser = slotLaser[index]!;
    const own = slotIsOwn[index]!;
    const style = reachEmphasisStyle(own ? "own" : "rival");
    const pulse = own ? ownReachPulse(nowMs) : 1;
    slot.material.opacity = LINE_BASE_OPACITY * style.opacityMult * pulse * laser;
    slot.coreMaterial.opacity = CORE_BASE_OPACITY * pulse * laser;
  };

  const add: SurveyLineSegmentPool["add"] = (p0, p1, ownerColor, laserFraction, emphasis, nowMs) => {
    if (cursor >= slots.length) { drops.recordDrop(); return; }
    const slot = slots[cursor]!;
    const style = reachEmphasisStyle(emphasis);
    const length = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z) || 0.0001;
    orient(slot.mesh, p0, p1, length, style.lineRadiusScale);
    slot.material.color.set(normalizeColorForThree(ownerColor));
    slotLaser[cursor] = laserFraction;
    slotIsOwn[cursor] = emphasis === "own";
    applyOpacity(slot, cursor, nowMs);
    const lit = laserFraction > 0.001;
    slot.mesh.visible = lit;
    slot.core.visible = lit && emphasis === "own";
    if (slot.core.visible) orient(slot.core, p0, p1, length, style.lineRadiusScale);
    cursor += 1;
  };

  const update = (nowMs: number): void => {
    for (let i = 0; i < cursor; i += 1) if (slotIsOwn[i]) applyOpacity(slots[i]!, i, nowMs);
  };

  const commit = (): void => {
    for (let i = cursor; i < slots.length; i += 1) {
      slots[i]!.mesh.visible = false;
      slots[i]!.core.visible = false;
    }
  };

  const dispose = (): void => {
    lineGeometry.dispose();
    coreGeometry.dispose();
    lineMaterial.dispose();
    coreMaterialBase.dispose();
    for (const slot of slots) {
      slot.material.dispose();
      slot.coreMaterial.dispose();
    }
  };

  return {
    clear: () => { cursor = 0; drops.reset(); },
    add,
    commit,
    update,
    droppedCount: () => drops.count(),
    dispose
  };
};
