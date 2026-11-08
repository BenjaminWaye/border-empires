import { describe, expect, it } from "vitest";
import type { LeaderboardOverallEntry, SeasonVictoryObjectiveView } from "../client-types.js";
import { formatHold, nonLeaderShare, ranksBannerHtml, ranksBodyHtml } from "./client-hud-v2-ranks.js";
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
    expect(html).toMatch(/LEAD<\/button> leads<\/span><span class="v2r-path-line">22\/189 towns<\/span>/);
    expect(html).toContain("You · 10/189 towns");
  });

  it("shows a single line when the viewer leads", () => {
    const html = render(objective({ leaderPlayerId: "me", progressLabel: "22/189 towns", selfProgressLabel: "22/189 towns" }));
    expect(html).toContain("★ You lead");
    expect(html).not.toContain("v2r-side-you");
  });

  it("shows the time left while someone is holding", () => {
    expect(render(objective({ conditionMet: true, holdRemainingSeconds: 18599 }))).toContain("LEAD</button> holding · 5h 10m left");
  });

  it("leaves the time out rather than an empty gap when the hold time is unknown", () => {
    expect(render(objective({ conditionMet: true }))).toMatch(/LEAD<\/button> holding<\/span>/);
  });
});

describe("ranks banner", () => {
  const banner = (o: SeasonVictoryObjectiveView): string =>
    ranksBannerHtml({ me: "me", objectives: [o], overall: [], selfOverall: undefined, nameOf: (id) => id.toUpperCase(), colorOf: () => undefined });

  it("names the time to win while someone is holding", () => {
    expect(banner(objective({ conditionMet: true, holdRemainingSeconds: 18599 }))).toContain("LEAD is holding Town Control · 5h 10m to win");
  });

  it("leaves the time out when the hold time is unknown", () => {
    expect(banner(objective({ conditionMet: true }))).toMatch(/LEAD is holding Town Control<\/span>/);
  });
});

describe("formatHold", () => {
  it("rolls a full 60 minutes into the hour", () => {
    expect(formatHold(7199)).toBe("2h");
    expect(formatHold(3599)).toBe("1h");
  });

  it("keeps minutes under 10h, whole hours above, and never shows 0m", () => {
    expect(formatHold(18599)).toBe("5h 10m");
    expect(formatHold(40000)).toBe("11h");
    expect(formatHold(0)).toBe("1m");
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

describe("ranks race profile links", () => {
  it("opens a player's profile from their track crest (crests were inert spans)", () => {
    const html = render(objective({ selfProgress: 0.3, contenders: [{ playerId: "b", name: "B", progress: 0.5 }] }));
    expect(html).toMatch(/<button[^>]*v2r-pin[^>]*data-hud-v2-profile="lead"/);
    expect(html).toMatch(/<button[^>]*v2r-pin-rival[^>]*data-hud-v2-profile="b"/);
    expect(html).toMatch(/<button[^>]*v2r-pin-you[^>]*data-hud-v2-profile="me"/);
  });

  it("opens the leader's profile from their name beside the track", () => {
    expect(render(objective({}))).toContain('<button type="button" class="v2r-name-link" data-hud-v2-profile="lead">LEAD</button> leads');
    expect(render(objective({ conditionMet: true }))).toMatch(/v2r-status-hold">⧗ <button[^>]*data-hud-v2-profile="lead">LEAD<\/button> holding/);
  });

  it("leaves your own lead as plain text", () => {
    expect(render(objective({ leaderPlayerId: "me" }))).not.toContain("v2r-name-link");
  });
});

describe("ranks standings power score", () => {
  const entry = (id: string, rank: number, score: number, tiles: number): LeaderboardOverallEntry => ({
    id, name: id, rank, score, tiles, incomePerMinute: 0, techs: 0, manpowerCap: 0
  });

  it("shows scores and scales bars by score, including the viewer outside the top ten", () => {
    const html = ranksBodyHtml({
      me: "me", objectives: [],
      overall: [entry("leader", 1, 2400, 100), entry("rival", 2, 1200, 800)],
      selfOverall: entry("me", 20, 600, 50), nameOf: (id) => id, colorOf: () => undefined
    });
    expect(html).toContain('Standings <span class="v2s-meta">power score</span>');
    const rows = html.match(/<button[^>]*class="v2r-stand[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(rows).toHaveLength(3);
    for (const [i, [score, width]] of [["2,400", "100.0"], ["1,200", "50.0"], ["600", "25.0"]].entries()) {
      expect(rows[i]).toContain(`class="v2r-stand-val">${score}</span>`);
      expect(rows[i]).toContain(`style="width:${width}%"`);
    }
    expect(rows[2]).toContain('class="v2r-rank">20</span>');
  });

  it("keeps zero-score bars finite", () => {
    const html = ranksBodyHtml({ me: "me", objectives: [], overall: [entry("me", 1, 0, 50)],
      selfOverall: undefined, nameOf: (id) => id, colorOf: () => undefined });
    expect(html).toContain('style="width:0.0%"');
    expect(html).toContain('class="v2r-stand-val">0</span>');
  });
});
