import { describe, expect, it, vi } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { handleSetTownFocusCommand, type TownFocusCommandContext } from "./town-focus-command.js";
import { promoteDueTownFocus } from "./town-focus-promotion.js";
import { applyTileToPlayerSummary, createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { playerManpowerBreakdownFromSummary, playerManpowerCapFromSummary, playerManpowerRegenPerMinuteFromSummary } from "../runtime-manpower.js";
import { withoutForeignTownFocus } from "../runtime-tile-write-rules/runtime-tile-write-rules.js";
import { townGoldPerMinuteForPlayer } from "../player-update-economy/player-update-economy.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

const NOW = 1_800_000_000_000;
const player = (id: string): DomainPlayer => ({
  id, isAi: false, points: 0, manpower: 0, techIds: new Set<string>(), allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 }, strategicResources: {}
});
const townTile = (x: number, ownerId: string, town: Partial<NonNullable<DomainTileState["town"]>> = {}): DomainTileState => ({
  x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", ...town }
});

const commandFixture = (tiles: DomainTileState[]) => {
  const map = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const events: SimulationEvent[] = [];
  const replaceTileState = vi.fn((key: string, tile: DomainTileState) => { map.set(key, tile); });
  const context: TownFocusCommandContext = {
    players: new Map([["p1", player("p1")], ["p2", player("p2")]]),
    tiles: map,
    now: () => NOW,
    emitEvent: (event) => { events.push(event); },
    replaceTileState,
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta
  };
  return { map, events, replaceTileState, context };
};
const command = (payload: unknown, playerId = "p1"): CommandEnvelope =>
  ({ commandId: "c1", sessionId: "s", playerId, clientSeq: 1, issuedAt: NOW, type: "SET_TOWN_FOCUS", payloadJson: JSON.stringify(payload) }) as CommandEnvelope;

describe("SET_TOWN_FOCUS", () => {
  it("stores the focus as due now, for the promotion after the next growth tick", () => {
    const { map, events, context } = commandFixture([townTile(1, "p1")]);
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 1, y: 0 }], focus: "LEVY" }));
    expect(map.get("1,0")?.town).toMatchObject({ pendingFocus: "LEVY", pendingFocusAt: NOW });
    expect(map.get("1,0")?.town?.focus).toBeUndefined();
    expect(events.map((event) => event.eventType)).toEqual(["TILE_DELTA_BATCH", "COMMAND_RESOLVED"]);
  });

  it("skips duplicates and towns the sender does not own, and applies the rest", () => {
    const { map, replaceTileState, context } = commandFixture([townTile(1, "p1"), townTile(2, "p2")]);
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], focus: "GROWTH" }));
    expect(replaceTileState).toHaveBeenCalledTimes(1);
    expect(map.get("2,0")?.town?.pendingFocus).toBeUndefined();
  });

  it("rejects when none of the towns are the sender's", () => {
    const { events, replaceTileState, context } = commandFixture([townTile(2, "p2")]);
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 2, y: 0 }], focus: "GROWTH" }));
    expect(replaceTileState).not.toHaveBeenCalled();
    expect(events).toMatchObject([{ eventType: "COMMAND_REJECTED", code: "TOWN_FOCUS_INVALID" }]);
  });

  it("writes nothing when the request changes nothing", () => {
    const { events, replaceTileState, context } = commandFixture([townTile(1, "p1", { focus: "LEVY" })]);
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 1, y: 0 }], focus: "LEVY" }));
    expect(replaceTileState).not.toHaveBeenCalled();
    expect(events.map((event) => event.eventType)).toEqual(["COMMAND_RESOLVED"]);
  });

  it("rejects a malformed payload", () => {
    const { events, context } = commandFixture([townTile(1, "p1")]);
    handleSetTownFocusCommand(context, command({ tiles: [], focus: "LEVY" }));
    expect(events).toMatchObject([{ eventType: "COMMAND_REJECTED", code: "BAD_COMMAND" }]);
  });
});

describe("promoteDueTownFocus", () => {
  const promotionFixture = (tiles: DomainTileState[]) => {
    const map = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const order: string[] = [];
    const deps = {
      players: new Map([["p1", player("p1")]]),
      tiles: map,
      summaryForPlayer: () => {
        const summary = createEmptyPlayerRuntimeSummary();
        for (const [key, tile] of map) applyTileToPlayerSummary(summary, key, tile);
        return summary;
      },
      settleEconomy: (at: number, ids: readonly string[]) => { order.push(`settle:${ids.join()}@${at}`); },
      replaceTileState: (key: string, tile: DomainTileState) => { order.push(`write:${key}`); map.set(key, tile); },
      emitEvent: () => {},
      tileDeltaFromState: (tile: DomainTileState) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitPlayerStateUpdate: vi.fn()
    };
    return { map, order, deps };
  };

  it("does nothing when no town has a pending focus", () => {
    const { order, deps } = promotionFixture([townTile(1, "p1", { focus: "LEVY" })]);
    expect(promoteDueTownFocus(deps, NOW)).toBe(0);
    expect(order).toEqual([]);
  });

  // Changes now apply within a minute: one queued for a later refill under the old rule must not wait hours.
  it("promotes a change queued for a later refill at once", () => {
    const { map, deps } = promotionFixture([townTile(1, "p1", { pendingFocus: "COMMERCE", pendingFocusAt: NOW + 3 * 60 * 60_000 })]);
    expect(promoteDueTownFocus(deps, NOW)).toBe(1);
    expect(map.get("1,0")?.town).toMatchObject({ focus: "COMMERCE" });
  });

  it("applies only the last of several picks made between growth ticks", () => {
    const { map, context } = commandFixture([townTile(1, "p1")]);
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 1, y: 0 }], focus: "GROWTH" }));
    handleSetTownFocusCommand(context, command({ tiles: [{ x: 1, y: 0 }], focus: "COMMERCE" }));
    const { deps } = promotionFixture([map.get("1,0")!]);
    promoteDueTownFocus(deps, NOW);
    expect(deps.tiles.get("1,0")?.town).toMatchObject({ focus: "COMMERCE" });
  });

  it("settles the owner at the old rates before making the focus active", () => {
    const { map, order, deps } = promotionFixture([townTile(1, "p1", { pendingFocus: "LEVY", pendingFocusAt: NOW })]);
    expect(promoteDueTownFocus(deps, NOW)).toBe(1);
    expect(order).toEqual([`settle:p1@${NOW}`, "write:1,0"]);
    expect(map.get("1,0")?.town).toMatchObject({ focus: "LEVY" });
    expect(map.get("1,0")?.town?.pendingFocus).toBeUndefined();
    expect(deps.emitPlayerStateUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("town focus output", () => {
  const summaryWith = (town: Partial<NonNullable<DomainTileState["town"]>>) => {
    const summary = createEmptyPlayerRuntimeSummary();
    applyTileToPlayerSummary(summary, "1,0", townTile(1, "p1", town));
    return summary;
  };

  it("scales a town's manpower regen but never its cap", () => {
    const balanced = summaryWith({});
    const levy = summaryWith({ focus: "LEVY" });
    const growth = summaryWith({ focus: "GROWTH" });
    const townRegen = playerManpowerRegenPerMinuteFromSummary(balanced);
    expect(playerManpowerCapFromSummary(levy)).toBe(playerManpowerCapFromSummary(balanced));
    expect(playerManpowerRegenPerMinuteFromSummary(levy)).toBeCloseTo(townRegen * 1.2, 9);
    expect(playerManpowerRegenPerMinuteFromSummary(growth)).toBeCloseTo(townRegen * 0.9, 9);
  });

  it("adds a town focus line so the manpower breakdown sums to the real regen", () => {
    const levy = summaryWith({ focus: "LEVY" });
    const breakdown = playerManpowerBreakdownFromSummary(levy);
    expect(breakdown.regen.find((line) => line.label === "Town focus")).toBeDefined();
    expect(breakdown.regen.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(playerManpowerRegenPerMinuteFromSummary(levy), 9);
  });

  it("scales a town's Coin", () => {
    const owner = player("p1");
    const gold = (town: Partial<NonNullable<DomainTileState["town"]>>) => {
      const tile = townTile(1, "p1", { populationTier: "SETTLEMENT", ...town });
      return townGoldPerMinuteForPlayer(owner, tile, tile.town!, new Map([["1,0", tile]]), new Set(["1,0"]));
    };
    expect(gold({ focus: "COMMERCE" })).toBeCloseTo(gold({}) * 1.2, 12);
    expect(gold({ focus: "LEVY" })).toBeCloseTo(gold({}) * 0.9, 12);
  });
});

describe("withoutForeignTownFocus", () => {
  it("clears the focus when the town changes hands", () => {
    const before = townTile(1, "p1", { focus: "LEVY", pendingFocus: "GROWTH", pendingFocusAt: NOW });
    const after = withoutForeignTownFocus(before, { ...before, ownerId: "p2" });
    expect(after.town?.focus).toBeUndefined();
    expect(after.town?.pendingFocus).toBeUndefined();
    expect(after.town?.pendingFocusAt).toBeUndefined();
  });

  it("keeps the focus while the owner stays the same", () => {
    const before = townTile(1, "p1", { focus: "LEVY" });
    const next = { ...before, town: { ...before.town!, population: 10 } };
    expect(withoutForeignTownFocus(before, next)).toBe(next);
  });
});
