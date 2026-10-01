import type { Meta, StoryObj } from "@storybook/html-vite";
import { Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createAfcDropFxLayer } from "@client/client-map-3d-afc-drop-fx/client-map-3d-afc-drop-fx.js";
import { AFC_JOIN_DESCENT_MS, AFC_JOIN_TOTAL_MS } from "@client/client-afc-join-drop/client-afc-join-drop-timeline.js";
import { glintStage } from "./FabricationComplex.stories.js";
import { wrapWithCleanup } from "../three-stage.js";

// The real join-time drop, built from production code: createAfcDropFxLayer is
// the actual FX layer client-map-3d.ts runs (docs/manifest-afc-module-delivery-animation-plan.md,
// "Join drop"), and the AFC that takes over at touchdown is the same
// createFabricationComplexOverlay the game uses. In the game the real AFC is
// hidden until touchdown and revealed then; this story mirrors that by
// showing it only once the timeline passes AFC_JOIN_DESCENT_MS.
//
// The story owns the clock so the pacing can be tuned deliberately: it plays
// in real time by default, and the slider scrubs to any moment of the
// sequence (the drag pauses playback).
type DropControls = { replay: () => void; scrubTo: (ms: number) => void; resume: () => void };

const buildScene = (scene: Scene, onTime: (ms: number) => void): { cleanups: (() => void)[]; controls: DropControls } => {
  const afc = createFabricationComplexOverlay(scene, 1);
  const dropFx = createAfcDropFxLayer(scene);
  let startedAt = performance.now();
  let scrubMs: number | null = null;
  let afcShown = false;
  const timelineMs = (now: number): number => scrubMs ?? Math.min(now - startedAt, AFC_JOIN_TOTAL_MS + 200);

  const spawn = (): void => {
    dropFx.clear();
    dropFx.spawn(0, 0, 0, startedAt);
  };

  let rafId = 0;
  const tick = (): void => {
    const now = performance.now();
    const t = timelineMs(now);
    // The layer treats `nowMs - startedAt` as the age, so feeding startedAt + t scrubs it.
    if (scrubMs !== null && t < AFC_JOIN_TOTAL_MS) {
      dropFx.clear();
      dropFx.spawn(0, 0, 0, now - t);
    }
    dropFx.update(scrubMs !== null ? now : startedAt + t);
    const shouldShowAfc = t >= AFC_JOIN_DESCENT_MS;
    if (shouldShowAfc !== afcShown) {
      afcShown = shouldShowAfc;
      afc.clear();
      if (afcShown) afc.addInstance(0, 0, 0, 5, 5);
      afc.commit();
    }
    afc.update(now);
    onTime(t);
    rafId = requestAnimationFrame(tick);
  };
  spawn();
  tick();

  return {
    cleanups: [() => cancelAnimationFrame(rafId), afc.dispose, dropFx.dispose],
    controls: {
      replay: () => {
        scrubMs = null;
        startedAt = performance.now();
        spawn();
      },
      scrubTo: (ms) => { scrubMs = ms; },
      resume: () => {
        if (scrubMs === null) return;
        startedAt = performance.now() - scrubMs;
        scrubMs = null;
        spawn();
      }
    }
  };
};

const meta: Meta = {
  title: "3D Library/AfcDropFx",
  parameters: {
    docs: {
      description: {
        component:
          "The slow, deliberate join-time AFC drop: an AFC falls out of orbit in a re-entry streak, lights a braking burn and settles to a standstill, then lands in a flash, shockwave and smoke bank with a cyan power-on swell. In the game it only plays once the map is unobstructed. Click Replay to run it again, or drag the slider to scrub."
      }
    }
  },
  render: () => {
    const stage = glintStage({ cameraDistance: 15, cameraTilt: 0.75 });
    const label = document.createElement("span");
    const { cleanups, controls } = buildScene(stage.scene, (ms) => { label.textContent = `${(ms / 1000).toFixed(1)} s`; });
    const root = wrapWithCleanup(stage, cleanups);

    const bar = document.createElement("div");
    bar.style.cssText = "position:absolute;top:12px;left:12px;right:12px;z-index:10;display:flex;gap:12px;align-items:center;color:#ffe6b8;font:700 13px system-ui,sans-serif;";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Replay drop";
    button.style.cssText =
      "padding:8px 16px;border-radius:8px;border:1px solid rgba(255,214,148,0.5);background:linear-gradient(180deg,rgba(255,214,148,0.22),rgba(214,150,68,0.14));color:#ffe6b8;font:700 13px system-ui,sans-serif;cursor:pointer;";
    button.addEventListener("click", controls.replay);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(AFC_JOIN_TOTAL_MS);
    slider.value = "0";
    slider.style.cssText = "flex:1;";
    slider.addEventListener("input", () => controls.scrubTo(Number(slider.value)));
    slider.addEventListener("change", controls.resume);
    bar.append(button, slider, label);
    root.style.position = "relative";
    root.appendChild(bar);
    return root;
  }
};

export default meta;
type Story = StoryObj;

export const Drop: Story = {};
