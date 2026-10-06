import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructureOverlay, type StructureKind } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { constructionSiteForTile } from "@client/client-construction-phase/client-construction-phase.js";
import { drawConstructionStructure2D } from "@client/client-construction-2d/client-construction-2d.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { addStoryAfc, withStoryAfc } from "./construction-story-afc.js";

// Construction animation (docs/construction-animation-plan.md). Structures take
// 1h to many hours to build, so construction reads as discrete height bands
// (foundation -> frame -> cladding -> fit-out), a scaffold cage, a parts stack
// that shrinks as the crew uses it, and the settle-style ancillary crew. This story
// shows the real overlay code driven by a virtual build window, so the phases
// can be scrubbed (or played at speed) instead of waited for.
type Args = {
  kind: StructureKind;
  hours: number;
  progress: number;
  direction: "build" | "remove";
  cameraDistance: number;
};

const KINDS: ReadonlyArray<StructureKind> = ["AETHER_TOWER", "WORLD_ENGINE", "FARMSTEAD", "WATERWORKS", "MINE", "GRANARY", "FOUNDRY", "ADVANCED_TITANIUM_WORKS", "CLEARING_HOUSE", "CUSTOMS_HOUSE", "GARRISON_HALL", "RADAR_SYSTEM", "AIRPORT", "WEAPONS_WORKSHOP"];
const HOUR_MS = 3_600_000;

// A tile whose in-flight record spans a virtual window positioned so that
// `progress` of it has elapsed right now.
const tileAtProgress = (kind: StructureKind, hours: number, progress: number, direction: "build" | "remove"): Tile => {
  const durationMs = hours * HOUR_MS;
  const startedAt = Date.now() - progress * durationMs;
  return {
    x: 3,
    y: 5,
    terrain: "LAND",
    economicStructure: {
      ownerId: "me",
      type: kind,
      status: direction === "build" ? "under_construction" : "removing",
      startedAt,
      completesAt: startedAt + durationMs
    }
  } as unknown as Tile;
};

const layout = (
  overlay: ReturnType<typeof createStructureOverlay>,
  contactShadows: ReturnType<typeof createContactShadowOverlay>,
  entries: ReadonlyArray<{ x: number; kind: StructureKind; tile: Tile | undefined }>
): void => {
  overlay.clear();
  contactShadows.clear();
  for (const { x, kind, tile } of entries) {
    const site = tile ? withStoryAfc(constructionSiteForTile(tile, Date.now()), x, 0) : undefined;
    overlay.addInstance(x, 0, 0, kind, undefined, site);
  }
  overlay.commit();
  contactShadows.commit();
};

const startLoop = (overlay: ReturnType<typeof createStructureOverlay>, onFrame?: (now: number) => void): (() => void) => {
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
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.7, background: "#1b1d22" });
  const ground = createGrassGround(8);
  stage.scene.add(ground.group);
  const contactShadows = createContactShadowOverlay(stage.scene, 8);
  const overlay = createStructureOverlay(stage.scene, 8, contactShadows);
  const steps = [0.05, 0.3, 0.55, 0.8, undefined];
  const entries = steps.map((p, i) => ({
    x: (i - 2) * 1.5,
    kind: args.kind,
    tile: p === undefined ? undefined : tileAtProgress(args.kind, args.hours, p, args.direction)
  }));
  layout(overlay, contactShadows, entries);
  const stop = startLoop(overlay);
  return wrapWithCleanup(stage, [stop, overlay.dispose, contactShadows.dispose, ground.dispose]);
};

const scrub = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.7, background: "#1b1d22" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);
  const contactShadows = createContactShadowOverlay(stage.scene, 2);
  const overlay = createStructureOverlay(stage.scene, 2, contactShadows);
  const afc = addStoryAfc(stage.scene); // where the phase pods fly from

  let progress = args.progress;
  let playing = false;
  let lastFrame = 0;
  const label = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "0.999";
  slider.step = "0.001";
  slider.value = String(progress);
  slider.style.cssText = "flex:1;";

  const refresh = (): void => {
    const tile = tileAtProgress(args.kind, args.hours, progress, args.direction);
    const site = withStoryAfc(constructionSiteForTile(tile, Date.now()), 0, 0)!;
    layout(overlay, contactShadows, [{ x: 0, kind: args.kind, tile }]);
    label.textContent = `${(progress * args.hours).toFixed(1)}h / ${args.hours}h  -  phase ${site.phase + 1}/4`;
    slider.value = String(progress);
  };

  slider.addEventListener("input", () => { progress = Number(slider.value); refresh(); });
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "Play (1 build-hour / second)";
  play.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid #888;background:#2a2d33;color:#eee;cursor:pointer;";
  play.addEventListener("click", () => { playing = !playing; play.textContent = playing ? "Pause" : "Play (1 build-hour / second)"; });

  const stop = startLoop(overlay, (now) => {
    afc.update(now);
    const dt = lastFrame === 0 ? 0 : now - lastFrame;
    lastFrame = now;
    if (!playing) return;
    progress += (dt / 1000) / args.hours;
    if (progress >= 0.999) progress = 0;
    refresh();
  });
  refresh();

  const root = wrapWithCleanup(stage, [stop, overlay.dispose, contactShadows.dispose, ground.dispose, afc.dispose]);
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#eee;font:700 13px system-ui,sans-serif;";
  bar.append(play, slider, label);
  root.style.position = "relative";
  root.appendChild(bar);
  return root;
};

// The accessibility-fallback 2D renderer: the same phases/crates/crew drawn on
// a canvas. A stand-in sprite is painted procedurally (the game uses real
// structure art), then the real drawConstructionStructure2D runs on it.
const twoD = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText = "background:#2c3a2a;padding:16px;color:#eee;font:700 13px system-ui,sans-serif;";
  const sprite = document.createElement("canvas");
  sprite.width = 128;
  sprite.height = 128;
  const sctx = sprite.getContext("2d")!;
  sctx.fillStyle = "#6a5a4a"; sctx.fillRect(24, 56, 80, 56);
  sctx.fillStyle = "#8a3b2b"; sctx.beginPath(); sctx.moveTo(16, 56); sctx.lineTo(64, 14); sctx.lineTo(112, 56); sctx.fill();
  sctx.fillStyle = "#e8c36a"; sctx.fillRect(52, 78, 24, 34);
  const image = new Image();
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 220;
  canvas.style.cssText = "display:block;background:#46603c;image-rendering:pixelated;";
  const label = document.createElement("div");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "0.999"; slider.step = "0.001"; slider.value = String(args.progress);
  slider.style.cssText = "width:640px;display:block;margin:8px 0;";
  root.append(canvas, slider, label);
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  // Stop once the story has been shown and then detached; tolerate the window
  // before Storybook has attached `root` (a plain "is it connected" check would
  // stop the loop before it ever started).
  let wasConnected = false;
  const draw = (now: number): void => {
    if (root.isConnected) wasConnected = true;
    else if (wasConnected) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const progress = Number(slider.value);
    const sizes = [24, 48, 96];
    let x = 12;
    for (const size of sizes) {
      const tile = tileAtProgress(args.kind, args.hours, progress, args.direction);
      const site = constructionSiteForTile(tile, Date.now());
      if (site) drawConstructionStructure2D(ctx, image, x, 110 - size / 2, size, 1.08, site, Date.now());
      x += size + 40;
    }
    label.textContent = `${(progress * args.hours).toFixed(1)}h / ${args.hours}h  (tile sizes 24 / 48 / 96 px)`;
    raf = requestAnimationFrame(draw);
  };
  image.onload = () => { raf = requestAnimationFrame(draw); };
  image.src = sprite.toDataURL();
  return root;
};

const meta: Meta<Args> = {
  title: "3D Library/ConstructionSite",
  argTypes: {
    kind: { control: "select", options: KINDS as unknown as string[] },
    hours: { control: { type: "range", min: 1, max: 24, step: 1 } },
    progress: { control: { type: "range", min: 0, max: 0.999, step: 0.01 } },
    direction: { control: "inline-radio", options: ["build", "remove"] },
    cameraDistance: { control: { type: "range", min: 3, max: 16, step: 0.5 } }
  },
  args: { kind: "FOUNDRY", hours: 8, progress: 0.1, direction: "build", cameraDistance: 8 }
};

export default meta;
type Story = StoryObj<Args>;

/** Left to right: 5%, 30%, 55%, 80% built, then the finished structure. */
export const Phases: Story = { render: phases };
/** Scrub or play one site through its whole build window. */
export const Scrub: Story = { render: scrub, args: { cameraDistance: 5 } };
/** The 2D canvas fallback: bottom-up fill, dashed outline, crates and crew dots. */
export const Canvas2D: Story = { render: twoD, args: { progress: 0.4 } };
export const Removal: Story = { render: phases, args: { direction: "remove" } };
