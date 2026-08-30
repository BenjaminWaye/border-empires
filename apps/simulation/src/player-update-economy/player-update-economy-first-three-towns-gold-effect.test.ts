import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { townGoldPerMinuteForPlayer } from "./player-update-economy.js";

const makePlayer = (domainIds: string[]): DomainPlayer => ({
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set(domainIds),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: { FOOD: 10 }
});

const makeTownTile = (): DomainTileState => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: {
    type: "FARMING",
    populationTier: "TOWN",
    supportCurrent: 5,
    supportMax: 5,
    isFed: true,
    baseGoldPerMinute: 2,
    population: 1000,
    maxPopulation: 25_000,
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMintworks: false,
    mintworksActive: false,
    hasGranary: false,
    granaryActive: false
  }
});

// Regression guard against the class of bug the Aether Condenser hit: a
// modifier can render correctly (or, before this fix, incorrectly) in the
// tile overview while never actually touching the number it claims to
// change. This asserts the actual gold math, not just the wire field a
// display layer reads.
describe("townGoldPerMinuteForPlayer — Mercantile Charter actually changes gold, not just the display field", () => {
  it("produces exactly 1.5x the gold for a first-three town when the player holds Mercantile Charter", () => {
    const tile = makeTownTile();
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set(["10,10"]);
    const firstThreeTownKeys = new Set(["10,10"]);

    const withoutDomain = townGoldPerMinuteForPlayer(makePlayer([]), tile, tile.town!, tiles, fedTownKeys, firstThreeTownKeys);
    const withDomain = townGoldPerMinuteForPlayer(makePlayer(["mercantile-charter"]), tile, tile.town!, tiles, fedTownKeys, firstThreeTownKeys);

    expect(withDomain).toBeCloseTo(withoutDomain * 1.5, 6);
  });

  it("does not boost gold for a town that is not in the first-three set", () => {
    const tile = makeTownTile();
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set(["10,10"]);
    const notFirstThree = new Set(["99,99"]);

    const withoutDomain = townGoldPerMinuteForPlayer(makePlayer([]), tile, tile.town!, tiles, fedTownKeys, notFirstThree);
    const withDomain = townGoldPerMinuteForPlayer(makePlayer(["mercantile-charter"]), tile, tile.town!, tiles, fedTownKeys, notFirstThree);

    expect(withDomain).toBeCloseTo(withoutDomain, 6);
  });
});
