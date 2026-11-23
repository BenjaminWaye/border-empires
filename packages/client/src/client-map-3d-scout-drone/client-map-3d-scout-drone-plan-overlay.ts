import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, RingGeometry, type Scene } from "three";
import { SCOUT_DRONE_MAX_STOPS, WORLD_HEIGHT, WORLD_WIDTH, scoutDroneLeg, scoutDronePositionAt, scoutDroneStepIndexAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { clientScoutWorld, flyingScoutDrone, ownActiveAfcs, scoutPlanCapacity, scoutPlanPreview, type ScoutPlanPreview } from "../client-scout-drone/client-scout-drone-plan.js";
import { makeGlowTexture } from "./client-map-3d-scout-drone-textures.js";
import { createScoutDroneBadge, createScoutFindPin, createScoutStopNumbers } from "./client-map-3d-scout-drone-stop-numbers.js";
import { createScoutFindPopLayer } from "./client-map-3d-scout-drone-find-pops.js";
import { scoutReportCardVisible } from "../client-scout-drone/client-scout-drone-hud.js";
import { SCOUT_FIND_POP_MS } from "../client-scout-drone/client-scout-drone-finds.js";
import type { ScoutDroneScenePoint } from "./client-map-3d-scout-drone-overlay.js";

// The planned scout flight in the true-3D map (docs/explore-scout-plan.md §13), drawn while the
// player plans it (client-scout-drone-plan.ts): glowing cyan beads flowing from the AFC through
// each stop, a numbered ring on every stop (with a thin outer ring when the tap was out of range and
// the stop was pulled back to the leg's limit), and fainter beads for the straight flight home. With a
// mouse, the leg to the tile under the pointer shows as ghost beads ending in a soft dot where a tap
// would put the stop, so the range is felt on the route itself -- nothing is drawn
// on the fog. While the drone flies, the rest of its route stays drawn with a bright marker under the
// drone, and a landing report's main find gets a short gold burst.
// Only the true-3D map draws this; the 2D map shows the bottom HUD alone.

type Point = { x: number; y: number };
type PlanSource = ClientState;

export type ScoutPlanOverlay = { readonly sync: (nowMs: number) => void; readonly dispose: () => void };

const CYAN = new Color("#4fd8ff");
const CYAN_DIM = new Color("#2a7f99");
const GHOST = new Color("#cfe9f2");
const BRASS = new Color("#f2c66b");
/** The white drone badge shows only zoomed out past this (px per tile; default 22): closer in, the drone itself reads (owner 2026-11-21). */
export const SCOUT_DRONE_BADGE_MAX_ZOOM = 16;
/**
 * A stop pulled back to the leg's range is still a good stop: the same cyan ring with a thin outer ring for
 * "at the limit". Gold read as "chosen" and orange with a trail as an error (player reviews 2026-11-21).
 */
const LIMIT_RING = new Color("#2f9fc2");
/** Scaled so the outer ring (0.55-0.95 at 1x) sits just outside the stop's ring, not over it. */
const LIMIT_RING_SCALE = 1.75;
/** The "too far" line after a tap past the range: how long it shows, and its colour. */
const TOO_FAR_MS = 1_400;
const TOO_FAR = new Color("#ff8a5c");
/** Tiles of the stub a pulled-back stop keeps once the line has faded (round 6: three faint tiles went unseen). */
const TOO_FAR_STUB_TILES = 6;
const BEAD_SPACING = 0.42;
const FLOW_TILES_PER_SECOND = 1.4;
const MAX_BEADS = 4000;
const RISE = 0.09;
/** How long the gold burst on a landing report's main find lasts. */
const LANDING_BURST_MS = 3_000;

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

/** Points a tile apart on the straight line from `a` to `b`, the short way round the wrapping map. */
export const straightTiles = (a: Point, b: Point): Point[] => {
  const wrap = (d: number, size: number): number => ((((d + size / 2) % size) + size) % size) - size / 2;
  const dx = wrap(b.x - a.x, WORLD_WIDTH);
  const dy = wrap(b.y - a.y, WORLD_HEIGHT);
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (dx * i) / n, y: a.y + (dy * i) / n }));
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
  // Each stop can carry two rings (the limit ring), and a flight extended mid-air holds up to twice the stops.
  const rings = new InstancedMesh(ringGeometry, ringMaterial, SCOUT_DRONE_MAX_STOPS * 4 + 8);
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
  const numbers = createScoutStopNumbers(scene, SCOUT_DRONE_MAX_STOPS * 2);
  const droneBadge = createScoutDroneBadge(scene);
  const findPin = createScoutFindPin(scene);
  const findPops = createScoutFindPopLayer(scene, deps.sceneFor);

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

  /** A number badge over a stop, so the route's order reads at a glance. */
  const numberStop = (n: number, p: Point): void => {
    deps.sceneFor(p.x, p.y, a);
    numbers.place(n, a.sceneX, a.surfaceY + RISE, a.sceneZ);
  };

  const sync: ScoutPlanOverlay["sync"] = (nowMs) => {
    const state = deps.state;
    const plan = state.scoutDronePicking;
    beadCount = 0;
    ringCount = 0;
    numbers.begin();
    droneBadge.hide();
    findPin.hide();
    const flying = state.scoutDroneFlight && state.scoutDroneFlight.landsAt > nowMs;
    if (plan.active) {
      rebuildRoute(state, nowMs);
      const phase = ((nowMs / 1000) * FLOW_TILES_PER_SECOND) % 1;
      beadPath(outbound, CYAN, 1, phase);
      beadPath(home, CYAN_DIM, 0.7, phase);
      beadPath(ghost, GHOST, 0.75, phase);
      const bump = Math.max(0, 1 - (nowMs - plan.bumpAt) / 350);
      const addedAfter = flying ? state.scoutDroneFlight!.waypoints?.length ?? 0 : 0;
      stops.forEach((stop, i) => {
        const last = i === stops.length - 1;
        const pulse = last ? 1 + 0.12 * Math.sin(nowMs / 220) + 0.5 * bump : 1;
        // The numbered disc is the stop's marker: a bright ring under it bled through the digit (review round 5).
        if (stop.clamped) pushRing(stop, LIMIT_RING, pulse * LIMIT_RING_SCALE);
        // Stops added to a drone in the air continue its numbering (review 2026-11-21).
        numberStop(addedAfter + i + 1, stop);
      });
      // Right after a tap past the range, a fading line runs on from the stop toward the tapped tile for a
      // moment: the limit is shown when it bites, and the route stays clean after (player review 2026-11-21).
      const sinceTap = nowMs - plan.bumpAt;
      const lastStop = stops.at(-1);
      const tapped = plan.stops[stops.length - 1];
      if (lastStop?.clamped && tapped && sinceTap >= 0 && sinceTap < TOO_FAR_MS) {
        beadPath(straightTiles(lastStop, tapped), tint.copy(TOO_FAR).multiplyScalar(1 - sinceTap / TOO_FAR_MS), 0.6, phase);
      }
      // After the line fades, every pulled-back stop keeps a short orange stub pointing toward its tapped tile,
      // so the cut stays readable on a second look (player review round 5, 2026-11-21).
      stops.forEach((stop, i) => {
        const wanted = plan.stops[i];
        if (!stop.clamped || !wanted || (i === stops.length - 1 && sinceTap >= 0 && sinceTap < TOO_FAR_MS)) return;
        const stub = straightTiles(stop, wanted).slice(0, TOO_FAR_STUB_TILES + 1);
        beadPath(stub, TOO_FAR, 0.8, phase);
        // A small hollow ring caps it, so it reads as "you wanted this far", not a route carrying on (round 7).
        pushRing(stub[stub.length - 1]!, TOO_FAR, 0.4);
      });
      // The pointer's leg ends in a soft dot, never a ring, so it cannot pass for a placed stop.
      if (ghostEnd) {
        deps.sceneFor(ghostEnd.x, ghostEnd.y, a);
        pushBead(a.sceneX, a.surfaceY + RISE, a.sceneZ, tint.copy(GHOST).multiplyScalar(0.6), 1.1);
      }
    } else if (flying) {
      // In the air: the rest of the route stays drawn bright, so the drone and where it is going are easy to
      // find (players lost it in a faint trail, review 2026-11-21).
      const air = state.scoutDroneFlight!;
      const phase = ((nowMs / 1000) * FLOW_TILES_PER_SECOND) % 1;
      const from = Math.max(0, scoutDroneStepIndexAt(air, nowMs));
      beadPath(air.steps.slice(from, air.turnIndex + 1), CYAN, 0.85, phase);
      beadPath(air.steps.slice(Math.max(from, air.turnIndex)), CYAN_DIM, 0.65, phase);
      // Each stop's step, found in flight order: a route that crosses a later stop's tile on an earlier
      // leg must not count that stop as reached (review 2026-11-21).
      let cursor = 0;
      (air.waypoints ?? []).forEach((stop, i) => {
        let at = cursor;
        while (at <= air.turnIndex && (air.steps[at]!.x !== stop.x || air.steps[at]!.y !== stop.y)) at += 1;
        if (at > air.turnIndex) return;
        cursor = at + 1;
        if (at > from) numberStop(i + 1, stop);
      });
      // A bright marker under the drone itself, which is a speck at phone zoom.
      const at = scoutDronePositionAt(air, nowMs, WORLD_WIDTH, WORLD_HEIGHT);
      if (at) {
        const beat = 0.5 + 0.5 * Math.sin(nowMs / 260);
        // A soft glow under the drone badge, no ring: a ring made the drone look like one more stop.
        deps.sceneFor(at.x, at.y, a);
        pushBead(a.sceneX, a.surfaceY + RISE, a.sceneZ, CYAN, 1.6 + 0.3 * beat);
        if (state.zoom < SCOUT_DRONE_BADGE_MAX_ZOOM) droneBadge.place(a.sceneX, a.surfaceY + RISE, a.sceneZ);
      }
    }
    // What the drone spots as it flies pops over the map, with a quick gold ring on the spot (client-scout-drone-finds.ts).
    // Expired pops leave the list, so an idle map does no pop work at all.
    if (state.scoutFindPops.length > 0 && state.scoutFindPops.every((pop) => nowMs - pop.at >= SCOUT_FIND_POP_MS)) state.scoutFindPops = [];
    findPops.sync(state.scoutFindPops, nowMs);
    for (const pop of state.scoutFindPops) {
      const t = (nowMs - pop.at) / 700;
      if (t >= 0 && t < 1) pushRing(pop, tint.copy(BRASS).multiplyScalar(1 - t), 0.8 + 0.9 * t);
    }
    // The find a report-card chip framed keeps a breathing gold ring while the card is up.
    // Only while the card itself is up: the ring and pin stayed on the map after the card timed out (review 2026-11-21).
    const focusFind = state.scoutFindFocus;
    if (focusFind && scoutReportCardVisible(state, nowMs)) {
      pushRing(focusFind, BRASS, 1.8 + 0.2 * Math.sin(nowMs / 240));
      deps.sceneFor(focusFind.x, focusFind.y, a);
      findPin.place(a.sceneX, a.surfaceY + RISE + 0.15 * Math.abs(Math.sin(nowMs / 300)), a.sceneZ);
    }
    // The main find of a fresh landing report gets a short gold burst (player review 2026-11-21: the new
    // land felt uncovered, not discovered). No marker otherwise: the owner had the "tap here" one removed.
    const report = state.scoutDroneReport;
    const sinceLanding = report ? nowMs - report.at : Infinity;
    if (report && sinceLanding >= 0 && sinceLanding < LANDING_BURST_MS && !plan.active) {
      const focus = { x: report.focusX ?? report.targetX, y: report.focusY ?? report.targetY };
      for (let k = 0; k < 2; k += 1) {
        const t = ((sinceLanding / 1_000 + k * 0.5) % 1 + 1) % 1;
        pushRing(focus, tint.copy(BRASS).multiplyScalar(1 - t), 1 + 1.2 * t);
      }
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
      numbers.dispose();
      droneBadge.dispose();
      findPin.dispose();
      findPops.dispose();
      beadGeometry.dispose();
      beadMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      glow?.dispose();
    }
  };
};
