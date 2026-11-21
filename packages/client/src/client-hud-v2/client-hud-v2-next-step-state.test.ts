// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { nextStepsForState } from "./client-hud-v2-next-step.js";

const tech = (id: string, extra: Partial<TechInfo> = {}): TechInfo => ({ id, name: id, tier: 1, requirements: { gold: 40 }, ...extra }) as unknown as TechInfo;

// Review of #2845: the coin check took the first unowned Manifest's price even when every remaining one was
// locked. With nothing to commission, coin can't be "low", so no coin row shows.
describe("tracker next step from state", () => {
  it("doesn't count coin as low while every remaining Manifest is locked", () => {
    const state = createInitialState();
    state.me = "me";
    state.manpower = 400;
    state.manpowerCap = 400;
    state.gold = 0;
    state.techIds = ["a"];
    state.techCatalog = [tech("a"), tech("b", { lockedReason: "Needs AFC tier 2" })];
    const scan = { sources: { manufactoryTown: { x: 1, y: 1 } }, beaconCost: 50 };
    expect(nextStepsForState(state, scan)).toEqual([]);
    state.techCatalog = [tech("a"), tech("b")];
    expect(nextStepsForState(state, scan).map((s) => s.title)).toEqual(["Build a Manufactory"]);
  });
});
