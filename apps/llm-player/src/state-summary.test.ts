import { describe, expect, it } from "vitest";
import type { DomainState, GameInitState, GameTile } from "./game-types.js";
import { IntentLedger } from "./intent-ledger.js";
import { summarizeTurn } from "./state-summary.js";
import { buildTileIndex } from "./viewport.js";

const PLAYER = "me";
const AMPLE = { supply: { FOOD: 99, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };

const NO_DOMAINS: DomainState = { domainIds: [], openChoiceIds: [], catalog: [], strategicResources: {} };

const stateWith = (tiles: GameTile[]): GameInitState => ({
  playerId: PLAYER,
  playerName: "Bot",
  gold: 1_000,
  manpower: 100,
  manpowerCap: 150,
  manpowerRegenPerMinute: 0.2,
  tiles,
  eventLog: [],
  autoSettlementQueue: [],
  techIds: [],
  resourceSlots: AMPLE,
  domains: NO_DOMAINS
});

const summarize = (ledger: IntentLedger, tiles: GameTile[], turn = 2, overrides: Partial<GameInitState> = {}) => {
  const state = { ...stateWith(tiles), ...overrides };
  return summarizeTurn(
    buildTileIndex(state),
    { ...state, resourceSlots: AMPLE },
    { x: 0, y: 0 },
    [],
    ledger,
    turn
  );
};

describe("summarizeTurn intent-ledger wiring", () => {
  const tiles: GameTile[] = [
    { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
    { x: 1, y: 0 }
  ];

  it("withholds a tech with a pending intent from techChoices", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "TECH", techId: "agriculture" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.techChoices.map((choice) => choice.id)).not.toContain("agriculture");
    expect(context.techChoices.map((choice) => choice.id)).toContain("trade");
  });

  it("withholds a structure site whose tile has a pending build, from both site lists", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "STRUCTURE", x: 0, y: 0, structureType: "RELAY_BEACON" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.beaconSites).toEqual([]);
    expect(context.structureSites.filter((site) => site.x === 0 && site.y === 0)).toEqual([]);
  });

  it("offers the same site when nothing is pending", () => {
    const context = summarize(new IntentLedger(), tiles);
    expect(context.beaconSites).toEqual([{ x: 0, y: 0 }]);
    expect(context.structureSites.map((site) => site.structureType)).toContain("WOODEN_FORT");
  });

  it("passes the ledger's summary lines through as recentOutcomes", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "TECH", techId: "agriculture" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.recentOutcomes).toEqual([expect.stringContaining("PENDING CHOOSE_TECH(agriculture)")]);
  });
});

describe("summarizeTurn domainChoices", () => {
  const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
  const domains: DomainState = {
    domainIds: [],
    openChoiceIds: ["frontier-doctrine"],
    catalog: [
      {
        id: "frontier-doctrine",
        tier: 1,
        name: "Frontier Doctrine",
        description: "faster settling",
        requiresTechId: "organized-supply",
        goldCost: 40,
        resourceCost: {},
        needsResourceChoice: false
      }
    ],
    strategicResources: {}
  };
  const withTech = { techIds: ["organized-supply"], domains };

  it("offers an open, affordable domain whose tech is owned", () => {
    expect(summarize(new IntentLedger(), tiles, 2, withTech).domainChoices.map((choice) => choice.id)).toEqual(["frontier-doctrine"]);
  });

  it("withholds the domain while a domain intent is pending", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "DOMAIN", domainId: "frontier-doctrine" }, 1, 1_000);
    expect(summarize(ledger, tiles, 2, withTech).domainChoices).toEqual([]);
  });
});

describe("summarizeTurn compact viewport", () => {
  const tiles: GameTile[] = [
    { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
    { x: 1, y: 0, ownerId: "rival", ownershipState: "SETTLED" },
    { x: 2, y: 0, resource: "FARM" },
    { x: 3, y: 0, townType: "MARKET" },
    { x: 4, y: 0, terrain: "LAND" },
    { x: 5, y: 0, terrain: "SEA" },
    { x: 6, y: 0 }
  ];

  it("keeps owned, rival and notable tiles and drops plain unowned land, counting what it dropped", () => {
    const context = summarize(new IntentLedger(), tiles);
    expect(context.viewport.map((tile) => tile.x).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(context.viewportOmittedPlainTiles).toBe(3);
  });
});
