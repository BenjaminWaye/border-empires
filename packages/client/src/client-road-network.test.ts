import { describe, expect, it } from "vitest";
import { buildRoadNetwork } from "./client-road-network.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrapX = (x: number): number => x;
const wrapY = (y: number): number => y;

const makeTown = (populationTier: NonNullable<NonNullable<Tile["town"]>["populationTier"]>, type: "MARKET" | "FARMING" = "MARKET") => ({
  type,
  baseGoldPerMinute: 0,
  supportCurrent: 0,
  supportMax: 0,
  goldPerMinute: 0,
  cap: 0,
  isFed: true,
  population: 0,
  maxPopulation: 0,
  populationTier,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  connectedTownNames: [],
  hasMarket: false,
  marketActive: false,
  hasGranary: false,
  granaryActive: false,
  hasBank: false,
  bankActive: false
});

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  ...overrides
});

describe("buildRoadNetwork", () => {
  it("connects towns through settled land", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(0, 0), makeTile(0, 0, { town: makeTown("TOWN") })],
      [keyFor(1, 0), makeTile(1, 0)],
      [keyFor(2, 0), makeTile(2, 0)],
      [keyFor(3, 0), makeTile(3, 0, { town: makeTown("CITY", "FARMING") })]
    ]);

    const roads = buildRoadNetwork({ tiles, keyFor, wrapX, wrapY });
    expect(roads.get("0,0")).toMatchObject({ east: true, terminal: true });
    expect(roads.get("1,0")).toMatchObject({ west: true, east: true });
    expect(roads.get("2,0")).toMatchObject({ west: true, east: true });
    expect(roads.get("3,0")).toMatchObject({ west: true, terminal: true });
  });

  it("includes settlements as valid road endpoints", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(0, 0), makeTile(0, 0, { town: makeTown("SETTLEMENT") })],
      [keyFor(1, 0), makeTile(1, 0)],
      [keyFor(2, 0), makeTile(2, 0, { town: makeTown("TOWN") })]
    ]);

    const roads = buildRoadNetwork({ tiles, keyFor, wrapX, wrapY });
    expect(roads.get("0,0")).toMatchObject({ east: true, terminal: true });
    expect(roads.get("1,0")).toMatchObject({ west: true, east: true });
    expect(roads.get("2,0")).toMatchObject({ west: true, terminal: true });
  });
});
