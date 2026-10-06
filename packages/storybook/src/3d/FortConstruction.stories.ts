import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFortOverlay } from "@client/client-map-3d-fort-overlay.js";
import { constructionSiteForTile } from "@client/client-construction-phase/client-construction-phase.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { addStoryAfc, withStoryAfc } from "./construction-story-afc.js";

// Fort construction (docs/construction-animation-plan.md, follow-up 2): the real
// overlay driven by a virtual build window. A fresh build (or a removal) has the walls
// and corner towers rise from the ground in four bands; an upgrade keeps the standing
// tier at full height (it is still defending) and only adds scaffold, crates and crew.
type FortKind = "WOODEN_FORT" | "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION";
type Args = { kind: FortKind; hours: number; progress: number; mode: "build" | "remove" | "upgrade"; cameraDistance: number };

const HOUR_MS = 3_600_000;
const UPGRADE_FROM: Record<FortKind, string | undefined> = { WOODEN_FORT: undefined, FORT: "WOODEN_FORT", TITANIUM_BASTION: "FORT", THUNDER_BASTION: "TITANIUM_BASTION" };

const tileAtProgress = (args: Args, progress: number): Tile => {
  const durationMs = args.hours * HOUR_MS;
  const startedAt = Date.now() - progress * durationMs;
  return {
    x: 3,
    y: 5,
    terrain: "LAND",
    fort: {
      ownerId: "me",
      variant: args.kind,
      status: args.mode === "remove" ? "removing" : "under_construction",
      ...(args.mode === "upgrade" ? { upgradingFrom: UPGRADE_FROM[args.kind] ?? "WOODEN_FORT" } : {}),
      startedAt,
      completesAt: startedAt + durationMs
    }
  } as unknown as Tile;
};

type Entry = { x: number; progress: number | undefined };

const layout = (overlay: ReturnType<typeof createFortOverlay>, args: Args, entries: ReadonlyArray<Entry>): void => {
  overlay.clear();
  entries.forEach((entry, i) => {
    const tile = entry.progress === undefined ? undefined : tileAtProgress(args, entry.progress);
    const site = tile ? withStoryAfc(constructionSiteForTile(tile, Date.now(), "fort"), entry.x, 0) : undefined;
    // Upgrade: the standing tier is what is drawn; otherwise the tier being built.
    const kind = args.mode === "upgrade" && site ? ((tile?.fort?.upgradingFrom as FortKind | undefined) ?? "WOODEN_FORT") : args.kind;
    overlay.addInstance(entry.x, 0, 0, kind, "CLOSED", i, 0, 0, site ? { site, keepStanding: args.mode === "upgrade" } : undefined);
  });
  overlay.commit();
};

const loop = (overlay: ReturnType<typeof createFortOverlay>, onFrame?: (now: number) => void): (() => void) => {
  let raf = 0;
  const tick = (now: number): void => {
    onFrame?.(now);
    overlay.tick(now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};

const phases = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, background: "#1b1d22" });
  const ground = createGrassGround(8);
  stage.scene.add(ground.group);
  const overlay = createFortOverlay(stage.scene, 8);
  const progresses = [0.05, 0.3, 0.55, 0.8, undefined];
  layout(overlay, args, progresses.map((progress, i) => ({ x: (i - 2) * 1.4, progress })));
  const stop = loop(overlay);
  return wrapWithCleanup(stage, [stop, overlay.dispose, ground.dispose]);
};

const scrub = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, background: "#1b1d22" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);
  const overlay = createFortOverlay(stage.scene, 2);
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
    const site = constructionSiteForTile(tileAtProgress(args, progress), Date.now(), "fort");
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
  const root = wrapWithCleanup(stage, [stop, overlay.dispose, ground.dispose, afc.dispose]);
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#eee;font:700 13px system-ui,sans-serif;";
  bar.append(play, slider, label);
  root.style.position = "relative";
  root.appendChild(bar);
  return root;
};

const meta: Meta<Args> = {
  title: "3D Library/FortConstruction",
  argTypes: {
    kind: { control: "select", options: ["WOODEN_FORT", "FORT", "TITANIUM_BASTION", "THUNDER_BASTION"] },
    hours: { control: { type: "range", min: 1, max: 24, step: 1 } },
    progress: { control: { type: "range", min: 0, max: 0.999, step: 0.01 } },
    mode: { control: "inline-radio", options: ["build", "remove", "upgrade"] },
    cameraDistance: { control: { type: "range", min: 3, max: 16, step: 0.5 } }
  },
  args: { kind: "FORT", hours: 6, progress: 0.3, mode: "build", cameraDistance: 8 }
};

export default meta;
type Story = StoryObj<Args>;

/** Left to right: 5%, 30%, 55%, 80% built, then the finished fort. */
export const Phases: Story = { render: phases };
/** Scrub or play one fort through its whole build window. */
export const Scrub: Story = { render: scrub, args: { cameraDistance: 4.5 } };
/** The standing tier stays at full height while an upgrade is worked on around it. */
export const Upgrade: Story = { render: phases, args: { mode: "upgrade", kind: "FORT" } };
export const Removal: Story = { render: phases, args: { mode: "remove" } };
