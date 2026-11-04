import { describe, expect, it } from "vitest";
import { frontierClaimDurationMsAt } from "@border-empires/shared";
import { settleDurationMsForTile } from "../client-constants.js";
import { applyPlayerUpdateManpowerFields } from "../client-player-update-manpower/client-player-update-manpower.js";
import { createInitialState } from "../client-state/client-state.js";
import { settleDurationMsForState } from "./client-queue-logic.js";

const noEffects = { techIds: [], techCatalog: [], domainIds: [], domainCatalog: [] };

describe("client garrison duration", () => {
  it("predicts the frontier claim time, matching the server", () => {
    for (const [x, y] of [[0, 0], [3, 7], [12, 40]] as const) {
      expect(settleDurationMsForTile(x, y)).toBe(frontierClaimDurationMsAt(x, y));
      expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 0 }, { x, y })).toBe(frontierClaimDurationMsAt(x, y));
    }
  });

  it("predicts 0 ms while the player has instant garrisons left, still behind a capture hold", () => {
    expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 3 }, { x: 0, y: 0 })).toBe(0);
    const held = { x: 0, y: 0, ownershipState: "FRONTIER", captureHoldUntil: 1_000 + 20_000 };
    expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 3 }, held, 1_000)).toBe(20_000);
  });

  it("reads instantGarrisonsRemaining from PLAYER_UPDATE and keeps it when omitted", () => {
    const state = createInitialState();
    expect(state.instantGarrisonsRemaining).toBe(0);
    applyPlayerUpdateManpowerFields(state, { instantGarrisonsRemaining: 10 });
    expect(state.instantGarrisonsRemaining).toBe(10);
    applyPlayerUpdateManpowerFields(state, { manpower: 5 });
    expect(state.instantGarrisonsRemaining).toBe(10);
  });
});
