// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { createAfcMapOverlays } from "./client-afc-map-overlays.js";

let true3D = false;
vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => true3D }));
vi.mock("../client-afc-upgrade-ready/client-afc-upgrade-ready.js", async (importActual) => ({
  ...(await importActual<typeof import("../client-afc-upgrade-ready/client-afc-upgrade-ready.js")>()),
  readyAfcUpgradeCount: () => 1
}));

type PickMode = "garrisonMany" | "buildingPlacement" | "crystalTargeting" | "aetherWallTargeting" | "musterMarchTargeting";

const setup = () => {
  document.body.innerHTML = "<div><canvas width='100' height='100'></canvas></div>";
  const canvas = document.querySelector("canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
  const state = createInitialState();
  state.authSessionReady = true;
  state.me = "p";
  const afc = { x: 4, y: 4, terrain: "LAND", ownerId: "p", afc: { ownerId: "p", status: "active" } } as unknown as Tile;
  const open = vi.fn();
  const overlay = createAfcMapOverlays(canvas, state, open);
  const render = (): void => overlay.render([{ wx: 4, wy: 4, wk: "4,4", px: 40, py: 60, vis: "visible", t: afc }], { size: 10, project: () => ({ sx: 50, sy: 70 }) });
  return { state, render, open };
};

// Playtest 2026-11-26: during Garrison Many a tap meant for a tile hit the "↑ 1 upgrade ready" bubble and opened
// the permanent-upgrade panel behind the selection bar.
describe("AFC upgrade-ready bubble while the map is picking tiles", () => {
  it.each([false, true])("shows over your AFC normally (true-3D %s)", (active) => {
    true3D = active;
    const { render } = setup();
    render();
    expect(document.querySelector(".afc-upgrade-ready-badge")?.textContent).toBe("↑ 1 upgrade ready");
  });

  it.each<[PickMode, boolean]>([
    ["garrisonMany", false], ["garrisonMany", true], ["buildingPlacement", false], ["crystalTargeting", true],
    ["aetherWallTargeting", false], ["musterMarchTargeting", true]
  ])("steps aside during %s (true-3D %s) and comes back after", (mode, active) => {
    true3D = active;
    const { state, render, open } = setup();
    render();
    expect(document.querySelector(".afc-upgrade-ready-badge")).not.toBeNull();
    state[mode].active = true;
    render();
    expect(document.querySelector(".afc-upgrade-ready-badge")).toBeNull();
    expect(open).not.toHaveBeenCalled();
    state[mode].active = false;
    render();
    expect(document.querySelector(".afc-upgrade-ready-badge")).not.toBeNull();
  });
});
