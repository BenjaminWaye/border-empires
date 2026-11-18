import type { PersonalActivityCard } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { combatCardText, combatGroupCardText, siegeCardText } from "./client-activity-dashboard-combat-text.js";

type CombatCard = Extract<PersonalActivityCard, { kind: "COMBAT" }>;
type GroupCard = Extract<PersonalActivityCard, { kind: "COMBAT_GROUP" }>;

const names = (id: string): string | undefined => ({ maren: "Maren", hugo: "Hugo", kara: "Kara" })[id];

const combat = (overrides: Partial<CombatCard> = {}): CombatCard => ({
  kind: "COMBAT",
  id: "c",
  occurredAt: 0,
  attackerId: "maren",
  defenderId: "me",
  attackerWon: false,
  manpowerLoss: 50,
  x: 1,
  y: 1,
  pillagedGold: 0,
  defenderGoldLoss: 0,
  targetWasSettled: true,
  ...overrides
});

const group = (overrides: Partial<GroupCard> = {}): GroupCard => ({
  kind: "COMBAT_GROUP",
  id: "g",
  occurredAt: 0,
  role: "ATTACKER",
  counterpartyPlayerId: "maren",
  attempts: 3,
  captures: 0,
  originsSeized: 0,
  manpowerLoss: 150,
  pillagedGold: 0,
  defenderGoldLoss: 0,
  x: 1,
  y: 1,
  ...overrides
});

describe("combatCardText", () => {
  it("tells a repelled attack and the seized launch tile as one event", () => {
    expect(combatCardText(combat({ originSeized: true }), "me", names)).toBe("Repelled Maren and seized the tile they attacked from");
  });

  it("names the fortification on defended rows", () => {
    expect(combatCardText(combat({ attackerId: "kara", defenseVariant: "PALISADE" }), "me", names)).toBe("Your Palisade repelled Kara");
    expect(combatCardText(combat({ attackerId: "hugo", attackerWon: true, defenseVariant: "FORT" }), "me", names)).toBe("Your Fort fell to Hugo");
  });

  it("shows the player's own manpower cost on their attacks", () => {
    expect(combatCardText(combat({ attackerId: "me", defenderId: "maren", defenseVariant: "FORT" }), "me", names)).toBe("Your attack on Maren was repelled by their Fort · −50 manpower");
    expect(combatCardText(combat({ attackerId: "me", defenderId: "hugo", attackerWon: true, pillagedGold: 12 }), "me", names)).toBe("Captured a tile from Hugo · +12 coin plundered · −50 manpower");
  });

  it("drops a gold amount that rounds to zero", () => {
    expect(combatCardText(combat({ attackerId: "hugo", attackerWon: true, defenderGoldLoss: 0.3 }), "me", names)).toBe("Lost a tile to Hugo");
  });
});

describe("defense labels", () => {
  it("falls back to a generic word for a fortification this client doesn't know", () => {
    expect(combatCardText(combat({ defenseVariant: "SKY_CITADEL" as never }), "me", names)).toBe("Your fortification repelled Maren");
  });
});

describe("combatGroupCardText", () => {
  it("summarizes the player's own pushes", () => {
    expect(combatGroupCardText(group(), names)).toBe("Your assault on Maren: 3 attacks, all repelled · −150 manpower");
    expect(combatGroupCardText(group({ counterpartyPlayerId: "hugo", attempts: 2, captures: 2, manpowerLoss: 100 }), names)).toBe("Took 2 tiles from Hugo · −100 manpower");
    expect(combatGroupCardText(group({ captures: 1, originsSeized: 1 }), names)).toBe("Your assault on Maren: 3 attacks, 1 tile taken · they seized 1 launch tile · −150 manpower");
    expect(combatGroupCardText(group({ counterpartyPlayerId: undefined, attempts: 2, captures: 2 }), names)).toBe("Took 2 unclaimed tiles · −150 manpower");
  });

  it("summarizes a rival's raids on the player", () => {
    const raid = { role: "DEFENDER" as const, counterpartyPlayerId: "kara" };
    expect(combatGroupCardText(group({ ...raid, originsSeized: 1 }), names)).toBe("Repelled 3 attacks from Kara · seized 1 of their tiles");
    expect(combatGroupCardText(group({ ...raid, captures: 1 }), names)).toBe("Kara attacked 3 times: 2 repelled, 1 tile lost");
    expect(combatGroupCardText(group({ ...raid, attempts: 2, captures: 2, defenderGoldLoss: 40 }), names)).toBe("Lost 2 tiles to Kara · −40 coin raided from you");
  });
});

describe("attacks on you, in plain words", () => {
  const siege = (overrides: Partial<Extract<PersonalActivityCard, { kind: "SIEGE" }>> = {}): Extract<PersonalActivityCard, { kind: "SIEGE" }> => ({
    kind: "SIEGE", id: "s", occurredAt: 60_000, startedAt: 0, x: 1, y: 1, outcome: "FELL", assaultsRepelled: 0, originsSeized: 0,
    attackerIds: ["kara"], manpowerSpentAgainst: 220, capturedBy: "kara", ...overrides
  });

  it("names who took the tile, without 'siege' or the attackers' manpower", () => {
    const text = siegeCardText(siege(), names);
    expect(text).toBe("Kara took your tile after 1m of attacks");
    expect(text).not.toMatch(/siege|manpower|assault/i);
  });

  // Review of #2774: a siege also closes as FELL when the tile goes to a capture none of the logged
  // assaults made (a barbarian take, say), so "after N+1 attacks" over-counted and credited the taker.
  it("counts only the repelled attacks it knows about", () => {
    expect(siegeCardText(siege({ assaultsRepelled: 3, capturedBy: "barbarian-1" }), names)).not.toContain("4 attacks");
    expect(siegeCardText(siege({ assaultsRepelled: 3 }), names)).toBe("Kara took your tile after 1m of attacks · 3 repelled");
  });

  it("says a tile held, and who attacked it", () => {
    const { capturedBy: _capturedBy, ...holding } = siege({ outcome: "HOLDING", assaultsRepelled: 5, attackerIds: ["kara", "hugo"] });
    expect(siegeCardText(holding, names))
      .toBe("Your tile held: repelled 5 attacks from Kara and Hugo");
  });
});
