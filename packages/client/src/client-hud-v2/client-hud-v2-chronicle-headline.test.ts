// 10-persona playtest: Henrik pieced "lost 129 tiles, all 4 towns, respawned" together from ~15
// Chronicle rows, and the summary read "−1" town. The Yours view now opens on a short headline.
import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { chronicleHeadlineHtml, chronicleHeadlineLines, chronicleHeadlineTally, type ChronicleHeadlineInput } from "./client-hud-v2-chronicle-headline.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";

const timeline = (cards: PersonalActivityCard[], extra: Partial<PersonalActivityTimeline> = {}, summary: Partial<PersonalActivityTimeline["summary"]> = {}): PersonalActivityTimeline => ({
  playerId: "me", from: 0, to: 1_000,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0, ...summary },
  goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, cards, truncated: false, ...extra
});

const townLost = (id: string, at: number): PersonalActivityCard => ({
  kind: "TOWN_LOST", id, occurredAt: at, x: 1, y: 1, townTier: "TOWN", townSurvived: true,
  populationBefore: 100, populationAfter: 100, capturedStructureTypes: [], counterpartyPlayerId: "konrad"
});

const names = (id: string): string | undefined => ({ konrad: "Konrad", maren: "Maren" })[id];
const input = (t: PersonalActivityTimeline, extra: Partial<ChronicleHeadlineInput> = {}): ChronicleHeadlineInput =>
  ({ me: "me", timeline: t, awaySince: 500, nameOf: names, ...extra });

const henrik = (): PersonalActivityTimeline => timeline([
  { kind: "TERRITORY_FLIP_GROUP", id: "t1", occurredAt: 600, direction: "LOST", counterpartyPlayerId: "konrad", tileCount: 120, x: 3, y: 3, features: [{ kind: "AFC", count: 1 }] },
  { kind: "SIEGE", id: "s1", occurredAt: 610, startedAt: 550, x: 4, y: 4, outcome: "FELL", assaultsRepelled: 2, originsSeized: 0, attackerIds: ["konrad"], manpowerSpentAgainst: 50, capturedBy: "konrad" },
  { kind: "COMBAT_GROUP", id: "g1", occurredAt: 620, role: "DEFENDER", counterpartyPlayerId: "konrad", attempts: 9, captures: 8, originsSeized: 0, manpowerLoss: 90, pillagedGold: 300, defenderGoldLoss: 300.4, x: 5, y: 5 },
  { kind: "COMBAT", id: "c1", occurredAt: 630, attackerId: "konrad", defenderId: "me", attackerWon: false, manpowerLoss: 5, x: 6, y: 6, pillagedGold: 0, defenderGoldLoss: 40, targetWasSettled: true },
  townLost("town-1", 640), townLost("town-2", 650), townLost("town-3", 660), townLost("town-4", 670),
  townLost("before-away", 400),
  { kind: "DIPLOMACY", id: "d1", occurredAt: 700, event: "TRUCE_ENDED", counterpartyPlayerId: "maren", counterpartyName: "Maren of Old" },
  { kind: "DIPLOMACY", id: "d2", occurredAt: 710, event: "TRUCE_BROKEN", counterpartyPlayerId: "konrad", counterpartyName: "Konrad", byPlayerId: "me" }
]);

describe("Chronicle headline", () => {
  it("sums a multi-town loss, names the AFC and the new start", () => {
    const tally = chronicleHeadlineTally(input(henrik(), { respawn: { at: 800, reasonCode: "eliminated", spawnTileKey: "12,40" } }));
    expect(tally).toMatchObject({ tilesLost: 129, townsLost: 4, afcsLost: 1, newStart: { x: 12, y: 40 }, trucesEnded: ["Maren"], coinRaided: 340 });
    expect(chronicleHeadlineLines(tally)).toEqual([
      "Lost 129 tiles, 4 towns and your AFC.",
      "Wiped out · new start at (12, 40).",
      "Truce with Maren ended · 340 coin raided."
    ]);
  });

  it("names an AFC lost in a siege as the AFC, not a town", () => {
    const t = timeline([{ kind: "SIEGE", id: "s", occurredAt: 600, startedAt: 550, x: 1, y: 1, outcome: "FELL", assaultsRepelled: 0, originsSeized: 0, attackerIds: ["konrad"], manpowerSpentAgainst: 5, capturedFeatures: [{ kind: "AFC", count: 1 }] }]);
    expect(chronicleHeadlineLines(chronicleHeadlineTally(input(t)))).toEqual(["Lost 1 tile and your AFC."]);
  });

  it("uses the window's summary when away for all of it, so capped-off town cards still count", () => {
    const t = timeline([townLost("only-card", 600)], { from: 100, goldRaidedFromYou: 1_234.6 }, { tilesLost: 129, tilesClaimed: 3, townsLost: 4, featuresLost: [{ kind: "AFC", count: 1 }] });
    const lines = chronicleHeadlineLines(chronicleHeadlineTally(input(t, { awaySince: 50 })));
    expect(lines).toEqual(["Gained 3 tiles.", "Lost 129 tiles, 4 towns and your AFC.", "1,235 coin raided."]);
  });

  // Visit loop report: what the player's own orders produced comes before what was taken from them.
  it("opens with the player's own results: builds finished, waystations activated, ground taken", () => {
    const t = timeline([
      { kind: "BUILDING_COMPLETED", id: "b1", occurredAt: 600, x: 1, y: 1, structureType: "FORT" },
      { kind: "BUILDING_COMPLETED", id: "b2", occurredAt: 610, x: 2, y: 2, structureType: "FARMSTEAD" },
      { kind: "BUILDING_COMPLETED", id: "old", occurredAt: 400, x: 3, y: 3, structureType: "FORT" },
      { kind: "TERRITORY_FLIP_GROUP", id: "g", occurredAt: 620, direction: "GAINED", counterpartyPlayerId: undefined, tileCount: 6, x: 4, y: 4 },
      { kind: "TERRITORY_FLIP_GROUP", id: "l", occurredAt: 630, direction: "LOST", counterpartyPlayerId: "konrad", tileCount: 2, x: 5, y: 5 }
    ]);
    const tally = chronicleHeadlineTally(input(t));
    expect(tally).toMatchObject({ buildingsCompleted: 2, waystationsActivated: 0, tilesGained: 6, tilesLost: 2 });
    expect(chronicleHeadlineLines(tally)).toEqual(["Built 2 structures · gained 6 tiles.", "Lost 2 tiles."]);
    expect(chronicleHeadlineLines({ ...tally, buildingsCompleted: 0, waystationsActivated: 1, tilesGained: 0 })).toEqual(["Activated 1 waystation.", "Lost 2 tiles."]);
  });

  it("keeps the alarm colour when there is nothing gained to open with", () => {
    const loss = timeline([{ kind: "TERRITORY_FLIP_GROUP", id: "l", occurredAt: 630, direction: "LOST", counterpartyPlayerId: "konrad", tileCount: 2, x: 5, y: 5 }]);
    expect(chronicleHeadlineHtml(input(loss))).toContain(`class="v2c-headline v2c-headline-loss"`);
    const both = timeline([...loss.cards, { kind: "BUILDING_COMPLETED", id: "b", occurredAt: 600, x: 1, y: 1, structureType: "FORT" }]);
    expect(chronicleHeadlineHtml(input(both))).toContain(`class="v2c-headline" role="status"`);
  });

  it("ignores a recovery respawn and a truce the player broke", () => {
    const t = timeline([{ kind: "DIPLOMACY", id: "d", occurredAt: 600, event: "TRUCE_BROKEN", counterpartyPlayerId: "konrad", counterpartyName: "Konrad", byPlayerId: "me" }]);
    expect(chronicleHeadlineHtml(input(t, { respawn: { at: 700, reasonCode: "auth_recovery", spawnTileKey: "1,1" } }))).toBe("");
  });

  it("is labelled since the player last looked, not since they left: it also fires mid-session (Playtest Run 4)", () => {
    const t = timeline([{ kind: "TERRITORY_FLIP_GROUP", id: "t", occurredAt: 610, direction: "GAINED", counterpartyPlayerId: undefined, tileCount: 3, x: 1, y: 1 }]);
    const html = chronicleHeadlineHtml(input(t));
    expect(html).toContain("Since you last looked");
    expect(html).not.toContain("Since you left");
  });

  it("says when a rival broke the truce, and gains alone", () => {
    const t = timeline([
      { kind: "DIPLOMACY", id: "d", occurredAt: 600, event: "TRUCE_BROKEN", counterpartyPlayerId: "konrad", counterpartyName: "Konrad", byPlayerId: "konrad" },
      { kind: "TERRITORY_FLIP_GROUP", id: "t", occurredAt: 610, direction: "GAINED", counterpartyPlayerId: undefined, tileCount: 5, x: 1, y: 1 }
    ]);
    expect(chronicleHeadlineLines(chronicleHeadlineTally(input(t)))).toEqual(["Gained 5 tiles.", "Truce with Konrad ended."]);
  });

  it("sits at the top of the Yours view only when the Chronicle opened on a return", () => {
    const base = {
      me: "me", timeline: henrik(), loading: false, error: undefined, rivalFilter: "", selectedId: undefined,
      nameOf: names, colorOf: () => undefined, techName: () => undefined, nowMs: 1_000
    };
    const opened = chronicleHtml({ ...base, awaySince: 500 });
    expect(opened.indexOf("v2c-headline")).toBeGreaterThan(-1);
    expect(opened.indexOf("v2c-headline")).toBeLessThan(opened.indexOf("v2c-summary"));
    expect(chronicleHtml(base)).not.toContain("v2c-headline");
  });
});
