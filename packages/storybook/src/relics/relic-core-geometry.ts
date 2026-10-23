import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  ExtrudeGeometry, Float32BufferAttribute, Shape, TubeGeometry, Vector3
} from "three";
import { createRelicServiceStairs, RELIC_DOOR_HEIGHT } from "./relic-service-stairs.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type RelicCoreGeometry = {
  readonly shell: BufferGeometry;
  readonly armour: BufferGeometry;
  readonly machinery: BufferGeometry;
  readonly salvage: BufferGeometry;
  readonly recess: BufferGeometry;
  readonly light: BufferGeometry;
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry =>
  new BoxGeometry(w, h, d).translate(x, y, z);

const noise = (x: number, y: number, z: number): number => {
  const value = Math.sin(x * 71.3 + y * 39.7 + z * 113.1) * 43758.5453;
  return value - Math.floor(value);
};

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  const triangles = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part.clone();
    geometry.deleteAttribute("uv");
    return geometry;
  });
  const result = mergeGeometries(triangles, false);
  for (const geometry of [...parts, ...triangles]) geometry.dispose();
  if (!result) throw new Error("Relic ziggurat geometry could not be merged");
  const position = result.getAttribute("position");
  const shades = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i += 1) {
    const wear = noise(position.getX(i), position.getY(i), position.getZ(i));
    color.setRGB(0.65 + wear * 0.35, 0.68 + wear * 0.30, 0.61 + wear * 0.32);
    color.toArray(shades, i * 3);
  }
  result.setAttribute("color", new Float32BufferAttribute(shades, 3));
  return result;
};

/** Battered terraces, with missing corner sections rather than perfect edges. */
const terrace = (width: number, height: number, bottom: number, bite: number): BufferGeometry => {
  const h = width / 2;
  const shape = new Shape();
  shape.moveTo(-h + 0.04, -h);
  shape.lineTo(h - bite, -h);
  shape.lineTo(h - bite, -h + bite * 0.55);
  shape.lineTo(h, -h + bite);
  shape.lineTo(h, h - 0.05);
  shape.lineTo(h - 0.05, h);
  shape.lineTo(-h + 0.04, h);
  shape.lineTo(-h, h - 0.04);
  shape.lineTo(-h, -h + 0.04);
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: true, bevelThickness: 0.013, bevelSize: 0.014,
    bevelSegments: 1, steps: 1, curveSegments: 1
  }).rotateX(-Math.PI / 2).translate(0, bottom, 0);
};

/** One ancient surface interface. The functioning installation remains buried. */
export const createRelicCoreGeometry = (): RelicCoreGeometry => {
  const shell: BufferGeometry[] = [];
  const armour: BufferGeometry[] = [];
  const machinery: BufferGeometry[] = [];
  const salvage: BufferGeometry[] = [];
  const recess: BufferGeometry[] = [];
  const light: BufferGeometry[] = [];
  const levels = [
    { width: 1.96, bottom: 0.025, height: 0.19, bite: 0.19 },
    { width: 1.56, bottom: 0.215, height: 0.19, bite: 0.11 },
    { width: 1.16, bottom: 0.405, height: 0.19, bite: 0.16 },
    { width: 0.76, bottom: 0.595, height: 0.17, bite: 0.09 }
  ];
  for (const [index, level] of levels.entries()) {
    shell.push(terrace(level.width, level.height, level.bottom, level.bite));
    armour.push(terrace(level.width + 0.035, 0.035, level.bottom + level.height - 0.018, level.bite));
    const edge = level.width / 2 + 0.006;
    for (let side = 0; side < 4; side += 1) {
      const angle = side * Math.PI / 2;
      const count = index < 2 ? 3 : 2;
      const panelWidth = (level.width - 0.13) / count;
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * panelWidth;
        const y = level.bottom + level.height * 0.47;
        // One missing skin on each face reveals the ribs of the old machine.
        if ((side + index) % 3 === 0 && i === 0) {
          recess.push(box(panelWidth - 0.04, 0.12, 0.012, offset, y, edge + 0.008).rotateY(angle));
          for (let rib = 0; rib < 4; rib += 1) {
            machinery.push(box(0.018, 0.105, 0.021, offset + (rib - 1.5) * 0.055, y, edge + 0.02).rotateY(angle));
          }
          salvage.push(box(panelWidth - 0.08, 0.015, 0.027, offset, y - 0.06, edge + 0.025).rotateY(angle));
          continue;
        }
        armour.push(box(panelWidth - 0.035, 0.115, 0.028, offset, y, edge + 0.012).rotateY(angle));
        // Long inset slots and catches communicate manufactured cladding.
        recess.push(box(panelWidth * 0.57, 0.012, 0.01, offset, y + 0.024, edge + 0.032).rotateY(angle));
        machinery.push(box(0.025, 0.032, 0.012, offset + panelWidth * 0.32, y - 0.016, edge + 0.035).rotateY(angle));
      }
      // Faded connection strips run along the terrace, interrupted by damage.
      machinery.push(box(level.width * 0.60, 0.018, 0.024, -0.03, level.bottom + level.height - 0.041, edge + 0.012).rotateY(angle));
    }
  }
  const stairs = createRelicServiceStairs();
  armour.push(...stairs.treads);
  machinery.push(...stairs.metal);
  shell.push(terrace(0.43, 0.21, 0.77, 0.055));
  armour.push(terrace(0.49, 0.045, 0.97, 0.09));
  recess.push(box(0.155, 0.15, 0.012, 0, 0.85, 0.224));
  machinery.push(box(0.19, 0.025, 0.035, 0, 0.934, 0.235));
  // Sealed summit bulkhead with a mechanical frame, not an open temple doorway.
  machinery.push(box(0.025, 0.17, 0.024, -0.099, 0.851, 0.236));
  machinery.push(box(0.025, 0.17, 0.024, 0.099, 0.851, 0.236));
  armour.push(box(0.065, RELIC_DOOR_HEIGHT, 0.012, -0.037, 0.85, 0.238));
  armour.push(box(0.065, RELIC_DOOR_HEIGHT, 0.012, 0.037, 0.85, 0.238));
  salvage.push(box(0.016, 0.055, 0.01, -0.105, 0.85, 0.251));
  salvage.push(box(0.016, 0.055, 0.01, 0.105, 0.85, 0.251));
  // Roof maintenance hardware stays low so the stepped mass remains dominant.
  machinery.push(box(0.19, 0.012, 0.13, -0.08, 1.014, -0.03));
  for (let vent = 0; vent < 5; vent += 1) {
    recess.push(box(0.11, 0.008, 0.009, -0.08, 1.022, -0.075 + vent * 0.023));
  }
  salvage.push(new CylinderGeometry(0.038, 0.043, 0.055, 6).translate(0.11, 1.035, 0.05));
  // A detached roof skin exposes a dark service compartment on the right terrace.
  recess.push(box(0.13, 0.013, 0.19, 0.30, 0.784, -0.03));
  for (let cell = 0; cell < 3; cell += 1) {
    machinery.push(box(0.07, 0.025, 0.028, 0.30, 0.796, -0.09 + cell * 0.055));
  }
  armour.push(box(0.12, 0.012, 0.17, 0, 0, 0).rotateZ(0.27).translate(0.38, 0.80, -0.03));
  light.push(box(0.012, 0.10, 0.013, -0.078, 0.845, 0.247));
  light.push(box(0.012, 0.10, 0.013, 0.078, 0.845, 0.247));
  // Broken conduit covers and detached composite skins lie around the base.
  for (const [x, z, width, angle] of [
    [-0.85, 1.13, 0.43, 0.06], [0.88, 1.10, 0.34, -0.16],
    [-1.12, -0.48, 0.37, 1.7], [1.12, 0.52, 0.31, 1.4]
  ] as const) {
    shell.push(box(width, 0.09, 0.13, 0, 0.055, 0).rotateY(angle).translate(x, 0, z));
  }
  for (let i = 0; i < 17; i += 1) {
    const angle = i * 2.39996;
    const radius = 1.02 + noise(i, 0, 1) * 0.26;
    const size = 0.04 + noise(i, 1, 2) * 0.07;
    armour.push(box(size * 1.5, size * 0.6, size, 0, size * 0.3, 0)
      .rotateY(angle).translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  for (const side of [-1, 1]) {
    const cable = new CatmullRomCurve3([
      new Vector3(side * 0.76, 0.34, 0.68), new Vector3(side * 0.94, 0.25, 0.77),
      new Vector3(side * 1.06, 0.07, 0.88), new Vector3(side * 1.18, 0.045, 0.83)
    ]);
    machinery.push(new TubeGeometry(cable, 10, 0.012, 5, false));
    salvage.push(box(0.06, 0.045, 0.035, side * 1.18, 0.045, 0.83));
  }
  // Exposed utility connection, long since severed from its external network.
  recess.push(box(0.20, 0.10, 0.012, 0.56, 0.11, 1.005));
  for (let socket = 0; socket < 3; socket += 1) {
    salvage.push(new CylinderGeometry(0.022, 0.026, 0.05, 8)
      .rotateX(Math.PI / 2).translate(0.49 + socket * 0.065, 0.11, 1.035));
  }
  light.push(box(0.07, 0.009, 0.008, 0.53, 0.49, 0.588));
  light.push(box(0.008, 0.009, 0.08, -0.789, 0.30, -0.31));
  return {
    shell: merge(shell), armour: merge(armour), machinery: merge(machinery),
    salvage: merge(salvage), recess: merge(recess), light: merge(light)
  };
};
