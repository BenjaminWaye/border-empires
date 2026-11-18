import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { offerDockEntries } from "./client-diplomacy-offer-dock.js";
import { attackerNoteText, recentAttacksOnMe } from "./client-offer-dock-attacker-note.js";

const timeline = (cards: PersonalActivityTimeline["cards"], rivals?: PersonalActivityTimeline["rivals"]): PersonalActivityTimeline => ({
  playerId: "me",
  from: 0,
  to: 100,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards,
  truncated: false,
  ...(rivals ? { rivals } : {})
});

// Rowan raided overnight: 13 attacks, 11 tiles and the Dock gone.
const raid = timeline(
  [
    { kind: "COMBAT_GROUP", id: "g", occurredAt: 50, role: "DEFENDER", counterpartyPlayerId: "rowan", attempts: 13, captures: 11, originsSeized: 0, manpowerLoss: 0, pillagedGold: 0, defenderGoldLoss: 0, x: 1, y: 1 },
    { kind: "TERRITORY_FLIP_GROUP", id: "t", occurredAt: 50, direction: "LOST", counterpartyPlayerId: "rowan", tileCount: 9, x: 1, y: 1 },
    { kind: "DOCK_LOST", id: "d", occurredAt: 50, x: 2, y: 2, counterpartyPlayerId: "rowan" },
    { kind: "COMBAT", id: "c", occurredAt: 40, attackerId: "me", defenderId: "hugo", attackerWon: true, manpowerLoss: 5, x: 3, y: 3, pillagedGold: 0, defenderGoldLoss: 0, targetWasSettled: false }
  ],
  [{ playerId: "rowan", tilesTaken: 0, tilesLost: 11, attacksRepelled: 2, attacksFailed: 0 }]
);

const truce = (id: string, fromPlayerId: string) => ({
  id,
  fromPlayerId,
  toPlayerId: "me",
  createdAt: 0,
  expiresAt: 600_000,
  durationHours: 12 as const,
  fromName: fromPlayerId,
  terms: { give: { gold: 0 }, ask: { gold: 0 } }
});

describe("offers from an empire that just attacked you", () => {
  it("tallies who attacked you and what they took", () => {
    const tally = recentAttacksOnMe(raid, "me");
    expect([...tally.keys()]).toEqual(["rowan"]);
    expect(attackerNoteText(tally.get("rowan"))).toBe("Attacked you in the last day · took 11 tiles and your Dock");
  });

  it("names towns lost and says when every attack was held", () => {
    const held = recentAttacksOnMe(timeline([{ kind: "SIEGE", id: "s", occurredAt: 1, startedAt: 0, x: 0, y: 0, outcome: "HOLDING", assaultsRepelled: 3, originsSeized: 0, attackerIds: ["kara"], manpowerSpentAgainst: 30 }]), "me");
    expect(attackerNoteText(held.get("kara"))).toBe("Attacked you in the last day · you held your ground");
    const town = recentAttacksOnMe(timeline([{ kind: "TOWN_LOST", id: "w", occurredAt: 1, x: 0, y: 0, townName: "Voltspire", townTier: "TOWN", townSurvived: true, populationBefore: 10, populationAfter: 8, capturedStructureTypes: [], counterpartyPlayerId: "astrid" }]), "me");
    expect(attackerNoteText(town.get("astrid"))).toBe("Attacked you in the last day · took Voltspire");
  });

  // Review of #2771: an attacker past the rival cap took tiles by combat, which the flip cards leave out,
  // and the note said "you held your ground". A COMBAT card with no attacker id threw.
  it("counts combat captures for an attacker missing from the rival tally", () => {
    const tally = recentAttacksOnMe(timeline([
      { kind: "COMBAT_GROUP", id: "g", occurredAt: 50, role: "DEFENDER", counterpartyPlayerId: "vess", attempts: 12, captures: 11, originsSeized: 0, manpowerLoss: 0, pillagedGold: 0, defenderGoldLoss: 0, x: 1, y: 1 },
      { kind: "COMBAT", id: "c", occurredAt: 40, attackerId: "", defenderId: "me", attackerWon: true, manpowerLoss: 5, x: 3, y: 3, pillagedGold: 0, defenderGoldLoss: 0, targetWasSettled: false }
    ]), "me");
    expect(attackerNoteText(tally.get("vess"))).toBe("Attacked you in the last day · took 11 tiles");
  });

  it("puts the warning on the attacker's truce offer and not on anyone else's", () => {
    const state = { me: "me", incomingTruceRequests: [truce("t1", "rowan"), truce("t2", "hugo")], incomingAllianceRequests: [], activityDashboard: { timeline: raid } };
    const entries = offerDockEntries(state, new Map(), new Set(), 0, () => undefined);
    expect(entries.find((e) => e.id === "t1")?.attackerNote).toBe("Attacked you in the last day · took 11 tiles and your Dock");
    expect(entries.find((e) => e.id === "t2")?.attackerNote).toBeUndefined();
  });
});
