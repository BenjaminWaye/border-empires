import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { applyPlayerMessageToSnapshot } from "./subscription-snapshot-sync.js";

const snapshot = (): PlayerSubscriptionSnapshot => ({
  playerId: "player-1",
  player: {
    id: "player-1",
    gold: 100,
    manpower: 10,
    manpowerCap: 100,
    incomePerMinute: 1,
    strategicResources: { FOOD: 0, IRON: 25, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
    strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
    developmentProcessLimit: 2,
    activeDevelopmentProcessCount: 0,
    pendingSettlements: [],
    techIds: [],
    domainIds: [],
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    modBreakdown: {
      attack: [{ label: "Base", mult: 1 }],
      defense: [{ label: "Base", mult: 1 }],
      income: [{ label: "Base", mult: 1 }],
      vision: [{ label: "Base", mult: 1 }]
    }
  },
  tiles: []
});

describe("applyPlayerMessageToSnapshot", () => {
  it("keeps progression modifiers in cached snapshots after tech updates", () => {
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "TECH_UPDATE",
      gold: 75,
      techIds: ["tribal-warfare"],
      mods: { attack: 1.05, defense: 1.05, income: 1, vision: 1 },
      modBreakdown: {
        attack: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        defense: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        income: [{ label: "Base", mult: 1 }],
        vision: [{ label: "Base", mult: 1 }]
      }
    });

    expect(updated.player?.gold).toBe(75);
    expect(updated.player?.techIds).toEqual(["tribal-warfare"]);
    expect(updated.player?.mods?.attack).toBe(1.05);
    expect(updated.player?.modBreakdown?.attack).toContainEqual({ label: "Warbands", mult: 1.05 });
  });
});
