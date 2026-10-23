import { describe, expect, it } from "vitest";
import { applyPlayerUpdateManpowerFields, type PlayerUpdateManpowerState } from "./client-player-update-manpower.js";

const baseState = (): PlayerUpdateManpowerState => ({
  manpower: 100,
  manpowerCap: 150,
  manpowerRegenPerMinute: 0.2,
  logisticsThroughputPerMinute: 0.2,
  expandManpowerCost: 10
});

describe("applyPlayerUpdateManpowerFields", () => {
  it("takes the frontier-scaled EXPAND price from PLAYER_UPDATE", () => {
    const state = baseState();
    applyPlayerUpdateManpowerFields(state, { type: "PLAYER_UPDATE", manpower: 80, expandManpowerCost: 50 });
    expect(state.expandManpowerCost).toBe(50);
    expect(state.manpower).toBe(80);
  });

  it("keeps the last value for fields the message omits", () => {
    const state = baseState();
    state.expandManpowerCost = 15;
    applyPlayerUpdateManpowerFields(state, { type: "PLAYER_UPDATE", manpowerCap: 300 });
    expect(state.expandManpowerCost).toBe(15);
    expect(state.manpowerCap).toBe(300);
    expect(state.manpower).toBe(100);
  });
});
