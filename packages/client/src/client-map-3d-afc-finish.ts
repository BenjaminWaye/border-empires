import { BufferGeometry, CylinderGeometry, TorusGeometry } from "three";
import { afcBeveledBox, afcTurnedCasing, colorAfcGeometry } from "./client-map-3d-afc-machining.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { appendAfcLegGeometry } from "./client-map-3d-afc-legs.js";

/** Static machining detail, merged by finish: four extra draws regardless of
 * AFC count. No lights, per-frame allocations or docking changes. */
export const createAfcFinishGeometry = (): Readonly<Record<"armour" | "trim" | "inset" | "light", BufferGeometry>> => {
  const armour: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const inset: BufferGeometry[] = [];
  const light: BufferGeometry[] = [];
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
    // Bay foundations taper out below the original pad; interiors stay clear.
    const x = Math.cos(a) * 1.28;
    const z = Math.sin(a) * 1.28;
    armour.push(afcTurnedCasing(0.205, 0.235, 0.025).translate(x, 0.014, z));
    trim.push(new TorusGeometry(0.205, 0.009, 5, 24).rotateX(Math.PI / 2).translate(x, 0.029, z));
    for (let j = 0; j < 4; j++) {
      const lockAngle = a + j * Math.PI / 2;
      const lock = afcBeveledBox(0.035, 0.045, 0.065).translate(0.183, 0.12, 0).rotateY(-lockAngle).translate(x, 0, z);
      armour.push(lock);
    }
    // Exterior service latch, status lens and conduit clamp.
    block(armour, 0.06, 0.075, 0.10, 1.475, 0.07, a);
    block(light, 0.015, 0.018, 0.055, 1.51, 0.09, a);
    block(trim, 0.045, 0.025, 0.19, 0.83, 0.064, a);
  }
  appendAfcLegGeometry({ armour, trim, inset, light });
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
  // Vertex colours let the cooler leg armour share the iron batch.
  for (const part of armour) {
    if (!part.hasAttribute("color")) colorAfcGeometry(part, "#424b55");
  }
  const merge = (parts: BufferGeometry[]): BufferGeometry => {
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error("Unable to merge AFC machining details");
    return geometry;
  };
  return { armour: merge(armour), trim: merge(trim), inset: merge(inset), light: merge(light) };
};
