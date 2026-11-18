// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { nextStepsForState } from "./client-hud-v2-next-step.js";

const tech = (id: string, extra: Partial<TechInfo> = {}): TechInfo => ({ id, name: id, tier: 1, requirements: { gold: 40 }, ...extra }) as unknown as TechInfo;

// Review of #2845: the coin row took the first unowned Manifest's price even when every remaining one was
// locked, so the tracker said "Manifest affordable · commission one" with nothing to commission.
describe("tracker Manifest step from state", () => {
  it("drops the Manifest row while every remaining Manifest is locked", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 500;
    state.techIds = ["a"];
    state.techCatalog = [tech("a"), tech("b", { lockedReason: "Needs AFC tier 2" })];
    expect(nextStepsForState(state, { busy: 0, queued: 0 }, 0).map((s) => s.title)).not.toContain("Manifest affordable");
    state.techCatalog = [tech("a"), tech("b")];
    expect(nextStepsForState(state, { busy: 0, queued: 0 }, 0).map((s) => s.title)).toContain("Manifest affordable");
  });
});
