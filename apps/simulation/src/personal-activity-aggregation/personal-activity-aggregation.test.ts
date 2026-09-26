import { describe, expect, it } from "vitest";

import { aggregatePersonalActivity } from "./personal-activity-aggregation.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";

const flip = (overrides: Partial<TerritoryFlip> = {}): TerritoryFlip => ({
  tileId: "1,1",
  x: 1,
  y: 1,
  fromOwner: undefined,
  toOwner: "player-1",
  at: 1_000,
  ...overrides
});

const loss = (overrides: Partial<CombatManpowerLoss> = {}): CombatManpowerLoss => ({
  attackerId: "player-1",
  defenderId: "player-2",
  attackerWon: true,
  manpowerLoss: 10,
  x: 1,
  y: 1,
  at: 1_000,
  pillagedGold: 0,
  defenderGoldLoss: 0,
  targetWasSettled: false,
  ...overrides
});

const impact = (overrides: Partial<PersonalImpactEvent> = {}): PersonalImpactEvent => ({
  id: "impact-1",
  kind: "BUILDING_COMPLETED",
  playerId: "player-1",
  occurredAt: 1_000,
  x: 1,
  y: 1,
  structureType: "GRANARY",
  ...overrides
} as PersonalImpactEvent);

describe("aggregatePersonalActivity", () => {
  it("counts tiles claimed and lost for the requested player only", () => {
    const flips: TerritoryFlip[] = [
      flip({ tileId: "a", x: 1, y: 1, fromOwner: undefined, toOwner: "player-1", at: 1_000 }),
      flip({ tileId: "b", x: 2, y: 2, fromOwner: "player-1", toOwner: "player-2", at: 2_000 }),
      // Unrelated flip between two other players -- must not count.
      flip({ tileId: "c", x: 3, y: 3, fromOwner: "player-3", toOwner: "player-4", at: 3_000 })
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, flips, []);
    expect(timeline.summary.tilesClaimed).toBe(1);
    expect(timeline.summary.tilesLost).toBe(1);
    expect(timeline.cards).toHaveLength(2);
  });

  it("keeps repeated loss/capture of the same tile as separate chronological cards, never overwritten", () => {
    const flips: TerritoryFlip[] = [
      flip({ tileId: "a", x: 5, y: 5, fromOwner: "player-1", toOwner: "player-2", at: 1_000 }),
      flip({ tileId: "a", x: 5, y: 5, fromOwner: "player-2", toOwner: "player-1", at: 2_000 })
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, flips, []);
    const kinds = timeline.cards.map((card) => (card.kind === "TERRITORY_FLIP_GROUP" ? card.direction : card.kind));
    expect(kinds.sort()).toEqual(["GAINED", "LOST"]);
  });

  it("sums manpowerSpentAttacking only for the player's own attacks", () => {
    const combat: CombatManpowerLoss[] = [
      loss({ attackerId: "player-1", defenderId: "player-2", manpowerLoss: 30, at: 1_000 }),
      loss({ attackerId: "player-1", defenderId: "player-3", manpowerLoss: 20, at: 2_000 }),
      // player-1 as defender: must not count toward manpowerSpentAttacking.
      loss({ attackerId: "player-2", defenderId: "player-1", manpowerLoss: 999, at: 3_000 })
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], combat);
    expect(timeline.manpowerSpentAttacking).toBe(50);
    expect(timeline.goldPlundered).toBe(0);
    expect(timeline.goldRaidedFromYou).toBe(0);
    // player-1 appears in all three combats (attacker twice, defender once).
    expect(timeline.cards).toHaveLength(3);
  });

  it("sums goldPlundered from the player's own settled captures", () => {
    const combat: CombatManpowerLoss[] = [
      loss({ attackerId: "player-1", defenderId: "player-2", pillagedGold: 130, targetWasSettled: true, at: 1_000 }),
      loss({ attackerId: "player-1", defenderId: "player-3", pillagedGold: 40, targetWasSettled: true, at: 2_000 }),
      // A non-settled capture never carries plunder -- 0 by construction.
      loss({ attackerId: "player-1", defenderId: undefined, pillagedGold: 0, targetWasSettled: false, at: 3_000 }),
      // Someone else's plunder must not count toward player-1's total.
      loss({ attackerId: "player-2", defenderId: "player-3", pillagedGold: 999, targetWasSettled: true, at: 4_000 })
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], combat);
    expect(timeline.goldPlundered).toBe(170);
    expect(timeline.goldRaidedFromYou).toBe(0);
    const card = timeline.cards.find((c) => c.kind === "COMBAT" && c.occurredAt === 1_000);
    expect(card).toMatchObject({ pillagedGold: 130, defenderGoldLoss: 0, targetWasSettled: true });
  });

  it("sums goldRaidedFromYou from settled captures where the player was the defender", () => {
    const combat: CombatManpowerLoss[] = [
      loss({ attackerId: "player-2", defenderId: "player-1", defenderGoldLoss: 240, targetWasSettled: true, at: 1_000 }),
      loss({ attackerId: "player-3", defenderId: "player-1", defenderGoldLoss: 60, targetWasSettled: true, at: 2_000 }),
      // Someone else being raided must not count toward player-1's total.
      loss({ attackerId: "player-2", defenderId: "player-3", defenderGoldLoss: 999, targetWasSettled: true, at: 3_000 })
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], combat);
    expect(timeline.goldRaidedFromYou).toBe(300);
    expect(timeline.goldPlundered).toBe(0);
  });

  it("populates gold fields the same way for a barbarian attacker or defender", () => {
    const asDefender = aggregatePersonalActivity(
      "player-1",
      { from: 0, to: 10_000 },
      [],
      [loss({ attackerId: "barbarian-1", defenderId: "player-1", defenderGoldLoss: 50, targetWasSettled: true, at: 1_000 })]
    );
    expect(asDefender.goldRaidedFromYou).toBe(50);
    const asAttackerTarget = aggregatePersonalActivity(
      "player-1",
      { from: 0, to: 10_000 },
      [],
      [loss({ attackerId: "player-1", defenderId: "barbarian-1", pillagedGold: 20, targetWasSettled: true, at: 1_000 })]
    );
    expect(asAttackerTarget.goldPlundered).toBe(20);
  });

  it("excludes flips/combat outside [from, to]", () => {
    const flips = [flip({ at: 500 }), flip({ tileId: "b", at: 50_000 })];
    const combat = [loss({ at: 500 }), loss({ at: 50_000 })];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, flips, combat);
    expect(timeline.cards).toHaveLength(2);
  });

  it("returns an empty timeline for a player with no activity", () => {
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], []);
    expect(timeline.cards).toEqual([]);
    expect(timeline.summary).toEqual({ tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 });
  });

  it("includes only the requested player's milestone cards and headline counts", () => {
    const impacts: PersonalImpactEvent[] = [
      impact({ id: "waystation", kind: "WAYSTATION_ACTIVATED", grantedEffect: "RESOURCE_SLOT", grantedResource: "FOOD" } as PersonalImpactEvent),
      impact({ id: "town-won", kind: "TOWN_CAPTURED", townTier: "TOWN", townSurvived: true, populationBefore: 1_000, populationAfter: 500, capturedStructureTypes: [] } as PersonalImpactEvent),
      impact({ id: "town-lost", kind: "TOWN_LOST", townTier: "SETTLEMENT", townSurvived: false, populationBefore: 300, populationAfter: 150, capturedStructureTypes: [] } as PersonalImpactEvent),
      impact({ id: "building", kind: "BUILDING_COMPLETED", structureType: "MINTWORKS", instantGold: 100 } as PersonalImpactEvent),
      impact({ id: "other", playerId: "player-2", kind: "BUILDING_COMPLETED", structureType: "GRANARY" } as PersonalImpactEvent)
    ];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], [], impacts);
    expect(timeline.summary).toMatchObject({ waystationsActivated: 1, townsCaptured: 1, townsLost: 1, buildingsCompleted: 1 });
    expect(timeline.cards.map((card) => card.kind).sort()).toEqual(["BUILDING_COMPLETED", "TOWN_CAPTURED", "TOWN_LOST", "WAYSTATION_ACTIVATED"]);
  });

  it("sets truncated when `from` predates the 24h retention cutoff", () => {
    const to = 100_000_000;
    const withinWindow = aggregatePersonalActivity("player-1", { from: to - 60_000, to }, [], []);
    expect(withinWindow.truncated).toBe(false);
    const beyondWindow = aggregatePersonalActivity("player-1", { from: to - 25 * 60 * 60_000, to }, [], []);
    expect(beyondWindow.truncated).toBe(true);
  });

  it("includes barbarian participants in a player's own Yours timeline (World Pulse exclusion is separate)", () => {
    const combat = [loss({ attackerId: "player-1", defenderId: "BARBARIAN", manpowerLoss: 15, at: 1_000 })];
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 10_000 }, [], combat);
    expect(timeline.cards).toHaveLength(1);
    expect(timeline.manpowerSpentAttacking).toBe(15);
  });

  it("caps cards and adds a truthful truncation note when there are more than the cap", () => {
    const combat: CombatManpowerLoss[] = Array.from({ length: 105 }, (_, i) =>
      loss({ attackerId: "player-1", defenderId: "player-2", manpowerLoss: i + 1, x: i, y: i, at: 1_000 + i })
    );
    const timeline = aggregatePersonalActivity("player-1", { from: 0, to: 1_000_000 }, [], combat);
    expect(timeline.cards).toHaveLength(100);
    const note = timeline.cards.find((card) => card.kind === "TRUNCATION_NOTE");
    expect(note).toBeDefined();
    expect((note as { hiddenCount: number }).hiddenCount).toBe(6);
    // The 6 lowest-impact (lowest manpowerLoss) combats were the ones dropped.
    const keptManpowerValues = timeline.cards
      .filter((card) => card.kind === "COMBAT")
      .map((card) => (card as { manpowerLoss: number }).manpowerLoss)
      .sort((a, b) => a - b);
    expect(keptManpowerValues[0]).toBe(7);
  });
});
