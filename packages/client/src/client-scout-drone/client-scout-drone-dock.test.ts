// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderScoutDroneDock, scoutDockChargesLeft } from "./client-scout-drone-dock.js";

const planningState = () => {
  const state = createInitialState();
  state.me = "me";
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
  state.scoutDronePicking = { active: true, stops: [{ x: 1, y: 6 }], bumpAt: 0, shakeAt: 0, launches: 0 };
  return state;
};

describe("scout drone dock", () => {
  // Review 2026-11-21: the dock rebuilt its buttons every second, so a press spanning a refresh was lost.
  it("keeps the same buttons across refreshes, so a press never lands on a replaced element", () => {
    const state = planningState();
    const deps = { send: vi.fn(() => true), rerender: vi.fn(), now: () => 0 };
    renderScoutDroneDock(state, deps);
    const go = document.querySelector("#scout-drone-dock .sd-go");
    const cancel = document.querySelector("#scout-drone-dock .sd-cancel");
    renderScoutDroneDock(state, { ...deps, now: () => 1_000 });
    expect(document.querySelector("#scout-drone-dock .sd-go")).toBe(go);
    expect(document.querySelector("#scout-drone-dock .sd-cancel")).toBe(cancel);
    (go as HTMLButtonElement).click();
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ type: "EXPLORE", waypoints: [{ x: 1, y: 6 }] }));
    renderScoutDroneDock(state, deps);
    expect((document.getElementById("scout-drone-dock") as HTMLElement).style.display).toBe("none");
  });

  // Owner 2026-11-21: eight charge pips overflowed a 375px phone; one counter replaces them.
  it("shows one count of charges still free to place", () => {
    const state = planningState();
    state.scoutDroneCharges = { max: 8, refillMs: 14_400_000, usedAt: [0, 0] };
    const deps = { send: vi.fn(() => true), rerender: vi.fn(), now: () => 1_000 };
    renderScoutDroneDock(state, deps);
    expect(scoutDockChargesLeft(state, 1_000)).toBe(5);
    expect(document.querySelector("#scout-drone-dock .sd-count b")?.textContent).toBe("5");
    expect(document.querySelectorAll("#scout-drone-dock .sd-pip")).toHaveLength(0);
  });
});
