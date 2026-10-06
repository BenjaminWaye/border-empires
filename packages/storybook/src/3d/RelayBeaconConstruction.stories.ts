import type { Meta, StoryObj } from "@storybook/html-vite";
import { createRelayBeaconOverlay } from "@client/client-map-3d-relay-beacon-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { constructionSiteForTile } from "@client/client-construction-phase/client-construction-phase.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { addStoryAfc, withStoryAfc } from "./construction-story-afc.js";

// Relay Beacon under construction (docs/construction-animation-plan.md,
// follow-up 1): the real overlay driven by a virtual build window. The lattice
// legs, column and spindle grow band by band, the heliograph array only appears
// in the last phase, and the scaffold, parts stack and crew surround it.
type Args = { hours: number; progress: number; direction: "build" | "remove"; cameraDistance: number };

const HOUR_MS = 3_600_000;

const tileAtProgress = (hours: number, progress: number, direction: "build" | "remove"): Tile => {
  const durationMs = hours * HOUR_MS;
  const startedAt = Date.now() - progress * durationMs;
  return {
    x: 3,
    y: 5,
    terrain: "LAND",
    economicStructure: {
      ownerId: "me",
      type: "RELAY_BEACON",
      status: direction === "build" ? "under_construction" : "removing",
      startedAt,
      completesAt: startedAt + durationMs
    }
  } as unknown as Tile;
};

type Entry = { x: number; progress: number | undefined };

const layout = (overlay: ReturnType<typeof createRelayBeaconOverlay>, args: Args, entries: ReadonlyArray<Entry>): void => {
  overlay.clear();
  entries.forEach((entry, i) => {
    const site = entry.progress === undefined ? undefined : withStoryAfc(constructionSiteForTile(tileAtProgress(args.hours, entry.progress, args.direction), Date.now(), "economicStructure"), entry.x, 0);
    overlay.addInstance(entry.x, 0, 0, i, 0, false, site);
  });
  overlay.commit();
};

const loop = (overlay: ReturnType<typeof createRelayBeaconOverlay>, onFrame?: (now: number) => void): (() => void) => {
  let raf = 0;
  const tick = (now: number): void => {
    onFrame?.(now);
    overlay.update(now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};

const phases = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, background: "#1b1d22" });
  const ground = createGrassGround(8);
  stage.scene.add(ground.group);
  const shadows = createContactShadowOverlay(stage.scene, 8);
  const overlay = createRelayBeaconOverlay(stage.scene, 8);
  const progresses = [0.05, 0.3, 0.55, 0.8, undefined];
  layout(overlay, args, progresses.map((progress, i) => ({ x: (i - 2) * 1.6, progress })));
  const stop = loop(overlay);
  return wrapWithCleanup(stage, [stop, overlay.dispose, shadows.dispose, ground.dispose]);
};

const scrub = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, background: "#1b1d22" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);
  const shadows = createContactShadowOverlay(stage.scene, 2);
  const overlay = createRelayBeaconOverlay(stage.scene, 2);
  const afc = addStoryAfc(stage.scene); // where the phase pods fly from
  let progress = args.progress;
  let playing = false;
  let lastFrame = 0;
  const label = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "0.999"; slider.step = "0.001"; slider.value = String(progress);
  slider.style.cssText = "flex:1;";
  const refresh = (): void => {
    layout(overlay, args, [{ x: 0, progress }]);
    const site = constructionSiteForTile(tileAtProgress(args.hours, progress, args.direction), Date.now(), "economicStructure");
    label.textContent = `${(progress * args.hours).toFixed(1)}h / ${args.hours}h  -  phase ${(site?.phase ?? 0) + 1}/4`;
    slider.value = String(progress);
  };
  slider.addEventListener("input", () => { progress = Number(slider.value); refresh(); });
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "Play (1 build-hour / second)";
  play.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid #888;background:#2a2d33;color:#eee;cursor:pointer;";
  play.addEventListener("click", () => { playing = !playing; play.textContent = playing ? "Pause" : "Play (1 build-hour / second)"; });
  const stop = loop(overlay, (now) => {
    afc.update(now);
    const dt = lastFrame === 0 ? 0 : now - lastFrame;
    lastFrame = now;
    if (!playing) return;
    progress += dt / 1000 / args.hours;
    if (progress >= 0.999) progress = 0;
    refresh();
  });
  refresh();
  const root = wrapWithCleanup(stage, [stop, overlay.dispose, shadows.dispose, ground.dispose, afc.dispose]);
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#eee;font:700 13px system-ui,sans-serif;";
  bar.append(play, slider, label);
  root.style.position = "relative";
  root.appendChild(bar);
  return root;
};

const meta: Meta<Args> = {
  title: "3D Library/RelayBeaconConstruction",
  argTypes: {
    hours: { control: { type: "range", min: 1, max: 24, step: 1 } },
    progress: { control: { type: "range", min: 0, max: 0.999, step: 0.01 } },
    direction: { control: "inline-radio", options: ["build", "remove"] },
    cameraDistance: { control: { type: "range", min: 3, max: 16, step: 0.5 } }
  },
  args: { hours: 6, progress: 0.3, direction: "build", cameraDistance: 8 }
};

export default meta;
type Story = StoryObj<Args>;

/** Left to right: 5%, 30%, 55%, 80% built, then the finished beacon. */
export const Phases: Story = { render: phases };
/** Scrub or play one beacon through its whole build window. */
export const Scrub: Story = { render: scrub, args: { cameraDistance: 5 } };
export const Removal: Story = { render: phases, args: { direction: "remove" } };
