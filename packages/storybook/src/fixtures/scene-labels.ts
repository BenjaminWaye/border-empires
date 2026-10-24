import { Vector3 } from "three";
import type { Stage } from "./three-stage.js";

export type SceneLabel = {
  readonly text: string;
  /** Ground-plane point the caption hangs from (y = 0). */
  readonly x: number;
  readonly z: number;
};

// DOM captions pinned to ground points by projecting them through the stage
// camera every frame, so they stay put whatever the camera or canvas size.
// Returns a cleanup that stops the loop.
export const attachSceneLabels = (container: HTMLElement, stage: Stage, labels: readonly SceneLabel[]): (() => void) => {
  const projected = new Vector3();
  const placed = labels.map((label) => {
    const el = document.createElement("div");
    el.textContent = label.text;
    el.style.cssText =
      "position:absolute;transform:translate(-50%,0);pointer-events:none;white-space:pre;text-align:center;" +
      "font:11px/1.3 system-ui,sans-serif;color:#e8ecf4;text-shadow:0 1px 2px #000;";
    container.appendChild(el);
    return { el, label };
  });
  let rafId = 0;
  const place = (): void => {
    for (const { el, label } of placed) {
      projected.set(label.x, 0, label.z).project(stage.camera);
      el.style.left = `${((projected.x + 1) / 2) * stage.canvas.clientWidth}px`;
      el.style.top = `${((1 - projected.y) / 2) * stage.canvas.clientHeight}px`;
    }
    rafId = requestAnimationFrame(place);
  };
  place();
  return () => cancelAnimationFrame(rafId);
};
