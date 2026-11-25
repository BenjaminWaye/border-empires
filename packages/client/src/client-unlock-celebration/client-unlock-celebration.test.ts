// @vitest-environment happy-dom
// Owner 2026-11-25 (playtest): earning an achievement or completing a House Charge happened silently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AchievementsView, HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import { activeFullscreenCard, enqueueFullscreenCard, resetFullscreenCardQueueForTests } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";
import { CELEBRATION_AUTO_DISMISS_MS, pendingUnlockCelebrationCount, resetUnlockCelebrationsForTests, UNLOCK_CELEBRATION_CLASS } from "./client-unlock-celebration.js";
import { applyPlayerUpdateAchievementsAndCelebrate, celebrateNewlyHeldCharges } from "./client-unlock-celebration-triggers.js";
import { applyMapPushMessage } from "../client-network/client-map-push-messages.js";
import type { ClientState } from "../client-state/client-state.js";

const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(`.${UNLOCK_CELEBRATION_CLASS}`));
const titleOnScreen = (): string | undefined => cards()[0]?.querySelector(".uc-title")?.textContent ?? undefined;
const tapNice = (): void => cards()[0]?.querySelector<HTMLButtonElement>("[data-uc-close]")?.click();

const view = (earned: AchievementsView["earned"]): { achievements: AchievementsView } => ({ achievements: { progress: {}, earned } });
const holder = (): { achievements: AchievementsView | undefined } => ({ achievements: undefined });

const reducedMotion = (reduce: boolean): void => {
  window.matchMedia = ((query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  window.localStorage.clear();
  reducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  resetUnlockCelebrationsForTests();
  resetFullscreenCardQueueForTests();
  document.body.innerHTML = "";
});

describe("achievement celebration", () => {
  it("celebrates a newly earned badge once, with its name, goal and a Nice button", () => {
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    expect(cards()).toHaveLength(1);
    expect(titleOnScreen()).toBe("Warlord");
    expect(cards()[0]?.textContent).toContain("Achievement earned");
    expect(cards()[0]?.textContent).toContain("Take 500 tiles from rival Houses in battle");
    expect(cards()[0]?.querySelector("[data-uc-close]")?.textContent).toBe("Nice");
    tapNice();
    // The same badge in every later PLAYER_UPDATE never shows again.
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    expect(cards()).toHaveLength(0);
  });

  it("never celebrates badges already earned when the session started", () => {
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ METROPOLIS: 1_000, PACIFIER: 2_000 }));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ METROPOLIS: 1_000, PACIFIER: 2_000 }));
    expect(cards()).toHaveLength(0);
  });

  it("does not replay on reload: a new page that sees the badge newly earned again skips it", () => {
    const first = holder();
    applyPlayerUpdateAchievementsAndCelebrate(first, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(first, view({ CARTOGRAPHER: 7_000 }));
    tapNice();
    // A reloaded page whose baseline missed the badge (a partial first update) still remembers it was shown.
    const reloaded = holder();
    applyPlayerUpdateAchievementsAndCelebrate(reloaded, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(reloaded, view({ CARTOGRAPHER: 7_000 }));
    expect(cards()).toHaveLength(0);
  });

  it("queues several unlocks and shows them one after another", () => {
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000, MASTER_BUILDER: 5_000 }));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000, MASTER_BUILDER: 5_000, IRON_WALL: 6_000 }));
    expect(cards()).toHaveLength(1);
    expect(titleOnScreen()).toBe("Warlord");
    expect(pendingUnlockCelebrationCount()).toBe(2);
    tapNice();
    expect(titleOnScreen()).toBe("Master Builder");
    tapNice();
    expect(titleOnScreen()).toBe("Iron Wall");
    tapNice();
    expect(cards()).toHaveLength(0);
    expect(activeFullscreenCard()).toBeUndefined();
  });

  it("waits behind another full-screen card (Town Captured) rather than stacking on it", () => {
    let closeOther: () => void = () => {};
    enqueueFullscreenCard({ key: "town-capture", show: (close) => { const el = document.createElement("div"); document.body.appendChild(el); closeOther = () => { el.remove(); close(); }; return el; } });
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ PACIFIER: 3_000 }));
    expect(cards()).toHaveLength(0);
    closeOther();
    expect(titleOnScreen()).toBe("Pacifier");
  });

  it("closes itself after about 6 s, then leaves nothing over the map", () => {
    vi.useFakeTimers();
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    vi.advanceTimersByTime(CELEBRATION_AUTO_DISMISS_MS - 100);
    expect(cards()).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(cards()).toHaveLength(0);
    expect(activeFullscreenCard()).toBeUndefined();
    expect(document.body.children).toHaveLength(0);
  });

  it("closes on a tap anywhere, and the tap does not reach the map underneath", () => {
    const mapTaps = vi.fn();
    document.body.addEventListener("pointerdown", mapTaps);
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    const overlay = cards()[0]!;
    overlay.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(mapTaps).not.toHaveBeenCalled();
    overlay.click();
    expect(cards()).toHaveLength(0);
    // After it closes, map input flows again.
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(mapTaps).toHaveBeenCalledTimes(1);
  });

  it("animates with a scale-in burst, and has no animation under reduced motion", () => {
    const state = holder();
    applyPlayerUpdateAchievementsAndCelebrate(state, view({}));
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000 }));
    expect(cards()[0]?.classList.contains("is-still")).toBe(false);
    expect(cards()[0]?.querySelectorAll(".uc-burst i").length).toBeGreaterThan(0);
    tapNice();

    reducedMotion(true);
    applyPlayerUpdateAchievementsAndCelebrate(state, view({ WARLORD: 5_000, PACIFIER: 6_000 }));
    expect(cards()[0]?.classList.contains("is-still")).toBe(true);
    expect(cards()[0]?.querySelector(".uc-burst")).toBeNull();
  });
});

const charge = (overrides: Partial<HouseChargeView>): HouseChargeView => ({
  id: "CHARTER:town:8,15|town:30,20",
  kind: "CHARTER",
  title: "Road of Elenlenbloom and Aelharbor",
  rarity: "COMMON",
  renown: 2,
  difficultyScored: true,
  kept: true,
  held: false,
  size: 9,
  searchCircle: { x: 19, y: 17, radius: 14 },
  targets: [],
  ...overrides
});
const payload = (charges: HouseChargeView[], dealtAt = 1_000): HouseChargesPayload => ({ type: "HOUSE_CHARGES", dealtAt, choiceClosesAt: 2_000, charges });

describe("House Charge celebration", () => {
  it("celebrates a kept charge the moment it becomes held, with its name and reward", () => {
    celebrateNewlyHeldCharges(payload([charge({})]), payload([charge({ held: true, completeSince: 9_000, size: 15 })]));
    expect(titleOnScreen()).toBe("Road of Elenlenbloom and Aelharbor");
    expect(cards()[0]?.textContent).toContain("Charge complete");
    expect(cards()[0]?.textContent).toContain("+2 Domain");
    expect(cards()[0]?.querySelector(".uc-icon svg")).not.toBeNull();
  });

  it("ignores charges held at session start, unkept charges, and the same charge on later pushes", () => {
    celebrateNewlyHeldCharges(undefined, payload([charge({ held: true, completeSince: 9_000 })]));
    celebrateNewlyHeldCharges(payload([charge({ id: "x", kept: false })]), payload([charge({ id: "x", kept: false, held: true })]));
    expect(cards()).toHaveLength(0);
    celebrateNewlyHeldCharges(payload([charge({})]), payload([charge({ held: true, completeSince: 9_000 })]));
    tapNice();
    // Lost and mended again in the same deal: no second card.
    celebrateNewlyHeldCharges(payload([charge({ lostAt: 9_500 })]), payload([charge({ held: true, completeSince: 9_900 })]));
    expect(cards()).toHaveLength(0);
  });

  it("is triggered by the HOUSE_CHARGES push itself", () => {
    const state = { houseCharges: undefined, houseChargesDraftKeep: undefined, playerNames: new Map(), feed: [], me: "p1" } as unknown as ClientState;
    const renderHud = vi.fn();
    applyMapPushMessage(state, payload([charge({})]) as unknown as Record<string, unknown>, renderHud);
    expect(cards()).toHaveLength(0);
    applyMapPushMessage(state, payload([charge({ held: true, completeSince: 9_000 })]) as unknown as Record<string, unknown>, renderHud);
    expect(titleOnScreen()).toBe("Road of Elenlenbloom and Aelharbor");
  });
});
