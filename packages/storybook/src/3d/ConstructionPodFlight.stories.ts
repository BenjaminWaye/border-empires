import type { Meta, StoryObj } from "@storybook/html-vite";
import { createConstructionPodFxLayer } from "@client/client-map-3d-construction/client-map-3d-construction-pod-fx.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { addStoryAfc, STORY_AFC_POSITION } from "./construction-story-afc.js";

// The parts pod (docs/construction-animation-plan.md): fabricated at the owner's AFC and flown in an
// arc to the build site's parts stack. Nothing comes from orbit. The slider scrubs the flight so the
// arc, trail and the launch and landing flashes can be tuned; Replay runs it in real time.
type Args = { distance: number; cameraDistance: number };

const flightScrub = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.8, background: "#1b1d22" });
  const ground = createGrassGround(10);
  stage.scene.add(ground.group);
  const afc = addStoryAfc(stage.scene);
  const pods = createConstructionPodFxLayer(stage.scene);
  // The site is the origin; the pod launches from the AFC at the offset from the site to it.
  const from = { dx: STORY_AFC_POSITION.x * (args.distance / 5.7), dz: STORY_AFC_POSITION.z * (args.distance / 5.7) };

  const TOTAL_MS = 4_000;
  let scrubMs: number | null = null;
  let startedAt = performance.now();
  let spawnedFor = -1;
  const label = document.createElement("span");
  let raf = 0;
  const tick = (): void => {
    const now = performance.now();
    afc.update(now);
    const age = scrubMs ?? Math.min(now - startedAt, TOTAL_MS);
    // The layer takes `now - startedAt` as the age: re-spawn on a fresh clock whenever the story's clock moves backwards.
    if (spawnedFor < 0 || scrubMs !== null) {
      pods.clear();
      pods.spawn("story", 0, 0, 0, now - age, from);
      spawnedFor = 1;
    }
    pods.update(now);
    label.textContent = `${(age / 1000).toFixed(2)} s`;
    raf = requestAnimationFrame(tick);
  };
  tick();

  const root = wrapWithCleanup(stage, [() => cancelAnimationFrame(raf), pods.dispose, afc.dispose, ground.dispose]);
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#d8f4ff;font:700 13px system-ui,sans-serif;";
  const replay = document.createElement("button");
  replay.type = "button";
  replay.textContent = "Replay";
  replay.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid #888;background:#2a2d33;color:#eee;cursor:pointer;";
  replay.addEventListener("click", () => { scrubMs = null; startedAt = performance.now(); spawnedFor = -1; });
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = String(TOTAL_MS); slider.value = "0"; slider.style.cssText = "flex:1;";
  slider.addEventListener("input", () => { scrubMs = Number(slider.value); });
  slider.addEventListener("change", () => { if (scrubMs === null) return; startedAt = performance.now() - scrubMs; scrubMs = null; spawnedFor = -1; });
  bar.append(replay, slider, label);
  root.style.position = "relative";
  root.appendChild(bar);
  return root;
};

const meta: Meta<Args> = {
  title: "3D Library/ConstructionPodFlight",
  argTypes: {
    distance: { control: { type: "range", min: 1, max: 14, step: 0.5 } },
    cameraDistance: { control: { type: "range", min: 6, max: 22, step: 1 } }
  },
  args: { distance: 5.7, cameraDistance: 11 }
};

export default meta;
type Story = StoryObj<Args>;

/** A pod flies from the AFC to the site's parts stack (centre). Scrub the slider or press Replay. */
export const Flight: Story = { render: flightScrub };
