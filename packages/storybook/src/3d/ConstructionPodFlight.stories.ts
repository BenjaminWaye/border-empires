import type { Meta, StoryObj } from "@storybook/html-vite";
import { createConstructionPodFxLayer } from "@client/client-map-3d-construction/client-map-3d-construction-pod-fx.js";
import { planPodFlight } from "@client/client-map-3d-construction/client-map-3d-construction-pod-flight.js";
import { createConstructionCrewLayer } from "@client/client-map-3d-construction/client-map-3d-construction-crew.js";
import { DEFAULT_CONSTRUCTION_LAYOUT, stackCenterFor } from "@client/client-map-3d-construction/client-map-3d-construction-layout.js";
import type { ConstructionSite } from "@client/client-construction-phase/client-construction-phase.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { addStoryAfc, STORY_AFC_POSITION } from "./construction-story-afc.js";

// The parts delivery (docs/construction-animation-plan.md): the AFC prints the pod in its glass
// chamber, its courier drone winches it up out of the crown, flies it slung on its line to the build
// site, winches it down onto the parts stack and flies home to dock, while the pod unfolds and
// leaves the new phase's crates. Nothing comes from orbit. The slider scrubs the whole sequence so
// each beat can be tuned; Replay runs it in real time, and the stack beside it is the real crate
// layer, empty until the pod sets its crates down.
type Args = { distance: number; cameraDistance: number; slowMotion: number };

const HOUR = 3_600_000;
const storySite = (): ConstructionSite => ({
  x: 0,
  y: 0,
  afcOffset: undefined,
  direction: "build",
  field: "economicStructure",
  structureType: "ORE_REFINERY",
  ownerId: "me",
  fraction: 0.25,
  visibleBands: 2,
  phase: 1,
  startedAtMs: Date.now() - 2 * HOUR, // a fresh phase: a full stack
  completesAtMs: Date.now() + 6 * HOUR,
  crew: 6,
  stalled: false,
  nextPhaseAtMs: undefined
});

const flightScrub = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.8, background: "#1b1d22" });
  const ground = createGrassGround(10);
  stage.scene.add(ground.group);
  const pods = createConstructionPodFxLayer(stage.scene);
  const crew = createConstructionCrewLayer(stage.scene);
  crew.add(0, 0, 0, storySite());
  // The site is the origin; the pod launches from the AFC at the offset from the stack to it.
  const stack = stackCenterFor(DEFAULT_CONSTRUCTION_LAYOUT);
  const scale = args.distance / Math.hypot(STORY_AFC_POSITION.x, STORY_AFC_POSITION.z);
  const afcX = STORY_AFC_POSITION.x * scale;
  const afcZ = STORY_AFC_POSITION.z * scale;
  const storyAfc = addStoryAfc(stage.scene, { x: afcX, z: afcZ });
  const from = { dx: afcX - stack.x, dz: afcZ - stack.z };
  const plan = planPodFlight(from.dx, from.dz);
  const totalMs = plan.endAtMs + 400;

  let scrubMs: number | null = null;
  let clockStart = performance.now();
  const label = document.createElement("span");
  const slider = document.createElement("input");
  let raf = 0;
  const tick = (): void => {
    const now = performance.now();
    storyAfc.update(now);
    const age = scrubMs ?? Math.min((now - clockStart) / args.slowMotion, totalMs);
    // The layer measures age from the spawn time: re-spawn every frame at `now - age`, so the
    // slider and slow motion can move the clock freely.
    pods.clear();
    pods.spawn("0,0", stack.x, stack.z, 0, now - age, from);
    pods.update(now);
    crew.update(Date.now(), (key) => pods.awaitingDelivery(key, now));
    const snap = pods.snapshot(now)[0];
    label.textContent = `${(age / 1000).toFixed(2)} s · pod ${snap?.stage ?? "done"} · drone ${snap?.droneStage ?? "done"}`;
    if (scrubMs === null) slider.value = String(age);
    raf = requestAnimationFrame(tick);
  };

  const root = wrapWithCleanup(stage, [() => cancelAnimationFrame(raf), pods.dispose, crew.dispose, storyAfc.dispose, ground.dispose]);
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#d8f4ff;font:700 13px system-ui,sans-serif;";
  const replay = document.createElement("button");
  replay.type = "button";
  replay.textContent = "Replay";
  replay.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid #888;background:#2a2d33;color:#eee;cursor:pointer;";
  replay.addEventListener("click", () => { scrubMs = null; clockStart = performance.now(); });
  slider.type = "range"; slider.min = "0"; slider.max = String(totalMs); slider.value = "0"; slider.style.cssText = "flex:1;";
  slider.addEventListener("input", () => { scrubMs = Number(slider.value); });
  slider.addEventListener("change", () => { if (scrubMs === null) return; clockStart = performance.now() - scrubMs * args.slowMotion; scrubMs = null; });
  bar.append(replay, slider, label);
  root.style.position = "relative";
  root.appendChild(bar);
  tick();
  return root;
};

const meta: Meta<Args> = {
  title: "3D Library/ConstructionPodFlight",
  argTypes: {
    distance: { control: { type: "range", min: 1.5, max: 14, step: 0.5 } },
    cameraDistance: { control: { type: "range", min: 4, max: 22, step: 1 } },
    slowMotion: { control: { type: "range", min: 1, max: 8, step: 0.5 } }
  },
  args: { distance: 5.7, cameraDistance: 11, slowMotion: 1 }
};

export default meta;
type Story = StoryObj<Args>;

/** The AFC's drone carries a pod to the site's parts stack (centre) and flies home. Scrub the slider or press Replay. */
export const Flight: Story = { render: flightScrub };
/** The same flight at quarter speed, closer in, to read each beat. */
export const SlowMotion: Story = { render: flightScrub, args: { slowMotion: 4, cameraDistance: 8 } };
