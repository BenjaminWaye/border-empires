import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SETTLE_COST } from "@border-empires/shared";
import { resolvePendingSettlement, type SettlementResolutionContext } from "./runtime-settlement-resolution.js";

// The occupation survey is meant to fire when you garrison a *neutral* town:
// it used to fire only when capturing an enemy town, so players expanding
// peacefully never got a report.
const town = (overrides: Record<string, unknown> = {}) => ({ type: "MARKET", populationTier: "TOWN", population: 100, ...overrides }) as unknown as DomainTileState["town"];

const setup = (townState: DomainTileState["town"] | undefined) => {
  const player: DomainPlayer = { id: "p1", isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
  const tiles = new Map<string, DomainTileState>([
    ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", ...(townState ? { town: townState } : {}) }],
    ["14,10", { x: 14, y: 10, terrain: "LAND", prospectSignature: "FERROUS_DUST" }]
  ]);
  const record = { ownerId: "p1", tileKey: "10,10", startedAt: 0, resolvesAt: 1, goldCost: SETTLE_COST, commandId: "c1" };
  const pending = new Map([["10,10", record]]);
  const noop = (): void => undefined;
  const context: SettlementResolutionContext = {
    pendingSettlementsByTile: pending,
    tiles,
    players: new Map([["p1", player]]),
    removePendingSettlement: (key) => pending.delete(key),
    drainDevQueue: noop,
    retireQueuedSettlement: noop,
    drainAutoSettle: () => 0,
    drainBuildTail: noop,
    emitPlayerStateUpdate: noop,
    now: () => 1000,
    replaceTileState: (key, tile) => tiles.set(key, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: noop,
    emitAutoFillForSettlement: noop
  };
  resolvePendingSettlement(context, record);
  return player.eventLog?.filter((entry) => entry.type === "OCCUPATION_SURVEY") ?? [];
};

describe("resolvePendingSettlement occupation survey", () => {
  it("files a survey report when garrisoning a neutral town", () => {
    expect(setup(town()).map((entry) => entry.surveyResource)).toEqual(["TITANIUM"]);
  });

  it("does not survey a town taken from another empire", () => {
    expect(setup(town({ populationBeforeCapture: 200 }))).toEqual([]);
  });

  it("does not survey plain land", () => {
    expect(setup(undefined)).toEqual([]);
  });
});
