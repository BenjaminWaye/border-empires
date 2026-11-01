import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveView } from "../client-types.js";
import { nonLeaderShare, ranksBodyHtml } from "./client-hud-v2-ranks.js";
import { assignLanes } from "./client-hud-v2-ranks-lanes.js";

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
    expect(html).toMatch(/left:50\.0%[^"]*" title="B"/);
    expect(html).toMatch(/left:20\.0%[^"]*" title="C"/);
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

describe("ranks race side column", () => {
  it("shows the leader's progress under their name, not the viewer's", () => {
    const html = render(objective({ progressLabel: "22/189 towns", selfProgress: 0.05, selfProgressLabel: "10/189 towns" }));
    expect(html).toMatch(/LEAD leads<\/span><span class="v2r-path-line">22\/189 towns<\/span>/);
    expect(html).toContain("You · 10/189 towns");
  });

  it("shows a single line when the viewer leads", () => {
    const html = render(objective({ leaderPlayerId: "me", progressLabel: "22/189 towns", selfProgressLabel: "22/189 towns" }));
    expect(html).toContain("★ You lead");
    expect(html).not.toContain("v2r-side-you");
  });
});

describe("ranks race crest lanes", () => {
  it("keeps far-apart crests on the rail", () => {
    expect(assignLanes([{ share: 0.1, priority: 3 }, { share: 0.5, priority: 2 }, { share: 0.9, priority: 1 }])).toEqual([0, 0, 0]);
  });

  it("steps overlapping crests above and below, frontmost on the rail", () => {
    expect(assignLanes([{ share: 0.1, priority: 1 }, { share: 0.12, priority: 3 }, { share: 0.11, priority: 2 }])).toEqual([1, 0, -1]);
  });

  it("draws a tick at the real position of a laned crest and grows the track", () => {
    const html = render(objective({ progress: 0.3, selfProgress: 0.29, contenders: [{ playerId: "b", name: "B", progress: 0.31 }] }));
    expect(html.match(/v2r-tick/g)?.length).toBe(2);
    expect(html).toContain('style="height:112px"');
  });
});
