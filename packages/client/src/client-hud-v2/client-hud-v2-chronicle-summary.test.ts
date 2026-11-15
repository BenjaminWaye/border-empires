import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { chronicleHtml, rivalTallyText } from "./client-hud-v2-chronicle.js";

const timeline = (summary: Partial<PersonalActivityTimeline["summary"]>, rivals: PersonalActivityTimeline["rivals"] = []): PersonalActivityTimeline => ({
  playerId: "me",
  from: 0,
  to: 1_000,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0, ...summary },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards: [],
  rivals,
  truncated: false
});

const html = (t: PersonalActivityTimeline): string => chronicleHtml({
  me: "me", timeline: t, loading: false, error: undefined, rivalFilter: "", selectedId: undefined,
  nameOf: (id) => (id === "astrid" ? "Astrid" : undefined), colorOf: () => undefined, techName: () => undefined, nowMs: 1_000
});

describe("Chronicle 24h summary", () => {
  it("counts towns taken and lost separately instead of a net '+1 towns'", () => {
    const out = html(timeline({ townsCaptured: 2, townsLost: 1 }));
    expect(out).toContain("<b class=\"v2c-gain\">+2</b><span>towns taken</span>");
    expect(out).toContain("<b class=\"v2c-loss\">−1</b><span>town lost</span>");
    expect(out).not.toContain("<span>towns</span>");
  });

  it("says a rival's tally in words", () => {
    expect(rivalTallyText({ playerId: "astrid", tilesTaken: 1, tilesLost: 13, attacksRepelled: 2, attacksFailed: 0 }))
      .toBe("took 13 of your tiles · you took 1 tile · you held off 2 attacks");
    expect(html(timeline({}, [{ playerId: "astrid", tilesTaken: 0, tilesLost: 13, attacksRepelled: 0, attacksFailed: 0 }]))).toContain("took 13 of your tiles");
  });
});
