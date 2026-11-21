import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, RingGeometry, type Scene } from "three";
import { SCOUT_DRONE_MAX_STOPS, scoutDroneLeg, scoutDroneStepIndexAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { clientScoutWorld, flyingScoutDrone, ownActiveAfcs, scoutChargesReady, scoutPlanCapacity, scoutPlanPreview, type ScoutPlanPreview } from "../client-scout-drone/client-scout-drone-plan.js";
import { scoutHintTile } from "../client-scout-drone/client-scout-drone-hint.js";
import { makeGlowTexture } from "./client-map-3d-scout-drone-textures.js";
import type { ScoutDroneScenePoint } from "./client-map-3d-scout-drone-overlay.js";

// The planned scout flight in the true-3D map (docs/explore-scout-plan.md §13), drawn while the
// player plans it (client-scout-drone-plan.ts): glowing cyan beads flowing from the AFC through
// each stop, a ring on every stop (brass when the tap was out of range and the stop was pulled
// back to the leg's limit), and fainter beads for the straight flight home. With a mouse, the leg
// to the tile under the pointer shows as ghost beads ending where a tap would put the stop, so the
// range is felt on the route itself -- nothing is drawn on the fog. Outside planning, until the
// player has sent a few flights, a soft brass glow on nearby fog says "tap here".
// Only the true-3D map draws this; the 2D map shows the dock alone.

type Point = { x: number; y: number };
type PlanSource = ClientState;

export type ScoutPlanOverlay = { readonly sync: (nowMs: number) => void; readonly dispose: () => void };

const CYAN = new Color("#4fd8ff");
const CYAN_DIM = new Color("#2a7f99");
const GHOST = new Color("#cfe9f2");
const BRASS = new Color("#f2c66b");
const BEAD_SPACING = 0.42;
const FLOW_TILES_PER_SECOND = 1.4;
const MAX_BEADS = 4000;
const RISE = 0.09;
const HINT_FLIGHTS = 3;

/**
 * Everything the planned route reads. While the drone is out the new legs start where it will take
 * them on, which moves step by step, and stops mattering once it lands (review 2026-11-21: a key
 * without these kept drawing the route from where the drone used to be).
 */
export const scoutPlanRouteKey = (state: PlanSource, nowMs: number): string => {
  const plan = state.scoutDronePicking;
  const hover = state.hover;
  const flying = flyingScoutDrone(state, nowMs);
  const flyingKey = flying ? `${flying.launchedAt}:${flying.landsAt}:${scoutDroneStepIndexAt(flying, nowMs)}` : "";
  return `${plan.stops.map((s) => `${s.x},${s.y}`).join(";")}|${hover ? `${hover.x},${hover.y}` : ""}|${state.tilesRevision}|${state.serverReachRevision}|${flyingKey}|${scoutPlanCapacity(state, nowMs)}|${state.me}|${state.allies.join(",")}`;
};

export const createScoutPlanOverlay = (scene: Scene, deps: { readonly state: PlanSource; readonly sceneFor: (x: number, y: number, out: ScoutDroneScenePoint) => void }): ScoutPlanOverlay => {
  const glow = makeGlowTexture();
  const beadMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", map: glow, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  const beadGeometry = new PlaneGeometry(0.7, 0.7);
  beadGeometry.rotateX(-Math.PI / 2);
  const beads = new InstancedMesh(beadGeometry, beadMaterial, MAX_BEADS);
  beads.frustumCulled = false;
  beads.setColorAt(0, CYAN);
  beads.count = 0;
  const ringMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  const ringGeometry = new RingGeometry(0.55, 0.95, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = new InstancedMesh(ringGeometry, ringMaterial, SCOUT_DRONE_MAX_STOPS + 3);
  rings.frustumCulled = false;
  rings.setColorAt(0, CYAN);
  rings.count = 0;
  const group = new Group();
  group.name = "scout-drone-plan";
  group.renderOrder = 25;
  beads.renderOrder = 25;
  rings.renderOrder = 26;
  group.add(beads, rings);
  scene.add(group);

  const matrix = new Matrix4();
  const a: ScoutDroneScenePoint = { sceneX: 0, sceneZ: 0, surfaceY: 0 };
  const b: ScoutDroneScenePoint = { sceneX: 0, sceneZ: 0, surfaceY: 0 };
  const tint = new Color();
  let beadCount = 0;
  let ringCount = 0;

  // The route only changes when the plan, the pointer or the map does.
  let cacheKey = "";
  let outbound: Point[] = [];
  let home: Point[] = [];
  let ghost: Point[] = [];
  let stops: Array<Point & { clamped: boolean }> = [];
  let ghostEnd: (Point & { clamped: boolean }) | undefined;

  const rebuildRoute = (state: PlanSource, nowMs: number): void => {
    const plan = state.scoutDronePicking;
    const hover = state.hover;
    const key = scoutPlanRouteKey(state, nowMs);
    if (key === cacheKey) return;
    cacheKey = key;
    const preview: ScoutPlanPreview | undefined = scoutPlanPreview(state, plan.stops, nowMs);
    outbound = preview ? [preview.launch, ...preview.route.legs.flatMap((leg) => leg.tiles)] : [];
    stops = preview ? preview.route.legs.map((leg) => ({ ...leg.end, clamped: leg.clamped })) : [];
    const flight = preview?.flight;
    home = flight ? flight.steps.slice(flight.turnIndex) : [];
    ghost = [];
    ghostEnd = undefined;
    const canAdd = plan.stops.length < scoutPlanCapacity(state, nowMs);
    const blocked = preview?.route.legs.at(-1)?.blocked;
    const world = clientScoutWorld(state);
    if (hover && canAdd && !blocked && world.classify(hover.x, hover.y).kind !== "HOME") {
      const from = stops.at(-1) ?? (ownActiveAfcs(state).length > 0 ? scoutPlanPreview(state, [hover], nowMs)?.launch : undefined);
      if (from && !(stops.length > 0 && from.x === hover.x && from.y === hover.y)) {
        const leg = scoutDroneLeg(from, hover, world);
        ghost = [from, ...leg.tiles];
        ghostEnd = { ...leg.end, clamped: leg.clamped };
      }
    }
  };

  const pushBead = (x: number, y: number, z: number, color: Color, scale: number): void => {
    if (beadCount >= MAX_BEADS) return;
    matrix.makeScale(scale, 1, scale);
    matrix.setPosition(x, y, z);
    beads.setMatrixAt(beadCount, matrix);
    beads.setColorAt(beadCount, color);
    beadCount += 1;
  };

  /** Beads along a tile path, flowing forward with time (`phase` 0..1 of a bead gap). */
  const beadPath = (path: readonly Point[], color: Color, scale: number, phase: number): void => {
    let carry = phase * BEAD_SPACING;
    for (let i = 1; i < path.length; i += 1) {
      deps.sceneFor(path[i - 1]!.x, path[i - 1]!.y, a);
      deps.sceneFor(path[i]!.x, path[i]!.y, b);
      const dx = b.sceneX - a.sceneX;
      const dz = b.sceneZ - a.sceneZ;
      const length = Math.hypot(dx, dz);
      if (length > 3) continue; // a wrap seam between two neighbours: skip the jump
      let t = carry;
      while (t < length) {
        const f = t / length;
        pushBead(a.sceneX + dx * f, a.surfaceY + (b.surfaceY - a.surfaceY) * f + RISE, a.sceneZ + dz * f, color, scale);
        t += BEAD_SPACING;
      }
      carry = t - length;
    }
  };

  const pushRing = (p: Point, color: Color, scale: number): void => {
    if (ringCount >= rings.instanceMatrix.count) return;
    deps.sceneFor(p.x, p.y, a);
    matrix.makeScale(scale, 1, scale);
    matrix.setPosition(a.sceneX, a.surfaceY + RISE + 0.01, a.sceneZ);
    rings.setMatrixAt(ringCount, matrix);
    rings.setColorAt(ringCount, color);
    ringCount += 1;
  };

  const sync: ScoutPlanOverlay["sync"] = (nowMs) => {
    const state = deps.state;
    const plan = state.scoutDronePicking;
    beadCount = 0;
    ringCount = 0;
    const flying = state.scoutDroneFlight && state.scoutDroneFlight.landsAt > nowMs;
    if (plan.active) {
      rebuildRoute(state, nowMs);
      const phase = ((nowMs / 1000) * FLOW_TILES_PER_SECOND) % 1;
      beadPath(outbound, CYAN, 1, phase);
      beadPath(home, CYAN_DIM, 0.7, phase);
      beadPath(ghost, GHOST, 0.75, phase);
      const bump = Math.max(0, 1 - (nowMs - plan.bumpAt) / 350);
      stops.forEach((stop, i) => {
        const last = i === stops.length - 1;
        const pulse = last ? 1 + 0.12 * Math.sin(nowMs / 220) + 0.5 * bump : 1;
        pushRing(stop, stop.clamped ? BRASS : CYAN, pulse);
      });
      if (ghostEnd) pushRing(ghostEnd, ghostEnd.clamped ? BRASS : tint.copy(GHOST).multiplyScalar(0.8), 0.85);
    }
    // "Tap here": until the player has flown a few flights this session, on nearby fog.
    const wantsHint = (plan.active ? plan.stops.length === 0 : plan.launches < HINT_FLIGHTS) && !flying && scoutChargesReady(state, nowMs) > 0;
    const hint = wantsHint ? scoutHintTile(state) : undefined;
    if (hint) {
      // A soft breathing glow, about a tile wide: a hint, not a target (owner, 2026-11-21).
      deps.sceneFor(hint.x, hint.y, a);
      const breath = 0.5 + 0.5 * Math.sin(nowMs / 420);
      pushBead(a.sceneX, a.surfaceY + RISE, a.sceneZ, tint.copy(BRASS).multiplyScalar(0.35 + 0.35 * breath), 2.2 + 0.4 * breath);
    }
    beads.count = beadCount;
    rings.count = ringCount;
    beads.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    group.visible = beadCount + ringCount > 0;
  };

  return {
    sync,
    dispose: () => {
      scene.remove(group);
      beadGeometry.dispose();
      beadMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      glow?.dispose();
    }
  };
};
