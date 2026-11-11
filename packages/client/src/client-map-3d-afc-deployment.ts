import { Matrix4, Vector3 } from "three";
import { AFC_ARM_FOOT, AFC_ARM_JOINTS, afcLegAzimuth } from "./client-map-3d-afc-legs.js";

const AFC_STOWED_BAY_RADIUS = 0.25;
export const afcBayRadius = (deployment: number, deployedRadius: number): number =>
  AFC_STOWED_BAY_RADIUS + deployment * (deployedRadius - AFC_STOWED_BAY_RADIUS);
export const afcBayHeightScale = (deployment: number): number => 0.25 + deployment * 0.75;

type Point = { readonly radius: number; readonly height: number };

const rotateSegment = (from: Point, to: Point, start: Point, angle: number): Point => {
  const dx = to.radius - from.radius;
  const dy = to.height - from.height;
  return {
    radius: start.radius + dx * Math.cos(angle) - dy * Math.sin(angle),
    height: start.height + dx * Math.sin(angle) + dy * Math.cos(angle)
  };
};

/** Both joints rotate around their hinges. Link lengths and shoulder position
 * stay fixed, and the sole stays level as the ankle travels toward the pad. */
export const afcLegPose = (deployment: number) => {
  const { shoulder, elbow, wrist } = AFC_ARM_JOINTS;
  const fold = 1 - deployment;
  const shoulderTilt = fold * 1.12;
  const shinTilt = fold * -0.55;
  const knee = rotateSegment(shoulder, elbow, shoulder, shoulderTilt);
  const ankle = rotateSegment(elbow, wrist, knee, shinTilt);
  return { shoulder, knee, ankle, foot: rotateSegment(wrist, AFC_ARM_FOOT, ankle, 0), shoulderTilt, shinTilt };
};

type PartWriter = (key: string, x: number, y: number, z: number, ox: number, oy: number, oz: number,
  sx?: number, sz?: number, sy?: number, rotY?: number, rotX?: number, rotZ?: number) => void;
type BeamWriter = (key: string, x: number, y: number, z: number, ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number, length: number) => void;

export const createAfcArmWriter = (
  addAlong: BeamWriter,
  addJoint: JointWriter,
  addFinish: (part: string, transform: Matrix4) => void
): ((x: number, y: number, z: number, deployment: number, animated: boolean) => void) => {
  const transform = new Matrix4();
  const pivot = new Matrix4();
  const yaw = new Matrix4();
  const centre = new Vector3();
  const offset = new Vector3();

  return (x, y, z, deployment, animated) => {
    const { shoulder, knee, ankle, foot, shoulderTilt, shinTilt } = afcLegPose(deployment);
    for (let leg = 0; leg < 4; leg++) {
      const angle = afcLegAzimuth(leg);
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const beam = (key: string, from: Point, to: Point): void => {
        const r = (from.radius + to.radius) / 2;
        const dr = to.radius - from.radius;
        const dy = to.height - from.height;
        addAlong(key, x, y, z, dx * r, (from.height + to.height) / 2, dz * r, dx * dr, dy, dz * dr, Math.hypot(dr, dy));
      };
      addJoint("shoulder", x, y, z, dx * shoulder.radius, shoulder.height, dz * shoulder.radius, -dz, 0, dx);
      beam("upperArm", shoulder, knee);
      addJoint("elbow", x, y, z, dx * knee.radius, knee.height, dz * knee.radius, -dz, 0, dx);
      beam("forearm", knee, ankle);
      beam("claw", ankle, foot);

      if (!animated) continue;
      yaw.makeRotationY(-angle);
      const finish = (part: string, rest: Point, posed: Point, tilt: number): void => {
        transform.makeRotationZ(tilt).multiply(pivot.makeTranslation(-rest.radius, -rest.height, 0));
        transform.setPosition(centre.setFromMatrixPosition(transform).add(offset.set(posed.radius, posed.height, 0)));
        transform.premultiply(yaw);
        transform.setPosition(centre.setFromMatrixPosition(transform).add(offset.set(x, y, z)));
        addFinish(part, transform);
      };
      finish("upper", shoulder, shoulder, shoulderTilt);
      finish("shin", AFC_ARM_JOINTS.elbow, knee, shinTilt);
      finish("toe", AFC_ARM_JOINTS.wrist, ankle, 0);
    }
  };
};

type JointWriter = (key: string, x: number, y: number, z: number, ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number) => void;

export const createAfcBayWriter = (
  addPiece: PartWriter,
  addAlong: BeamWriter,
  addFinish: (part: string, transform: Matrix4) => void,
  socketCount: number,
  deployedRadius: number
): ((x: number, y: number, z: number, deployment: number, animated: boolean) => void) => {
  const transform = new Matrix4();
  const scale = new Matrix4();
  return (x, y, z, deployment, animated) => {
    const radius = afcBayRadius(deployment, deployedRadius);
    const heightScale = afcBayHeightScale(deployment);
    for (let i = 0; i < socketCount; i++) {
      const angle = i * Math.PI / 4;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const cx = dx * radius;
      const cz = dz * radius;
      addPiece("socketPad", x, y, z, cx, 0.02 * heightScale, cz, 1, 1, heightScale);
      addPiece("socketRing", x, y, z, cx, 0.105 * heightScale, cz, 1, 1, heightScale);
      addPiece("socketCollar", x, y, z, cx, 0.175 * heightScale, cz, 1, heightScale, 1, 0, Math.PI / 2);
      if (animated) {
        transform.makeRotationY(-angle).multiply(scale.makeScale(1, heightScale, 1)).setPosition(x + cx, y, z + cz);
        addFinish("bay", transform);
      }

      // Reel out paired conduits only after the bay emerges from the base disc.
      const length = radius - 0.60;
      if (length <= 0) continue;
      const middle = 0.47 + length / 2;
      for (const side of [-0.05, 0.05]) {
        addAlong("cable", x, y, z, dx * middle - dz * side, 0.055, dz * middle + dx * side, dx, 0, dz, length);
      }
    }
  };
};
