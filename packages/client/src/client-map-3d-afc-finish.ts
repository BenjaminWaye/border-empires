import { BufferGeometry, CylinderGeometry, TorusGeometry } from "three";
import { afcBeveledBox, afcTurnedCasing, colorAfcGeometry } from "./client-map-3d-afc-machining.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { afcLegAzimuth, appendAfcLegGeometry, type AfcFinishParts } from "./client-map-3d-afc-legs.js";

export const AFC_BAY_FOUNDATION_RADIUS = 0.218;
export const AFC_FINISHES = ["armour", "trim", "inset", "light"] as const;
export type AfcFinish = (typeof AFC_FINISHES)[number];
type FinishGeometry = Partial<Record<AfcFinish, BufferGeometry>>;

const finishParts = (): AfcFinishParts => ({ armour: [], trim: [], inset: [], light: [] });

export const createAfcFinishGeometry = (animated: boolean, socketCount: number, socketRadius: number): {
  body: FinishGeometry;
  bay?: FinishGeometry;
  upper?: FinishGeometry;
  shin?: FinishGeometry;
  toe?: FinishGeometry;
} => {
  const body = finishParts();
  const { armour, trim, inset, light } = body;
  const ring = (parts: BufferGeometry[], radius: number, tube: number, y: number): void => {
    parts.push(new TorusGeometry(radius, tube, 6, 48).rotateX(Math.PI / 2).translate(0, y, 0));
  };
  const block = (parts: BufferGeometry[], w: number, h: number, d: number, r: number, y: number, a: number): void => {
    parts.push(afcBeveledBox(w, h, d).translate(r, y, 0).rotateY(-a));
  };
  // Turned flanges and recessed seals articulate the reactor's load-bearing shell.
  armour.push(afcTurnedCasing(0.49, 0.55, 0.055).translate(0, 0.09, 0));
  for (const [r, y] of [[0.39, 0.225], [0.325, 0.69], [0.305, 0.82], [0.263, 0.926], [0.205, 1.036]] as const) {
    ring(trim, r, 0.012, y);
  }
  ring(trim, 0.525, 0.012, 0.06);
  ring(inset, 0.35, 0.018, 0.25);
  ring(inset, 0.33, 0.018, 0.665);
  ring(light, 0.293, 0.008, 0.265);
  ring(light, 0.293, 0.008, 0.655);
  for (const tilt of [-0.6, 0.6]) {
    inset.push(new TorusGeometry(0.185, 0.012, 6, 40).rotateX(Math.PI / 2 + tilt).translate(0, 0.46, 0));
    trim.push(new TorusGeometry(0.153, 0.006, 5, 40).rotateX(Math.PI / 2 - tilt).translate(0, 0.46, 0));
  }
  // Eight narrow mullions leave the glass and contained core visible.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    block(armour, 0.035, 0.405, 0.035, 0.304, 0.46, a);
    block(trim, 0.042, 0.035, 0.055, 0.315, 0.29, a);
    block(trim, 0.042, 0.035, 0.055, 0.315, 0.635, a);
    // Recessed cooling channels on the lower plinth and upper machinery.
    block(inset, 0.012, 0.06, 0.04, 0.39, 0.166, a);
    for (let j = 0; j < 3; j++) block(trim, 0.012, 0.009, 0.05, 0.305, 0.73 + j * 0.025, a);
    block(light, 0.014, 0.027, 0.045, 0.398, 0.176, a);
  }
  // Thin cooling vanes break up the blank upper drum, grouped into quadrants.
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    block(armour, 0.035, 0.067, 0.012, 0.273, 0.87, a);
    block(inset, 0.009, 0.046, 0.018, 0.297, 0.868, a);
  }
  // Cooling crown: repeated dark slots, brass fasteners and a turned cap seal.
  ring(trim, 0.16, 0.012, 1.05);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    block(inset, 0.015, 0.06, 0.024, 0.245, 0.865, a);
    trim.push(new CylinderGeometry(0.012, 0.012, 0.012, 6).translate(Math.cos(a) * 0.46, 0.125, Math.sin(a) * 0.46));
  }
  const bay = finishParts();
  bay.armour.push(afcTurnedCasing(0.205, AFC_BAY_FOUNDATION_RADIUS, 0.025).translate(0, 0.014, 0));
  bay.trim.push(new TorusGeometry(0.205, 0.009, 5, 24).rotateX(Math.PI / 2).translate(0, 0.029, 0));
  for (let j = 0; j < 4; j++) {
    bay.armour.push(afcBeveledBox(0.035, 0.045, 0.065).translate(0.183, 0.12, 0).rotateY(-j * Math.PI / 2));
  }
  block(bay.armour, 0.06, 0.075, 0.10, 0.18, 0.07, 0);
  block(bay.light, 0.015, 0.018, 0.055, 0.203, 0.09, 0);
  block(bay.trim, 0.045, 0.025, 0.19, -0.45, 0.064, 0);

  const upper = finishParts();
  const shin = finishParts();
  const toe = finishParts();
  appendAfcLegGeometry(upper, shin, toe);

  const merge = (parts: AfcFinishParts): FinishGeometry => {
    const result: FinishGeometry = {};
    for (const finish of AFC_FINISHES) {
      const geometries = parts[finish];
      if (geometries.length === 0) continue;
      if (finish === "armour") {
        for (const part of geometries) {
          if (!part.hasAttribute("color")) colorAfcGeometry(part, "#424b55");
        }
      }
      const geometry = mergeGeometries(geometries, false);
      for (const part of geometries) part.dispose();
      if (!geometry) throw new Error("Unable to merge AFC machining details");
      result[finish] = geometry;
    }
    return result;
  };
  if (animated) return { body: merge(body), bay: merge(bay), upper: merge(upper), shin: merge(shin), toe: merge(toe) };

  // Keep deployed AFC details in four instanced batches regardless of how
  // many complexes are visible. Only the landing model needs separate parts.
  const bake = (parts: AfcFinishParts, count: number, angleAt: (index: number) => number, radius: number): void => {
    for (const finish of AFC_FINISHES) {
      for (const part of parts[finish]) {
        for (let i = 0; i < count; i++) {
          const geometry = i === count - 1 ? part : part.clone();
          body[finish].push(geometry.translate(radius, 0, 0).rotateY(-angleAt(i)));
        }
      }
    }
  };
  bake(bay, socketCount, (i) => i * Math.PI / 4, socketRadius);
  for (const segment of [upper, shin, toe]) bake(segment, 4, afcLegAzimuth, 0);
  return { body: merge(body) };
};
