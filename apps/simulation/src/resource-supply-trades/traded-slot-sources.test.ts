import { expect, it } from "vitest";
import { emptyResourceSlotSources } from "@border-empires/shared";
import { tradedSlotSources } from "./traded-slot-sources.js";

it("shows both rights directions without mutating physical sources or counting network supplies as upkeep", () => {
  const physical = emptyResourceSlotSources();
  physical.FOOD.push({ kind: "TILE", id: "FARM", slots: 10, count: 10 });
  const result = tradedSlotSources(physical, { incoming: { FOOD: 3, NEURAL_RESIN: 1 }, outgoing: { FOOD: 2 } });
  expect(result.FOOD).toEqual([
    { kind: "TILE", id: "FARM", slots: 10, count: 10 },
    { kind: "TRADE_IMPORT", id: "", slots: 3, count: 1 },
    { kind: "TRADE_EXPORT", id: "", slots: -2, count: 1 }
  ]);
  expect(physical.FOOD).toHaveLength(1);
  expect(result.FOOD.reduce((sum, row) => sum + row.slots, 0)).toBe(11);
});
