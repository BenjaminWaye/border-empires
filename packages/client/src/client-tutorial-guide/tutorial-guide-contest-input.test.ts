import { describe, expect, it } from "vitest";

import { guideAttackLaunched, guideAttackTargets, guideTruceStage, type GuideContestState } from "./tutorial-guide-contest-input.js";

const state = (overrides: Partial<GuideContestState> = {}): GuideContestState => ({
  allies: [],
  activeTruces: [],
  incomingTruceRequests: [],
  outgoingTruceRequests: [],
  pendingMusterAttacks: [],
  detachedAttacksByCommandId: new Map(),
  outgoingMusterAttacksByTile: new Map(),
  capture: undefined,
  actionCurrent: undefined,
  ...overrides
});

const truce = (otherPlayerId: string) => ({ otherPlayerId, otherPlayerName: otherPlayerId, startedAt: 0, endsAt: 1, createdByPlayerId: "me" });

describe("guide contest inputs", () => {
  it("counts a parked, in-flight or resolving attack, but not a march-mode expand", () => {
    expect(guideAttackLaunched(state())).toBe(false);
    expect(guideAttackLaunched(state({ pendingMusterAttacks: [{ targetX: 1, targetY: 1, fromX: 0, fromY: 1, musterTileKey: "0,1" }] }))).toBe(true);
    expect(guideAttackLaunched(state({ capture: { startAt: 0, resolvesAt: 1, target: { x: 1, y: 1 }, actionType: "ATTACK" } }))).toBe(true);
    expect(guideAttackLaunched(state({ capture: { startAt: 0, resolvesAt: 1, target: { x: 1, y: 1 }, actionType: "EXPAND" } }))).toBe(false);
    const expand = { originX: 0, originY: 0, targetX: 1, targetY: 1, resolvesAt: 1, isExpand: true };
    expect(guideAttackLaunched(state({ outgoingMusterAttacksByTile: new Map([["1,1", expand]]) }))).toBe(false);
    expect(guideAttackLaunched(state({ outgoingMusterAttacksByTile: new Map([["1,1", { ...expand, isExpand: false }]]) }))).toBe(true);
  });

  it("marks enemy border tiles nearest home first, never an ally's or a truce partner's", () => {
    const candidates = [
      { x: 9, y: 0, ownerId: "barbarian-1" },
      { x: 2, y: 0, ownerId: "ally" },
      { x: 3, y: 0, ownerId: "truced" },
      { x: 4, y: 0, ownerId: "rival" }
    ];
    const targets = guideAttackTargets(candidates, state({ allies: ["ally"], activeTruces: [truce("truced")] }), (t) => t.x);
    expect(targets).toEqual([{ x: 4, y: 0 }, { x: 9, y: 0 }]);
  });

  it("reads the truce stage, a truce in force first", () => {
    expect(guideTruceStage(state())).toBe("none");
    expect(guideTruceStage(state({ outgoingTruceRequests: [{} as never] }))).toBe("offered");
    expect(guideTruceStage(state({ outgoingTruceRequests: [{} as never], incomingTruceRequests: [{} as never] }))).toBe("incoming");
    expect(guideTruceStage(state({ incomingTruceRequests: [{} as never], activeTruces: [truce("ai-1")] }))).toBe("active");
  });
});
