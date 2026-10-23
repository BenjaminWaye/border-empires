import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { activityCardText } from "./client-activity-dashboard-format.js";
import { nonSiegeActivityCards, siegeSectionHtml } from "./client-activity-dashboard-sieges.js";

const HOUR = 60 * 60_000;
const names = (id: string): string | undefined => ({ kael: "Kael", vess: "Vess" })[id];

const siege = (overrides: Partial<Extract<PersonalActivityCard, { kind: "SIEGE" }>> = {}): PersonalActivityCard => ({
  kind: "SIEGE",
  id: "siege:4:7:0",
  occurredAt: 5 * HOUR,
  startedAt: 0,
  x: 4,
  y: 7,
  outcome: "FELL",
  assaultsRepelled: 7,
  originsSeized: 0,
  attackerIds: ["kael", "vess"],
  manpowerSpentAgainst: 412,
  defenseVariant: "FORT",
  capturedBy: "kael",
  ...overrides
});

const timelineWith = (cards: PersonalActivityCard[]): PersonalActivityTimeline => ({
  playerId: "me",
  from: 0,
  to: 24 * HOUR,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards,
  rivals: [],
  truncated: false
});

describe("siege activity cards", () => {
  it("summarizes how long a fortification held and what it cost the attackers", () => {
    expect(activityCardText(siege(), "me", names)).toBe("Your Fort fell to Kael after a 5h siege · Held off 7 assaults from Kael and Vess · cost them 412 manpower");
    expect(activityCardText(siege({ occurredAt: 90 * 60_000, originsSeized: 2 }), "me", names)).toBe("Your Fort fell to Kael after a 1h 30m siege · Held off 7 assaults from Kael and Vess · seized 2 of their tiles · cost them 412 manpower");
  });

  it("describes an unfortified tile that is still holding", () => {
    const { defenseVariant: _fort, capturedBy: _by, ...fortified } = siege({ outcome: "HOLDING", assaultsRepelled: 1, attackerIds: ["kael"], manpowerSpentAgainst: 60 }) as Extract<PersonalActivityCard, { kind: "SIEGE" }>;
    const card: PersonalActivityCard = fortified;
    expect(activityCardText(card, "me", names)).toBe("Your tile is holding · Repelled 1 assault from Kael · cost them 60 manpower");
  });

  it("renders sieges in their own section, costliest first, with a Center button", () => {
    const html = siegeSectionHtml(timelineWith([siege({ id: "a", manpowerSpentAgainst: 100, defenseVariant: "PALISADE", outcome: "HOLDING" }), siege({ id: "b" })]), names);
    expect(html).toContain("<h3>Sieges</h3>");
    expect(html.indexOf("Your Fort fell")).toBeLessThan(html.indexOf("Your Palisade is holding"));
    expect(html).toContain('data-activity-focus-x="4" data-activity-focus-y="7"');
    // Siege rows sit in Yours too, so they show their tile like the timeline rows.
    expect(html).toContain('<span class="activity-dashboard-card-coords">(4, 7)</span>');
  });

  it("does not misread an unknown card kind from a newer server as a truncation note", () => {
    expect(activityCardText({ kind: "FUTURE_KIND", id: "f", occurredAt: 1, x: 1, y: 1 } as never, "me", names)).toBe("Activity on your territory");
  });

  it("renders nothing without sieges and keeps sieges out of the plain timeline list", () => {
    const combat = { kind: "TRUNCATION_NOTE", id: "t", occurredAt: 1, hiddenCount: 2 } as const;
    expect(siegeSectionHtml(timelineWith([combat]), names)).toBe("");
    expect(nonSiegeActivityCards([siege(), combat])).toEqual([combat]);
  });
});
