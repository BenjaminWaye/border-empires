import { describe, expect, it } from "vitest";
import { intentFromAction, isFireAndForgetAction, withholdReason } from "./fire-and-forget.js";
import type { GameInitState } from "./game-types.js";
import { IntentLedger } from "./intent-ledger.js";

const DOMAIN_ENTRY = {
  id: "frontier-doctrine",
  tier: 1,
  name: "Frontier Doctrine",
  description: "faster settling",
  requiresTechId: "organized-supply",
  goldCost: 40,
  resourceCost: {},
  needsResourceChoice: false
};

const stateWith = (overrides: Partial<GameInitState> = {}): GameInitState => ({
  playerId: "me",
  playerName: "Bot",
  gold: 500,
  manpower: 100,
  manpowerCap: 150,
  manpowerRegenPerMinute: 0.2,
  tiles: [],
  eventLog: [],
  autoSettlementQueue: [],
  techIds: ["organized-supply"],
  resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } },
  domains: { domainIds: [], openChoiceIds: ["frontier-doctrine"], catalog: [DOMAIN_ENTRY], strategicResources: {} },
  ...overrides
});

describe("withholdReason", () => {
  const pick = { type: "CHOOSE_DOMAIN", domainId: "frontier-doctrine" } as const;

  it("lets an offered domain through", () => {
    expect(withholdReason(pick, stateWith(), new IntentLedger())).toBeUndefined();
  });

  it("stops a domain id that isn't in domainChoices (stale or invented) -- picks are permanent", () => {
    expect(withholdReason({ type: "CHOOSE_DOMAIN", domainId: "made-up" }, stateWith(), new IntentLedger())).toContain("domainChoices");
    expect(withholdReason(pick, stateWith({ gold: 10 }), new IntentLedger())).toContain("domainChoices");
  });

  it("stops a domain while the ledger has any domain pending", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "DOMAIN", domainId: "mercantile-charter" }, 1, 1_000);
    expect(withholdReason(pick, stateWith(), ledger)).toContain("pending");
  });

  it("stops a tech that isn't currently reachable and affordable", () => {
    expect(withholdReason({ type: "CHOOSE_TECH", techId: "not-a-tech" }, stateWith(), new IntentLedger())).toContain("techChoices");
    expect(withholdReason({ type: "CHOOSE_TECH", techId: "agriculture" }, stateWith({ gold: 0 }), new IntentLedger())).toContain("techChoices");
    expect(withholdReason({ type: "CHOOSE_TECH", techId: "agriculture" }, stateWith(), new IntentLedger())).toBeUndefined();
  });
});

describe("action helpers", () => {
  it("maps each action to its intent kind", () => {
    expect(intentFromAction({ type: "CHOOSE_DOMAIN", domainId: "d" })).toEqual({ kind: "DOMAIN", domainId: "d" });
    expect(intentFromAction({ type: "CHOOSE_TECH", techId: "t" })).toEqual({ kind: "TECH", techId: "t" });
    expect(intentFromAction({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "MINE" })).toEqual({
      kind: "STRUCTURE",
      x: 1,
      y: 2,
      structureType: "MINE"
    });
  });

  it("recognises only the no-ack action types", () => {
    expect(isFireAndForgetAction({ type: "CHOOSE_DOMAIN" })).toBe(true);
    expect(isFireAndForgetAction({ type: "SETTLE" })).toBe(false);
    expect(isFireAndForgetAction({ type: "PAN_CAMERA" })).toBe(false);
  });
});
