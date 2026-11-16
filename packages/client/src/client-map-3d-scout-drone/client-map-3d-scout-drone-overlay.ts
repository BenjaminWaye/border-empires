import { Vector3, type Camera, type Scene, type Texture } from "three";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { createUnitMotionGate, type UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";
import { POD_AFC_CAP_Y } from "../client-map-3d-construction/client-map-3d-construction-pod-flight.js";
import { createScoutDroneModel } from "./client-map-3d-scout-drone-model.js";
import { createScoutDronePose, scoutDronePoseAt, smoothstep01 } from "./client-map-3d-scout-drone-pose.js";
import { createScoutGroundFx } from "./client-map-3d-scout-drone-ground-fx.js";
import { createScoutTrails } from "./client-map-3d-scout-drone-trails.js";
import { applyScoutDroneLights } from "./client-map-3d-scout-drone-lights.js";
import { createScoutRunningLights, resetScoutRunningLights, updateScoutRunningLights, type ScoutHomeSource } from "./client-map-3d-scout-drone-running-lights.js";

export type { ScoutHomeSource } from "./client-map-3d-scout-drone-running-lights.js";

// The true-3D view of the player's scout drone (docs/explore-scout-plan.md). The drone
// (client-map-3d-scout-drone-model.ts) lifts out of its AFC's crown, climbs to cruise height and
// flies its route banking into turns and pitching nose-down with speed, its camera gimbal panning
// over the ground below, then settles back into the crown. Under it: the vision footprint with a
// radar sweep, a blob shadow and the route ahead (client-map-3d-scout-drone-ground-fx.ts); behind
// it, short nav-light trails (client-map-3d-scout-drone-trails.ts). The 2D renderer draws the same
// story flat (client-map-render-2d-scout-drone/).
//
// client-map-3d/client-map-3d.ts creates this once and calls sync() every frame. Nothing is
// allocated per frame. On Reduce Motion or a slow device (client-map-3d-unit-motion-gate.ts)
// the rotors, sweep, bob, strobe and trails hold still; the drone still moves along its route,
// since that is information, not decoration.

export type ScoutDroneScenePoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type ScoutDroneOverlayDeps = {
  readonly world: { readonly width: number; readonly height: number };
  /** Writes the scene position (toroid-wrapped around the camera) of a possibly fractional tile into `out`. */
  readonly sceneFor: (x: number, y: number, out: ScoutDroneScenePoint) => void;
  readonly envMap?: Texture | undefined;
  readonly camera?: Camera | undefined;
  readonly motionGate?: UnitMotionGate;
  /**
   * The client's tile ownership (ClientState satisfies it). Over the player's own or allied land
   * the drone shows its nav lights; past the border it runs dark (client-map-3d-scout-drone-running-lights.ts).
   * Absent (stories, tests): lights stay on.
   */
  readonly homeSource?: ScoutHomeSource | undefined;
};

export type ScoutDroneOverlay = {
  /** Poses everything for `flight` at `nowMs` (local clock), or hides it when nothing is in the air. */
  readonly sync: (flight: ScoutDroneFlight | undefined, nowMs: number) => void;
  readonly dispose: () => void;
};

export const SCOUT_DRONE_SCALE = 2.2;
/** Above the ground under it: docked on the AFC's crown, and at cruise. */
export const SCOUT_DRONE_DOCK_HEIGHT = POD_AFC_CAP_Y + 0.38; // legs down, feet clear of the crown spike
export const SCOUT_DRONE_CRUISE_HEIGHT = 1.95;
const MAX_BANK = 0.55;
const SWEEP_PER_MS = 0.0016;
const ROTOR_PER_MS = 0.06;

const wrapNear = (delta: number, size: number): number => (delta > size / 2 ? delta - size : delta < -size / 2 ? delta + size : delta);

export const createScoutDroneOverlay = (scene: Scene, deps: ScoutDroneOverlayDeps): ScoutDroneOverlay => {
  const model = createScoutDroneModel(deps.envMap);
  model.root.scale.setScalar(SCOUT_DRONE_SCALE);
  model.root.visible = false;
  scene.add(model.root);
  const ground = createScoutGroundFx(scene);
  ground.setVisible(false);
  const trails = createScoutTrails(scene, model.lights.navLeft.base, model.lights.navRight.base);
  trails.setVisible(false);
  const gate = deps.motionGate ?? createUnitMotionGate();

  const pose = createScoutDronePose();
  const runningLights = createScoutRunningLights();
  const at: ScoutDroneScenePoint = { sceneX: 0, sceneZ: 0, surfaceY: 0 };
  const step: ScoutDroneScenePoint = { sceneX: 0, sceneZ: 0, surfaceY: 0 };
  const navLeft = new Vector3();
  const navRight = new Vector3();
  let visible = false;
  let lastMs = 0;
  let groundY = 0;
  let yaw = 0;
  let bank = 0;
  let pitch = 0;
  // Each prop spins at a slightly different rate, as real ones do while trimming.
  const rotorAngles = new Float32Array(model.rotors.length);
  const washPoint = new Vector3();
  let sweepAngle = 0;

  const hide = (): void => {
    if (!visible) return;
    visible = false;
    model.root.visible = false;
    ground.setVisible(false);
    trails.setVisible(false);
    trails.reset();
    resetScoutRunningLights(runningLights);
  };

  const sync: ScoutDroneOverlay["sync"] = (flight, nowMs) => {
    gate.recordFrame(nowMs);
    if (!scoutDronePoseAt(flight, nowMs, deps.world.width, deps.world.height, pose) || !flight) {
      hide();
      return;
    }
    const animate = gate.shouldAnimate();
    const firstFrame = !visible;
    const dt = firstFrame ? 16 : Math.min(100, Math.max(0, nowMs - lastMs));
    lastMs = nowMs;
    deps.sceneFor(pose.x, pose.y, at);

    // Altitude: eased over terrain steps, docked on the crown at either end of the flight.
    groundY = firstFrame ? at.surfaceY : groundY + (at.surfaceY - groundY) * Math.min(1, dt / 350);
    const bob = animate ? 0.05 * Math.sin(nowMs * 0.0021) * pose.lift : 0;
    const altitude = groundY + SCOUT_DRONE_DOCK_HEIGHT + (SCOUT_DRONE_CRUISE_HEIGHT - SCOUT_DRONE_DOCK_HEIGHT) * pose.lift + bob;

    // Heading, bank into turns, nose down with speed.
    let yawRate = 0;
    if (pose.dirX !== 0 || pose.dirY !== 0) {
      const target = Math.atan2(pose.dirX, pose.dirY);
      if (firstFrame) yaw = target;
      const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)) * Math.min(1, dt / 420);
      yaw += delta;
      yawRate = dt > 0 ? delta / dt : 0;
    }
    const easeK = Math.min(1, dt / 250);
    bank += (Math.max(-MAX_BANK, Math.min(MAX_BANK, -yawRate * 260)) * pose.lift - bank) * easeK;
    const speedNorm = Math.min(1, pose.speed / 0.6);
    pitch += ((0.07 + 0.2 * speedNorm) * smoothstep01(pose.lift * 1.4 - 0.4) - pitch) * easeK;
    model.root.position.set(at.sceneX, altitude, at.sceneZ);
    // Hover micro-motion: tiny attitude corrections (well under a degree) on top of the banking.
    const jitterPitch = animate ? 0.009 * Math.sin(nowMs * 0.0031) + 0.005 * Math.sin(nowMs * 0.0077 + 1.3) : 0;
    const jitterRoll = animate ? 0.009 * Math.sin(nowMs * 0.0027 + 0.7) + 0.005 * Math.sin(nowMs * 0.0069) : 0;
    model.root.rotation.set(pitch + jitterPitch * pose.lift, yaw, bank + jitterRoll * pose.lift, "YXZ");
    model.root.visible = true;

    // Rotors: blades while spooling, a motion-blur disc at speed.
    const blur = animate ? smoothstep01((pose.rotor - 0.35) / 0.5) : 0;
    // The blades fade out as the blur fades in, so the hand-over at speed is seamless.
    model.bladeMaterial.opacity = 1 - 0.92 * blur;
    for (let k = 0; k < model.rotors.length; k += 1) {
      const rotor = model.rotors[k]!;
      if (animate) rotorAngles[k] = (rotorAngles[k]! + dt * ROTOR_PER_MS * pose.rotor * (1 + 0.035 * Math.sin(k * 1.9 + nowMs * 0.0004))) % (Math.PI * 2);
      rotor.blades.rotation.y = (k % 2 === 0 ? 1 : -1) * rotorAngles[k]! + k;
      rotor.blades.visible = blur < 0.97;
      rotor.disc.opacity = 0.42 * blur;
    }
    // Landing legs: down while docked; once it climbs away they retract into short stubs under
    // the chassis (telescoping, tucked a little outward) so nothing trails under the arms.
    const fold = smoothstep01((pose.lift - 0.3) / 0.45);
    const legScale = 1 - 0.72 * fold;
    model.legs.left.scale.y = legScale;
    model.legs.right.scale.y = legScale;
    model.legs.left.rotation.z = -0.2 * fold;
    model.legs.right.rotation.z = 0.2 * fold;

    // The camera gimbal looks down at the ground just ahead and pans across it with the sweep.
    const height = altitude - groundY;
    model.gimbalPan.rotation.y = animate ? 0.6 * Math.sin(nowMs * 0.0008) : 0;
    model.gimbalTilt.rotation.x = Math.atan2(height, 1.1) - pitch;

    // Lights: nav lights and strobe over home land; past the border it runs dark, with only the
    // dim cyan lens and status light left.
    const pulse = animate ? 0.5 + 0.5 * Math.sin(nowMs * 0.004) : 0.75;
    const level = updateScoutRunningLights(runningLights, pose.x, pose.y, deps.world, nowMs, deps.homeSource);
    applyScoutDroneLights(model, level, pulse, animate, nowMs, !pose.returning);

    // Nav-light trails, in the same scene space as the drone.
    model.root.updateMatrixWorld();
    navLeft.set(model.navLeftLocal.x, model.navLeftLocal.y, model.navLeftLocal.z).applyMatrix4(model.root.matrixWorld);
    navRight.set(model.navRightLocal.x, model.navRightLocal.y, model.navRightLocal.z).applyMatrix4(model.root.matrixWorld);
    if (firstFrame) trails.reset();
    trails.setVisible(animate && level > 0.005);
    // Trails only read while the drone is really moving; a hovering or slow drone would stack them into blobs.
    if (animate) trails.update(nowMs, navLeft, navRight, at.sceneX - pose.x, at.sceneZ - pose.y, deps.camera, pose.lift * level * (0.15 + 0.85 * speedNorm));

    // Ground: footprint, sweep and shadow under the drone, then the route still ahead.
    if (animate) sweepAngle = (sweepAngle + dt * SWEEP_PER_MS) % (Math.PI * 2);
    ground.place(at.sceneX, groundY, at.sceneZ, altitude, pose.lift, sweepAngle, pulse);
    // Rotor wash: faint ripples on the ground under each prop while it is low (launch and landing).
    const wash = animate ? pose.rotor * (1 - smoothstep01((pose.lift - 0.15) / 0.6)) : 0;
    ground.beginWash(wash, nowMs);
    if (wash > 0.01) {
      for (const local of model.rotorLocal) {
        washPoint.set(local.x, local.y, local.z).applyMatrix4(model.root.matrixWorld);
        ground.washPoint(washPoint.x, groundY, washPoint.z);
      }
    }
    ground.endWash();
    ground.beginRoute();
    ground.routePoint(at.sceneX, at.surfaceY, at.sceneZ);
    let prevX = at.sceneX;
    let prevZ = at.sceneZ;
    const lastIndex = pose.returning ? flight.steps.length - 1 : flight.turnIndex;
    for (let i = pose.stepIndex + 1; i <= lastIndex; i += 1) {
      const s = flight.steps[i]!;
      deps.sceneFor(s.x, s.y, step);
      prevX += wrapNear(step.sceneX - prevX, deps.world.width);
      prevZ += wrapNear(step.sceneZ - prevZ, deps.world.height);
      ground.routePoint(prevX, step.surfaceY, prevZ);
    }
    ground.endRoute();
    ground.setVisible(true);
    visible = true;
  };

  return {
    sync,
    dispose: () => {
      scene.remove(model.root);
      model.dispose();
      ground.dispose();
      trails.dispose();
    }
  };
};
