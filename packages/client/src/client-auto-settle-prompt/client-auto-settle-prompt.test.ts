// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEW_PLAYER_AUTO_SETTLE_PREFS, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { applyAutoSettlementQueueFromServer } from "../client-development-queue/client-development-queue.js";
import { installAutoSettlePrompt, refreshAutoSettlePrompt } from "./client-auto-settle-prompt.js";
import { buildAutoSettlePromptModel, townFoodWarning, yieldSummary } from "./client-auto-settle-prompt-model.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const stubSessionStorage = (): void => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear()
  });
};

// A brand-new empire: capital at (10,10), a town two tiles away and three farms/fish further out.
const newPlayerState = () => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 1_000;
  state.manpower = 720;
  state.manpowerCap = 720;
  state.homeTile = { x: 10, y: 10 };
  state.autoSettle = { ...NEW_PLAYER_AUTO_SETTLE_PREFS };
  const own = (x: number, y: number, extra: Record<string, unknown>) =>
    state.tiles.set(keyFor(x, y), { x, y, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", ...extra } as never);
  own(12, 10, { town: { name: "Town", type: "FARMING", populationTier: "TOWN" } });
  own(13, 10, { resource: "FARM" });
  own(11, 12, { resource: "FARM" });
  own(9, 8, { resource: "FISH" });
  return state;
};

const QUEUE = [{ x: 13, y: 10 }, { x: 12, y: 10 }, { x: 9, y: 8 }, { x: 11, y: 12 }];

describe("auto-settle join prompt: nothing settles on the client until the player answers", () => {
  beforeEach(() => stubSessionStorage());

  it("does not fill the client development queue for a new player, but does once a category is allowed", () => {
    const state = newPlayerState();
    expect(applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor })).toBe(0);
    expect(state.developmentQueue).toEqual([]);

    // Answered: food only. The town must still be held back.
    const added = applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor, autoSettle: { answered: true, towns: false, food: true, resources: false } });
    expect(added).toBe(3);
    expect(state.developmentQueue.map((entry) => entry.tileKey).sort()).toEqual(["11,12", "13,10", "9,8"]);
  });

  it("legacy servers that send no prefs keep the old behavior (everything allowed)", () => {
    const state = newPlayerState();
    state.autoSettle = undefined;
    expect(applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor })).toBe(4);
  });
});

describe("buildAutoSettlePromptModel", () => {
  it("groups candidates by category, nearest to the capital first, and skips tiles that aren't mine + FRONTIER", () => {
    const state = newPlayerState();
    state.tiles.set("20,20", { x: 20, y: 20, terrain: "LAND", ownerId: "someone-else", ownershipState: "FRONTIER", resource: "FARM" } as never);
    state.autoSettlementQueue = [...QUEUE, { x: 20, y: 20 }];
    const model = buildAutoSettlePromptModel(state);
    expect(model.sections.map((section) => section.category)).toEqual(["towns", "food"]);
    expect(model.sections[1]!.tiles.map((tile) => tile.tileKey)).toEqual(["9,8", "11,12", "13,10"]); // Chebyshev distance from (10,10): 2, 2 (row 12 after row 8), 3
  });

  it("prices settles at SETTLE_MANPOWER_COST and reports real food slots (fish counts double)", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const food = buildAutoSettlePromptModel(state).sections.find((section) => section.category === "food")!;
    expect(yieldSummary(food, 3)).toBe("+4 food slots"); // farm + farm + fish(2)
    expect(yieldSummary(food, 1)).toBe("+2 food slots"); // nearest is the fish tile
    expect(yieldSummary(food, 2)).toBe("+3 food slots"); // fish + farm
    expect(SETTLE_MANPOWER_COST).toBe(20); // the copy's "20 manpower per tile" is this constant
  });

  it("warns when a TOWN-tier town would be left short on food slots, and not when food covers it", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const towns = buildAutoSettlePromptModel(state).sections.find((section) => section.category === "towns")!;
    expect(townFoodWarning(state, towns, 1, 0)).toMatch(/4 food slots/);
    expect(townFoodWarning(state, towns, 1, 4)).toBeUndefined();
    expect(townFoodWarning(state, towns, 0, 0)).toBeUndefined();
  });
});

describe("prompt DOM", () => {
  beforeEach(() => {
    stubSessionStorage();
    document.body.innerHTML = "";
  });

  const install = (state: ReturnType<typeof newPlayerState>, send: (payload: unknown) => boolean) =>
    installAutoSettlePrompt({
      state,
      sendGameMessage: send,
      pushFeed: () => undefined,
      persistDevelopmentQueue: () => undefined
    });

  it("shows for an unanswered player, and 'Not now' sends all-false prefs and queues nothing", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const send = vi.fn(() => true);
    install(state, send);
    const overlay = document.getElementById("auto-settle-prompt-overlay")!;
    expect(overlay.style.display).toBe("grid");
    expect(overlay.textContent).toContain("Cost 60 manpower"); // 3 food tiles x 20
    (overlay.querySelector("#auto-settle-later") as HTMLButtonElement).click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", towns: false, food: false, resources: false }, expect.any(String));
    expect(state.developmentQueue).toEqual([]);
    expect(state.autoSettle?.answered).toBe(true);
    expect(overlay.style.display).toBe("none");
  });

  it("the stepper picks the nearest N tiles; ticking auto hides that stepper and sends the category as on", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const send = vi.fn(() => true);
    install(state, send);
    const overlay = document.getElementById("auto-settle-prompt-overlay")!;
    (overlay.querySelector('[data-step="food:-1"]') as HTMLButtonElement).click(); // 3 -> 2 food tiles
    expect(overlay.querySelector('[data-category="food"]')!.textContent).toContain("Cost 40 manpower");
    (overlay.querySelector('[data-auto="towns"]') as HTMLInputElement).click();
    expect(overlay.querySelector('[data-category="towns"] [data-step]')).toBeNull();
    (overlay.querySelector("#auto-settle-go") as HTMLButtonElement).click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", towns: true, food: false, resources: false }, expect.any(String));
    // Food was a one-off pick of 2 (nearest first: 9,8 and 11,12), queued explicitly; the town is left to the server.
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["9,8", "11,12"]);
  });

  it("stays hidden once answered, and for an unanswered player with no candidates yet", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = [];
    install(state, () => true);
    expect(document.getElementById("auto-settle-prompt-overlay")?.style.display).not.toBe("grid");
    state.autoSettlementQueue = QUEUE;
    state.autoSettle = { answered: true, towns: false, food: false, resources: false };
    refreshAutoSettlePrompt();
    expect(document.getElementById("auto-settle-prompt-overlay")?.style.display).not.toBe("grid");
  });
});
