import { BufferGeometry, CylinderGeometry, Matrix4, TorusGeometry, Vector3 } from "three";
import { afcBeveledBox, afcFacetedPlate } from "./client-map-3d-afc-machining.js";

export const AFC_ARM_JOINTS = {
  shoulder: { radius: 0.33, height: 0.78 },
  elbow: { radius: 0.64, height: 0.88 },
  wrist: { radius: 1.14, height: 0.18 }
} as const;

type LegFinishes = {
  readonly armour: BufferGeometry[];
  readonly trim: BufferGeometry[];
  readonly inset: BufferGeometry[];
  readonly light: BufferGeometry[];
};

/** Four articulated stabilizers with overlapping armour, an offset actuator,
 * inset power channels and illuminated knee encoders. All parts are static
 * and join the existing four finish batches; docking and stance stay fixed. */
export const appendAfcLegGeometry = ({ armour, trim, inset, light }: LegFinishes): void => {
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 8 + i * Math.PI / 2;
    const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const joint = (point: { readonly radius: number; readonly height: number }): Vector3 =>
      new Vector3(Math.cos(angle) * point.radius, point.height, Math.sin(angle) * point.radius);
    const shoulder = joint(AFC_ARM_JOINTS.shoulder);
    const elbow = joint(AFC_ARM_JOINTS.elbow);
    const wrist = joint(AFC_ARM_JOINTS.wrist);
    const foot = joint({ radius: 1.28, height: 0.055 });
    const frame = (from: Vector3, to: Vector3): Matrix4 => {
      const along = to.clone().sub(from).normalize();
      // Consistent outward-facing panels on every leg, independent of azimuth.
      const normal = tangent.clone().cross(along).normalize();
      return new Matrix4().makeBasis(tangent, along, normal).setPosition(from.clone().add(to).multiplyScalar(0.5));
    };
    const upperFrame = frame(shoulder, elbow);
    const shinFrame = frame(elbow, wrist);
    const toeFrame = frame(wrist, foot);
    const upperLength = shoulder.distanceTo(elbow);
    const shinLength = elbow.distanceTo(wrist);
    const place = (parts: BufferGeometry[], geometry: BufferGeometry, transform: Matrix4, x = 0, y = 0, z = 0): void => {
      parts.push(geometry.translate(x, y, z).applyMatrix4(transform));
    };

    // A continuous spine carries the load behind staggered, faceted plates.
    place(armour, afcBeveledBox(0.061, upperLength * 0.9, 0.06), upperFrame);
    place(armour, afcFacetedPlate(0.108, upperLength * 0.53, 0.024), upperFrame, 0, -upperLength * 0.18, 0.043);
    place(armour, afcFacetedPlate(0.092, upperLength * 0.37, 0.024), upperFrame, 0, upperLength * 0.23, 0.039);
    place(inset, afcBeveledBox(0.052, 0.018, 0.007), upperFrame, 0, upperLength * 0.04, 0.056);
    for (let j = 0; j < 3; j++) {
      place(trim, afcBeveledBox(0.032 - j * 0.006, 0.006, 0.004), upperFrame, 0, -0.075 + j * 0.017, 0.057);
    }

    place(armour, afcBeveledBox(0.058, shinLength * 0.9, 0.054), shinFrame);
    place(armour, afcFacetedPlate(0.092, shinLength * 0.39, 0.024), shinFrame, 0, -shinLength * 0.26, 0.037);
    place(armour, afcFacetedPlate(0.084, shinLength * 0.39, 0.024), shinFrame, 0, shinLength * 0.21, 0.037);
    // The exposed middle section reads as a recessed, energized service channel.
    place(inset, afcBeveledBox(0.037, 0.10, 0.009), shinFrame, 0, -0.015, 0.035);
    place(light, afcBeveledBox(0.007, 0.068, 0.004), shinFrame, 0, -0.015, 0.042);
    for (const y of [-shinLength * 0.29, shinLength * 0.25]) {
      place(inset, afcBeveledBox(0.010, 0.10, 0.005), shinFrame, 0.019, y, 0.052);
      place(trim, new CylinderGeometry(0.007, 0.007, 0.005, 6).rotateX(Math.PI / 2), shinFrame, -0.024, y, 0.052);
    }
    // A slim side actuator has a dark sleeve, exposed rod and two end collars.
    place(inset, new CylinderGeometry(0.015, 0.015, shinLength * 0.46, 10), shinFrame, 0.052, -shinLength * 0.18, -0.007);
    place(trim, new CylinderGeometry(0.008, 0.008, shinLength * 0.40, 10), shinFrame, 0.052, shinLength * 0.22, -0.007);
    for (const y of [-shinLength * 0.39, shinLength * 0.41]) {
      place(armour, afcBeveledBox(0.026, 0.028, 0.038), shinFrame, 0.047, y, -0.007);
    }

    // Tangential pivot housings and locking caps hold the beam ends together.
    for (const point of [shoulder, elbow, wrist]) {
      const pivotFrame = new Matrix4().makeBasis(tangent, new Vector3(0, 1, 0), new Vector3(-Math.cos(angle), 0, -Math.sin(angle))).setPosition(point);
      place(armour, new CylinderGeometry(0.061, 0.061, 0.112, 16).rotateZ(Math.PI / 2), pivotFrame);
      place(trim, new CylinderGeometry(0.032, 0.032, 0.122, 8).rotateZ(Math.PI / 2), pivotFrame);
      if (point === elbow) {
        for (const side of [-1, 1]) {
          place(inset, new TorusGeometry(0.044, 0.009, 6, 24).rotateY(Math.PI / 2), pivotFrame, side * 0.059);
          place(light, new TorusGeometry(0.044, 0.003, 5, 24, Math.PI * 1.45).rotateY(Math.PI / 2), pivotFrame, side * 0.069);
        }
      }
    }

    place(armour, afcBeveledBox(0.072, wrist.distanceTo(foot), 0.069), toeFrame);
    const groundFrame = new Matrix4().makeRotationY(-angle).setPosition(foot.x, 0, foot.z);
    place(armour, afcBeveledBox(0.14, 0.055, 0.13), groundFrame, 0, 0.0275);
    place(trim, afcBeveledBox(0.12, 0.012, 0.11), groundFrame, 0, 0.061);
    // A split sole and a small ankle sensor finish the foot without enlarging it.
    place(inset, afcBeveledBox(0.035, 0.009, 0.10), groundFrame, 0.03, 0.069);
    place(light, afcBeveledBox(0.008, 0.014, 0.034), groundFrame, 0.064, 0.038);
  }
};
