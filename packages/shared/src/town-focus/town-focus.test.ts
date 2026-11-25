import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "../messages/messages.js";
import {
  TOWN_FOCUS_MAX_TILES_PER_COMMAND,
  activeTownFocus,
  promoteTownFocus,
  queueTownFocus,
  townFocusChangeDue,
  townFocusMultipliers,
  withoutTownFocus
} from "./town-focus.js";

describe("town focus rules", () => {
  it("treats a town with no focus as Balanced with no multiplier", () => {
    expect(activeTownFocus({})).toBe("BALANCED");
    expect(townFocusMultipliers(undefined)).toEqual({ growth: 1, manpowerRegen: 1, coin: 1 });
  });

  it("gives each focus +20% to its output and −10% to the other two", () => {
    expect(townFocusMultipliers({ focus: "GROWTH" })).toEqual({ growth: 1.2, manpowerRegen: 0.9, coin: 0.9 });
    expect(townFocusMultipliers({ focus: "LEVY" })).toEqual({ growth: 0.9, manpowerRegen: 1.2, coin: 0.9 });
    expect(townFocusMultipliers({ focus: "COMMERCE" })).toEqual({ growth: 0.9, manpowerRegen: 0.9, coin: 1.2 });
  });

  it("queues a change without touching the active focus", () => {
    const queued = queueTownFocus({ population: 5 }, "LEVY", 1_000);
    expect(queued).toEqual({ population: 5, pendingFocus: "LEVY", pendingFocusAt: 1_000 });
    expect(activeTownFocus(queued)).toBe("BALANCED");
  });

  it("returns the same object when nothing would change, so callers skip the write", () => {
    const town = { focus: "LEVY" as const };
    expect(queueTownFocus(town, "LEVY", 1_000)).toBe(town);
    const queued = { pendingFocus: "GROWTH" as const, pendingFocusAt: 1_000 };
    expect(queueTownFocus(queued, "GROWTH", 1_000)).toBe(queued);
  });

  it("cancels a queued change when the player picks the active focus again", () => {
    expect(queueTownFocus({ focus: "LEVY", pendingFocus: "GROWTH", pendingFocusAt: 1_000 }, "LEVY", 2_000)).toEqual({ focus: "LEVY" });
  });

  it("is due only from its effective time", () => {
    const queued = { pendingFocus: "GROWTH" as const, pendingFocusAt: 1_000 };
    expect(townFocusChangeDue(queued, 999)).toBe(false);
    expect(townFocusChangeDue(queued, 1_000)).toBe(true);
    expect(townFocusChangeDue({ focus: "GROWTH" }, 5_000)).toBe(false);
  });

  it("promotes the queued focus and stores Balanced as absent", () => {
    expect(promoteTownFocus({ pendingFocus: "COMMERCE", pendingFocusAt: 1 })).toEqual({ focus: "COMMERCE" });
    expect(promoteTownFocus({ focus: "LEVY", pendingFocus: "BALANCED", pendingFocusAt: 1 })).toEqual({});
  });

  it("strips every focus field", () => {
    expect(withoutTownFocus({ population: 3, focus: "LEVY", pendingFocus: "GROWTH", pendingFocusAt: 1 })).toEqual({ population: 3 });
  });
});

describe("SET_TOWN_FOCUS message", () => {
  const tiles = (count: number) => Array.from({ length: count }, (_, x) => ({ x, y: 0 }));

  it("accepts a bounded list of towns and one focus", () => {
    expect(ClientMessageSchema.safeParse({ type: "SET_TOWN_FOCUS", tiles: tiles(2), focus: "LEVY" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "SET_TOWN_FOCUS", tiles: tiles(TOWN_FOCUS_MAX_TILES_PER_COMMAND), focus: "GROWTH" }).success).toBe(true);
  });

  it("rejects an empty list, an oversized list and an unknown focus", () => {
    expect(ClientMessageSchema.safeParse({ type: "SET_TOWN_FOCUS", tiles: [], focus: "LEVY" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "SET_TOWN_FOCUS", tiles: tiles(TOWN_FOCUS_MAX_TILES_PER_COMMAND + 1), focus: "LEVY" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "SET_TOWN_FOCUS", tiles: tiles(1), focus: "PLUNDER" }).success).toBe(false);
  });
});
