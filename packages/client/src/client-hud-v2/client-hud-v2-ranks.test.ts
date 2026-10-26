import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveView } from "../client-types.js";
import { nonLeaderShare, ranksBodyHtml } from "./client-hud-v2-ranks.js";

const objective = (patch: Partial<SeasonVictoryObjectiveView>): SeasonVictoryObjectiveView => ({
  id: "TOWN_CONTROL",
  name: "Town Control",
  description: "",
  leaderPlayerId: "lead",
  leaderName: "Lead",
  progressLabel: "6/10 towns",
  thresholdLabel: "Need 10 towns",
  holdDurationSeconds: 86400,
  statusLabel: "",
  conditionMet: false,
  progress: 0.6,
  ...patch
});

const render = (o: SeasonVictoryObjectiveView): string =>
  ranksBodyHtml({ me: "me", objectives: [o], overall: [], selfOverall: undefined, nameOf: (id) => id.toUpperCase(), colorOf: () => undefined });

describe("ranks race contenders", () => {
  it("draws the runners-up as well as the leader (tracks showed only the leader and you)", () => {
    const html = render(objective({ contenders: [{ playerId: "b", name: "B", progress: 0.5 }, { playerId: "c", name: "C", progress: 0.2 }] }));
    expect(html.match(/v2r-pin-rival/g)?.length).toBe(2);
    expect(html).toContain('left:50.0%" title="B"');
    expect(html).toContain('left:20.0%" title="C"');
  });

  it("does not draw the viewer twice when they are a runner-up", () => {
    const html = render(objective({ selfProgress: 0.5, contenders: [{ playerId: "me", name: "Me", progress: 0.5 }] }));
    expect(html).not.toContain("v2r-pin-rival");
    expect(html).toContain("v2r-pin-you");
  });

  it("places Economic Hegemony runners-up relative to the leader", () => {
    expect(nonLeaderShare(objective({ id: "ECONOMIC_HEGEMONY", progress: 0.4 }), 0.5)).toBeCloseTo(0.2);
  });
});
