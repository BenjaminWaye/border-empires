import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, type Material } from "three";
import { planScoutDroneFlight, scoutDroneStepIndexAt, SCOUT_DRONE_VISION_RADIUS, type ScoutDroneFlight } from "@border-empires/shared";
import { createScoutDroneOverlay, syncScoutDroneOverlayFrame } from "@client/client-map-3d-scout-drone/client-map-3d-scout-drone-overlay.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";
import { addStoryAfc } from "../../fixtures/construction-afc.js";

// Explore (docs/explore-scout-plan.md): the player's scout drone leaves the AFC, flies east across
// its own land and out over unexplored ground, lifting the fog in a radius-3 ring around itself,
// until a rival's border turns it back. The tiles are a stand-in for the map: the player's land
// (gold), the rival's (red), ground the drone has seen (grass) and unexplored ground (dark). The
// drone, its scan cone, vision ring and dashed route are the real overlay
// (client-map-3d-scout-drone/). `progress` scrubs the flight; `play` runs it 20x faster than the
// game.
type Args = { progress: number; play: boolean; follow: boolean; cameraDistance: number; cameraTilt: number };

const GRID_W = 30;
const GRID_H = 16;
const AFC_TILE = { x: 3, y: 8 };
const OWN_RADIUS = 4;
const RIVAL_FROM_X = 23;
const TARGET = { x: 27, y: 5 };
const WORLD = { width: 64, height: 32 };
const SPEED_UP = 20;

const isOwn = (x: number, y: number): boolean => Math.max(Math.abs(x - AFC_TILE.x), Math.abs(y - AFC_TILE.y)) <= OWN_RADIUS;
const isRival = (x: number): boolean => x >= RIVAL_FROM_X;
const sceneX = (x: number): number => x - GRID_W / 2 + 0.5;
const sceneZ = (y: number): number => y - GRID_H / 2 + 0.5;

const storyFlight = (): ScoutDroneFlight =>
  planScoutDroneFlight(AFC_TILE, TARGET, 0, {
    ...WORLD,
    classify: (x, y) => (isOwn(x, y) ? { kind: "HOME" } : isRival(x) ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" })
  }) as ScoutDroneFlight;

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#0d1218", bloom: true, width: 1280, height: 720 });
  const flight = storyFlight();
  const duration = flight.landsAt - flight.launchedAt;

  // The tile board: one plane per tile, recoloured as the fog lifts.
  const geometry = new PlaneGeometry(0.96, 0.96);
  const materials = {
    grass: new MeshStandardMaterial({ color: "#5d8a3a", roughness: 0.95 }),
    grassDark: new MeshStandardMaterial({ color: "#52803a", roughness: 0.95 }),
    own: new MeshStandardMaterial({ color: "#b08a3a", roughness: 0.9 }),
    rival: new MeshStandardMaterial({ color: "#a2473f", roughness: 0.9 }),
    fog: new MeshBasicMaterial({ color: "#1b2129" })
  };
  const tiles: Array<{ x: number; y: number; mesh: Mesh }> = [];
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const mesh = new Mesh(geometry, materials.fog);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(sceneX(x), -0.01, sceneZ(y));
      stage.scene.add(mesh);
      tiles.push({ x, y, mesh });
    }
  }
  // Land the player already sees: their own, plus the usual radius-1 rim around it.
  const seenAtStart = (x: number, y: number): boolean => Math.max(Math.abs(x - AFC_TILE.x), Math.abs(y - AFC_TILE.y)) <= OWN_RADIUS + 1;
  const revealed = new Set<string>();
  const paint = (nowMs: number): void => {
    revealed.clear();
    const index = scoutDroneStepIndexAt(flight, nowMs);
    for (let i = 0; i <= index; i += 1) {
      const step = flight.steps[i]!;
      for (let dy = -SCOUT_DRONE_VISION_RADIUS; dy <= SCOUT_DRONE_VISION_RADIUS; dy += 1) {
        for (let dx = -SCOUT_DRONE_VISION_RADIUS; dx <= SCOUT_DRONE_VISION_RADIUS; dx += 1) revealed.add(`${step.x + dx},${step.y + dy}`);
      }
    }
    for (const tile of tiles) {
      const seen = seenAtStart(tile.x, tile.y) || revealed.has(`${tile.x},${tile.y}`);
      tile.mesh.material = !seen
        ? materials.fog
        : isOwn(tile.x, tile.y)
          ? materials.own
          : isRival(tile.x)
            ? materials.rival
            : (tile.x + tile.y) % 2 === 0
              ? materials.grass
              : materials.grassDark;
    }
  };

  const afc = addStoryAfc(stage.scene, { x: sceneX(AFC_TILE.x), z: sceneZ(AFC_TILE.y) });
  const overlay = createScoutDroneOverlay(stage.scene);
  const sceneFor = (x: number, y: number) => ({ sceneX: sceneX(x), sceneZ: sceneZ(y), surfaceY: 0 });

  const label = document.createElement("div");
  label.style.cssText = "position:absolute;top:12px;left:12px;z-index:10;color:#d8f4ff;font:700 13px system-ui,sans-serif;text-shadow:0 1px 2px #000;";
  const clockStart = performance.now();
  let raf = 0;
  const tick = (): void => {
    const now = performance.now();
    afc.update(now);
    const flightMs = args.play ? ((now - clockStart) * SPEED_UP) % duration : args.progress * duration;
    const t = flight.launchedAt + flightMs;
    paint(t);
    // The overlay animates rotors and lights from its clock argument; give it real time plus the scrub.
    syncScoutDroneOverlayFrame(overlay, { ...flight, ...shiftFlight(flight, now - t) }, now, WORLD, sceneFor);
    if (args.follow) {
      const step = flight.steps[Math.max(0, scoutDroneStepIndexAt(flight, t))]!;
      const horizontal = Math.sin(args.cameraTilt) * args.cameraDistance;
      const vertical = Math.cos(args.cameraTilt) * args.cameraDistance;
      stage.camera.position.set(sceneX(step.x), vertical, sceneZ(step.y) + horizontal);
      stage.camera.lookAt(sceneX(step.x), 0.6, sceneZ(step.y));
    }
    const index = scoutDroneStepIndexAt(flight, t);
    label.textContent = `Scout drone · ${index >= flight.turnIndex ? "returning home" : "outbound"} · ${Math.round(flightMs / 1000)}s of ${Math.round(duration / 1000)}s · turned back by a rival border`;
    raf = requestAnimationFrame(tick);
  };
  tick();

  const root = wrapWithCleanup(stage, [
    () => cancelAnimationFrame(raf),
    overlay.dispose,
    afc.dispose,
    () => geometry.dispose(),
    () => Object.values(materials).forEach((m: Material) => m.dispose())
  ]);
  root.appendChild(label);
  return root;
};

// Moves every flight time by `offset` ms, so the overlay sees the scrubbed moment at real time.
const shiftFlight = (flight: ScoutDroneFlight, offset: number): Pick<ScoutDroneFlight, "launchedAt" | "landsAt" | "steps"> => ({
  launchedAt: flight.launchedAt + offset,
  landsAt: flight.landsAt + offset,
  steps: flight.steps.map((step) => ({ ...step, at: step.at + offset }))
});

const meta: Meta<Args> = {
  title: "Map/Overlays/Scout Drone",
  argTypes: {
    progress: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    cameraDistance: { control: { type: "range", min: 3, max: 40, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.1, max: 1.4, step: 0.05 } }
  },
  args: { progress: 0.4, play: false, follow: false, cameraDistance: 24, cameraTilt: 0.75 },
  render
};

export default meta;
type Story = StoryObj<Args>;
/** The whole board: AFC, the player's land, the fog lifting along the route, the rival border ahead. */
export const Overview: Story = {};
/** Close behind the drone as it scans unexplored ground. */
export const CloseUp: Story = { args: { progress: 0.33, follow: true, cameraDistance: 6.5, cameraTilt: 0.95 } };
/** Turned back at the rival's border and heading home. */
export const Returning: Story = { args: { progress: 0.62 } };
/** Plays the flight at 20x speed. */
export const Play: Story = { args: { play: true } };
