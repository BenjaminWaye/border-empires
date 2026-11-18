import { Vector3, type Camera, type Scene, type Texture } from "three";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { createUnitMotionGate, type UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";
import { POD_AFC_CAP_Y } from "../client-map-3d-construction/client-map-3d-construction-pod-flight.js";
import { createScoutDroneModel } from "./client-map-3d-scout-drone-model.js";
import { createScoutDronePose, scoutDronePoseAt, smoothstep01 } from "./client-map-3d-scout-drone-pose.js";
import { createScoutGroundFx } from "./client-map-3d-scout-drone-ground-fx.js";
import { createScoutTrails } from "./client-map-3d-scout-drone-trails.js";
import { applyScoutDroneLights } from "./client-map-3d-scout-drone-lights.js";
import { createScoutDroneEtaLabel, SCOUT_ETA_LABEL_LIFT } from "./client-map-3d-scout-drone-eta-label.js";
import { scoutDroneEtaText } from "../client-scout-drone/client-scout-drone-eta-label.js";
import { createScoutRunningLights, resetScoutRunningLights, updateScoutRunningLights, type ScoutHomeSource } from "./client-map-3d-scout-drone-running-lights.js";

export type { ScoutHomeSource } from "./client-map-3d-scout-drone-running-lights.js";

// The true-3D view of the player's scout drone (docs/explore-scout-plan.md). The drone
// (client-map-3d-scout-drone-model.ts) spools its props up on its AFC's crown, lifts out, leans
// forward a beat before it moves off, climbs to cruise height and flies its route banking into
// turns and pitching nose-down with speed, its camera eye glancing down and across the ground; it
// flares nose-up as it comes in and settles gently back into the crown. Under it: the vision
// footprint with a radar sweep, its silhouette shadow and the route ahead
// (client-map-3d-scout-drone-ground-fx.ts); behind
// it, short nav-light trails (client-map-3d-scout-drone-trails.ts). Over it, the "Back in …"
// countdown (client-map-3d-scout-drone-eta-label.ts). The 2D renderer draws the same
// story flat (client-map-render-2d-scout-drone/).
//
// client-map-3d/client-map-3d.ts creates this once and calls sync() every frame. Nothing is
// allocated per frame. On Reduce Motion or a slow device (client-map-3d-unit-motion-gate.ts)
// the rotors, sweep, bob, strobe, trails, lean, flare and settle hold still; the drone still moves
// along its route, since that is information, not decoration.

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
export const SCOUT_DRONE_DOCK_HEIGHT = POD_AFC_CAP_Y + 0.26; // the sphere resting just over the crown spike's tip
export const SCOUT_DRONE_CRUISE_HEIGHT = 1.95;
const MAX_BANK = 0.55;
const SWEEP_PER_MS = 0.0016;
const ROTOR_PER_MS = 0.06;
/** Forward lean before moving off, nose-up flare coming in to land (radians), and the touch-down settle (scene units). */
const LAUNCH_LEAN = 0.14;
const LANDING_FLARE = 0.17;
const TOUCHDOWN_SETTLE = 0.045;
/** Camera distance over which the far-view readability boost fades in (gameplay zoom is ~38). */
const FAR_FROM = 9;
const FAR_SPAN = 16;
/** How far the eye's inner rings may turn inside the bezel (radians). */
const EYE_MAX_TILT = 0.24;
const EYE_PAN = 0.18;
const bump = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

const wrapNear = (delta: number, size: number): number => (delta > size / 2 ? delta - size : delta < -size / 2 ? delta + size : delta);

export const createScoutDroneOverlay = (scene: Scene, deps: ScoutDroneOverlayDeps): ScoutDroneOverlay => {
  const model = createScoutDroneModel(deps.envMap);
  model.root.scale.setScalar(SCOUT_DRONE_SCALE);
  model.root.visible = false;
  scene.add(model.root);
  const ground = createScoutGroundFx(scene, SCOUT_DRONE_SCALE);
  ground.setVisible(false);
  const trails = createScoutTrails(scene, model.lights.navLeft.base, model.lights.navRight.base);
  trails.setVisible(false);
  const etaLabel = createScoutDroneEtaLabel(scene);
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
  const viewDir = new Vector3();
  let sweepAngle = 0;

  const hide = (): void => {
    if (!visible) return;
    visible = false;
    model.root.visible = false;
    ground.setVisible(false);
    trails.setVisible(false);
    trails.reset();
    etaLabel.place(0, 0, 0, undefined);
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
    // A gentle settle on touch-down: the gear takes the weight, dips a little and comes back.
    const settle = animate ? TOUCHDOWN_SETTLE * bump((pose.landT - 0.8) / 0.2) : 0;
    const altitude = groundY + SCOUT_DRONE_DOCK_HEIGHT + (SCOUT_DRONE_CRUISE_HEIGHT - SCOUT_DRONE_DOCK_HEIGHT) * pose.lift + bob - settle;

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
    // Anticipation and flare: a short nose-down lean just before it slides off the crown, and a
    // nose-up flare as it slows to land.
    const lean = animate ? LAUNCH_LEAN * bump((pose.launchT - 0.25) / 0.45) - LANDING_FLARE * bump((pose.landT - 0.1) / 0.62) : 0;
    model.root.rotation.set(pitch + lean + jitterPitch * pose.lift, yaw, bank + jitterRoll * pose.lift, "YXZ");
    // From the gameplay camera distance the X has to read: slightly denser prop discs, a larger eye halo.
    const far = deps.camera ? smoothstep01((deps.camera.position.distanceTo(model.root.position) - FAR_FROM) / FAR_SPAN) : 0;
    // Seen edge-on, a blur disc would stack into a bright streak (and bloom into a blob): fade the
    // discs out as the camera comes level with the prop plane.
    let discFacing = 1;
    if (deps.camera) {
      model.root.updateMatrixWorld();
      const e = model.root.matrixWorld.elements;
      viewDir.subVectors(deps.camera.position, model.root.position).normalize();
      const upLength = Math.hypot(e[4]!, e[5]!, e[6]!) || 1;
      discFacing = smoothstep01((Math.abs(viewDir.x * e[4]! + viewDir.y * e[5]! + viewDir.z * e[6]!) / upLength - 0.08) / 0.3);
    }
    model.root.visible = true;
    etaLabel.place(at.sceneX, altitude + SCOUT_ETA_LABEL_LIFT, at.sceneZ, scoutDroneEtaText(flight, nowMs));

    // Rotors: blades while spooling, then blades over a faint motion-blur disc at speed.
    const blur = animate ? smoothstep01((pose.rotor - 0.35) / 0.5) : 0;
    // The blades thin out as the blur fades in, but never vanish: the big blades are the feature.
    model.bladeMaterial.opacity = 1 - 0.4 * blur;
    for (let k = 0; k < model.rotors.length; k += 1) {
      const rotor = model.rotors[k]!;
      if (animate) rotorAngles[k] = (rotorAngles[k]! + dt * ROTOR_PER_MS * pose.rotor * (1 + 0.035 * Math.sin(k * 1.9 + nowMs * 0.0004))) % (Math.PI * 2);
      rotor.blades.rotation.y = (k % 2 === 0 ? 1 : -1) * rotorAngles[k]! + k;
      rotor.disc.opacity = 0.26 * blur * (1 + 0.9 * far) * discFacing;
    }
    // The eye's inner rings glance down at the ground just ahead and pan slowly across it, within
    // what the bezel allows.
    const height = altitude - groundY;
    model.eye.rotation.x = Math.min(EYE_MAX_TILT, Math.max(0, 0.3 * (Math.atan2(height, 1.1) - pitch))) * pose.lift;
    model.eye.rotation.y = animate ? EYE_PAN * Math.sin(nowMs * 0.0008) * pose.lift : 0;

    // Lights: the pod LEDs and strobe over home land; past the border it runs dark, with only the
    // dimmed eye and lower-front LED slots left.
    const pulse = animate ? 0.5 + 0.5 * Math.sin(nowMs * 0.004) : 0.75;
    const level = updateScoutRunningLights(runningLights, pose.x, pose.y, deps.world, nowMs, deps.homeSource);
    applyScoutDroneLights(model, level, pulse, animate, nowMs, !pose.returning, far);

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
    ground.place(at.sceneX, groundY, at.sceneZ, altitude, yaw, pose.lift, sweepAngle, pulse);
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
      etaLabel.dispose();
    }
  };
};
