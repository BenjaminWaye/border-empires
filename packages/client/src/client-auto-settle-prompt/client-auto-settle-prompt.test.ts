// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEW_PLAYER_AUTO_SETTLE_PREFS, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { applyAutoSettlementQueueFromServer } from "../client-development-queue/client-development-queue.js";
import { dismissCurrentAutoSettleCandidates, installAutoSettlePrompt, openAutoSettlePromptForTile, refreshAutoSettlePrompt } from "./client-auto-settle-prompt.js";
import { loadedAutoSettleState } from "./client-auto-settle-prefs.js";
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
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.gold = 1_000;
  state.manpower = 720;
  state.manpowerCap = 720;
  state.homeTile = { x: 10, y: 10 };
  state.autoSettle = loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
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

  it("before prefs arrive (pre-INIT, or an older server that never sends them) nothing settles and no prompt shows", () => {
    const state = newPlayerState();
    state.autoSettle = { status: "unloaded" };
    expect(applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor })).toBe(0);
    expect(state.developmentQueue).toEqual([]);
    state.autoSettlementQueue = QUEUE;
    expect(buildAutoSettlePromptModel(state).sections).toEqual([]);
    expect(createInitialState().autoSettle).toEqual({ status: "unloaded" });
  });

  it("a PLAYER_UPDATE without the field keeps the loaded value; the first value that arrives unblocks settling", () => {
    const state = newPlayerState();
    applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor, autoSettle: { answered: true, towns: true, food: true, resources: true } });
    applyAutoSettlementQueueFromServer(state, QUEUE, { keyFor });
    expect(state.autoSettle).toEqual({ status: "loaded", prefs: { answered: true, towns: true, food: true, resources: true } });
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

  it("shows the food upkeep of the towns being settled under the town yield, and none when no town is picked", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const towns = buildAutoSettlePromptModel(state).sections.find((section) => section.category === "towns")!;
    expect(yieldSummary(towns, 1)).toBe("+ Coin · + Manpower · Food upkeep 4 slots"); // TOWN tier demands 4
    expect(yieldSummary(towns, 0)).toBe("");
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
    installAutoSettlePrompt({ state, sendGameMessage: send, pushFeed: () => undefined, persistDevelopmentQueue: () => undefined });
  const overlay = (): HTMLElement => document.getElementById("auto-settle-prompt-overlay")!;
  const visible = (): boolean => document.getElementById("auto-settle-prompt-overlay")?.style.display === "grid";
  // The player's click on the first marked tile (the card never opens by itself).
  const openIt = (state: ReturnType<typeof newPlayerState>): boolean => {
    const marker = state.onboardingHighlightTiles[0];
    return marker ? openAutoSettlePromptForTile(state, marker) && visible() : false;
  };
  let nextTileX = 100;
  const addFarm = (state: ReturnType<typeof newPlayerState>): void => {
    const x = nextTileX++;
    state.tiles.set(`${x},10`, { x, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as never);
    state.autoSettlementQueue = [...state.autoSettlementQueue, { x, y: 10 }];
  };

  it("shows for held-back candidates and quotes the real cost", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    install(state, () => true);
    expect(visible()).toBe(false); // marked on the map, but nothing pops up
    expect(state.onboardingHighlightTiles.map((tile) => `${tile.x},${tile.y}`).sort()).toEqual(["11,12", "12,10", "13,10", "9,8"]);
    expect(openIt(state)).toBe(true);
    expect(overlay().textContent).toContain("Cost 60 manpower"); // 3 food tiles x 20
  });

  it("shows again for an ANSWERED player, but only for categories that are not switched on", () => {
    const state = newPlayerState();
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: false, food: true, resources: false });
    state.autoSettlementQueue = QUEUE;
    install(state, () => true);
    expect(openIt(state)).toBe(true);
    expect(overlay().querySelector('[data-category="towns"]')).not.toBeNull();
    expect(overlay().querySelector('[data-category="food"]')).toBeNull(); // food is auto: nothing to ask
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: true, food: true, resources: false });
    refreshAutoSettlePrompt();
    expect(visible()).toBe(false);
  });

  it("closing (Not now, X or Escape) dismisses without sending anything, and only NEW tiles bring it back", () => {
    for (const close of [
      () => (overlay().querySelector("#auto-settle-later") as HTMLElement).click(),
      () => (overlay().querySelector("#auto-settle-close") as HTMLElement).click(),
      () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    ]) {
      document.body.innerHTML = "";
      const state = newPlayerState();
      state.autoSettlementQueue = [...QUEUE];
      const send = vi.fn(() => true);
      install(state, send);
      expect(openIt(state)).toBe(true);
      close();
      expect(visible()).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(state.developmentQueue).toEqual([]);
      refreshAutoSettlePrompt(); // same candidates arriving again: no markers, nothing to click
      expect(state.onboardingHighlightTiles).toEqual([]);
      addFarm(state); // a new candidate: marked again
      refreshAutoSettlePrompt();
      expect(openIt(state)).toBe(true);
      expect(overlay().textContent).toContain("Cost 20 manpower");
    }
  });

  it("the stepper picks the nearest N tiles; ticking auto hides that stepper and sends the category as on", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = QUEUE;
    const send = vi.fn(() => true);
    install(state, send);
    expect(openIt(state)).toBe(true);
    (overlay().querySelector('[data-step="food:-1"]') as HTMLButtonElement).click(); // 3 -> 2 food tiles
    expect(overlay().querySelector('[data-category="food"]')!.textContent).toContain("Cost 40 manpower");
    (overlay().querySelector('[data-auto="towns"]') as HTMLInputElement).click();
    expect(overlay().querySelector('[data-category="towns"] [data-step]')).toBeNull();
    (overlay().querySelector("#auto-settle-go") as HTMLButtonElement).click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", towns: true, food: false, resources: false }, expect.any(String));
    // Food was a one-off pick of 2 (nearest first: 9,8 and 11,12), queued explicitly; the town is left to the server.
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["9,8", "11,12"]);
    expect(visible()).toBe(false);
  });

  it("confirming never switches an already-on category off", () => {
    const state = newPlayerState();
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: false, food: false, resources: true });
    state.autoSettlementQueue = QUEUE;
    const send = vi.fn(() => true);
    install(state, send);
    expect(openIt(state)).toBe(true);
    (overlay().querySelector('[data-auto="food"]') as HTMLInputElement).click();
    (overlay().querySelector("#auto-settle-go") as HTMLButtonElement).click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", towns: false, food: true, resources: true }, expect.any(String));
  });

  it("dismissCurrentAutoSettleCandidates (Settings change) hides it until a new tile arrives", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = [...QUEUE];
    install(state, () => true);
    dismissCurrentAutoSettleCandidates();
    refreshAutoSettlePrompt();
    expect(state.onboardingHighlightTiles).toEqual([]);
    addFarm(state);
    refreshAutoSettlePrompt();
    expect(openIt(state)).toBe(true);
  });

  it("stays hidden with no candidates, and for tiles the player cancelled", () => {
    const state = newPlayerState();
    state.autoSettlementQueue = [];
    install(state, () => true);
    expect(visible()).toBe(false);
    state.autoSettlementQueue = QUEUE;
    state.skippedAutoSettlementTileKeys = new Set(["13,10", "12,10", "9,8", "11,12"]);
    refreshAutoSettlePrompt();
    expect(visible()).toBe(false);
  });

  it("never opens by itself, keeps other highlight rings, and a click on a non-candidate tile does nothing", () => {
    const state = newPlayerState();
    state.onboardingHighlightTiles = [{ x: 1, y: 1 }];
    state.autoSettlementQueue = [...QUEUE];
    install(state, () => true);
    expect(visible()).toBe(false);
    expect(state.onboardingHighlightTiles).toContainEqual({ x: 1, y: 1 });
    expect(state.onboardingHighlightTiles).toHaveLength(5);
    expect(openAutoSettlePromptForTile(state, { x: 1, y: 1 })).toBe(false);
    expect(visible()).toBe(false);
    expect(openAutoSettlePromptForTile(state, { x: 9, y: 8 })).toBe(true);
    (overlay().querySelector("#auto-settle-later") as HTMLElement).click();
    expect(state.onboardingHighlightTiles).toEqual([{ x: 1, y: 1 }]); // candidates waved away: their rings go, the checklist's stays
  });
});
