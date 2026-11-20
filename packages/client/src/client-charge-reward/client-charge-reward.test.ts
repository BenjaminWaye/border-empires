// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type HouseChargeRarity, type SeasonHouseChargesSnapshot } from "@border-empires/shared";
import type { HouseChargeRevealView } from "../client-house-charges/client-house-charge-reveal.js";
import { chargeRewardFor, domainCountRange, isChargeRewardCollected, revealCards } from "./client-charge-reward-model.js";
import { fetchChargeDomainTotal, renderChargeReward, resetChargeRewardForTests } from "./client-charge-reward.js";

/** Domain each test card banks: one per pip (renown). */
const PIPS: Record<HouseChargeRarity, number> = { COMMON: 1, RARE: 3, MYTHIC: 4 };
const { COMMON, RARE, MYTHIC } = PIPS;
const charge = (id: string, rarity: HouseChargeRarity, held: boolean) =>
  ({ id, kind: "CHARTER" as const, title: `Road ${id}`, rarity, renown: PIPS[rarity], held, hoursHeld: held ? 12 : 0, size: 9, places: ["Vell", "Harrow"] });
const house = (playerId: string, charges: ReturnType<typeof charge>[]): SeasonHouseChargesSnapshot => ({ playerId, playerName: playerId, charges });
const view = (houses: SeasonHouseChargesSnapshot[]): HouseChargeRevealView =>
  ({ seasonId: "season-7", seasonSequence: 7, endedAt: 1_000, winnerPlayerId: "winner", houses });

const reveal = view([
  house("me", [charge("b", "MYTHIC", true), charge("a", "COMMON", true), charge("c", "RARE", false)]),
  house("aaa", [charge("z", "RARE", true)]),
  house("winner", [charge("w", "COMMON", false)])
]);

describe("charge reward model", () => {
  it("numbers cards like the server's card route: across every House by player, then charge id", () => {
    expect(revealCards(reveal).map((card) => [card.playerId, card.id, card.collectorNumber, card.collectorTotal])).toEqual([
      ["aaa", "z", 1, 3], ["me", "a", 2, 3], ["me", "b", 3, 3]
    ]);
  });

  it("gives this House its held cards rarest last, with Domain score by difficulty pips", () => {
    const reward = chargeRewardFor(reveal, "me")!;
    expect(reward.cards.map((entry) => [entry.card.id, entry.domain])).toEqual([["a", COMMON], ["b", MYTHIC]]);
    expect(reward.gained).toBe(COMMON + MYTHIC);
    expect(reward.kept).toBe(3);
  });

  it("offers nothing to a House that held no charge, or to a spectator", () => {
    expect(chargeRewardFor(reveal, "winner")).toBeUndefined();
    expect(chargeRewardFor(reveal, undefined)).toBeUndefined();
  });

  it("counts up from the total before this contest, or from 0 when the total is unknown", () => {
    expect(domainCountRange(12, 5)).toEqual({ from: 7, to: 12 });
    expect(domainCountRange(undefined, 5)).toEqual({ from: 0, to: 5 });
    expect(domainCountRange(3, 5)).toEqual({ from: 0, to: 5 });
  });
});

describe("charge reward overlay", () => {
  const state = (overrides: Record<string, unknown> = {}) => ({
    me: "me",
    seasonWinner: { playerId: "winner", playerName: "W", crownedAt: 1_000, objectiveName: "Town Control" },
    seasonEndDismissed: false,
    houseChargeReveal: { key: "winner:1000", view: reveal },
    ...overrides
  }) as never;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    window.localStorage.clear();
    resetChargeRewardForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetChargeRewardForTests();
  });

  it("opens sealed once the reveal shows this House held charges, and only once per contest", () => {
    renderChargeReward({ state: state() });
    renderChargeReward({ state: state() });
    const overlays = document.querySelectorAll("#charge-reward-overlay");
    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.classList.contains("is-sealed")).toBe(true);
    expect(overlays[0]!.querySelectorAll(".cr-slot")).toHaveLength(2);
    expect(overlays[0]!.textContent).toContain("2 charges secured");
  });

  it("uses the HUD's shared buttons, not its own", () => {
    renderChargeReward({ state: state(), openSpaceView: () => {} } as never);
    const root = document.querySelector<HTMLElement>("#charge-reward-overlay")!;
    for (const button of Array.from(root.querySelectorAll("button"))) expect(button.classList.contains("v2s-btn")).toBe(true);
    expect(root.querySelector("[data-cr-collect]")!.classList.contains("v2s-btn-primary")).toBe(true);
    expect(root.querySelector("[data-cr-done]")!.classList.contains("v2s-btn-primary")).toBe(true);
    expect(root.querySelector("[data-cr-skip]")!.classList.contains("v2s-btn-ghost")).toBe(true);
  });

  it("does not open while the reveal is loading, for a House with no held charge, or after the season-end screen is dismissed", () => {
    renderChargeReward({ state: state({ houseChargeReveal: { key: "k", view: "loading" } }) });
    renderChargeReward({ state: state({ me: "winner" }) });
    renderChargeReward({ state: state({ seasonEndDismissed: true }) });
    expect(document.querySelector("#charge-reward-overlay")).toBeNull();
  });

  it("Collect flips every card and counts the Domain score up to the House total; Continue marks it collected", async () => {
    const total = 20;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ chargeDomain: total }) }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = { currentUser: { getIdToken: async () => "token" } } as never;
    renderChargeReward({ state: state(), wsUrl: "wss://example.test/ws", firebaseAuth: auth });
    const root = document.querySelector<HTMLElement>("#charge-reward-overlay")!;
    root.querySelector<HTMLButtonElement>("[data-cr-collect]")!.click();
    await vi.runAllTimersAsync();
    expect(root.querySelectorAll(".cr-slot.is-revealed")).toHaveLength(2);
    expect(root.classList.contains("is-done")).toBe(true);
    expect(root.querySelector("[data-cr-domain]")!.textContent).toBe(String(total));
    expect(root.querySelector<HTMLElement>("[data-cr-gain]")!.hidden).toBe(false);
    expect(isChargeRewardCollected("season-7")).toBe(false);
    root.querySelector<HTMLButtonElement>("[data-cr-done]")!.click();
    await vi.runAllTimersAsync();
    expect(isChargeRewardCollected("season-7")).toBe(true);
    expect(document.querySelector("#charge-reward-overlay")).toBeNull();
    resetChargeRewardForTests();
    renderChargeReward({ state: state() });
    expect(document.querySelector("#charge-reward-overlay")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("Skip jumps straight to the final total", async () => {
    renderChargeReward({ state: state() });
    const root = document.querySelector<HTMLElement>("#charge-reward-overlay")!;
    root.querySelector<HTMLButtonElement>("[data-cr-collect]")!.click();
    root.querySelector<HTMLButtonElement>("[data-cr-skip]")!.click();
    expect(root.querySelectorAll(".cr-slot.is-revealed")).toHaveLength(2);
    expect(root.querySelector("[data-cr-domain]")!.textContent).toBe(String(COMMON + MYTHIC));
    // Review of #2873: the Domain total resolving after Skip wrote the pre-contest number back.
    await vi.runAllTimersAsync();
    expect(root.querySelector("[data-cr-domain]")!.textContent).toBe(String(COMMON + MYTHIC));
  });

  // Review of #2873: a count-up still running when Skip was pressed kept writing its own numbers over the final total.
  it("Skip during a count-up keeps the final total", async () => {
    renderChargeReward({ state: state() });
    const root = document.querySelector<HTMLElement>("#charge-reward-overlay")!;
    root.querySelector<HTMLButtonElement>("[data-cr-collect]")!.click();
    // Signed out, the Domain total resolves at once; past the first card's flip and pause, its count-up is under way.
    await vi.advanceTimersByTimeAsync(350 + 420 + 100);
    expect(root.classList.contains("is-revealing")).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-cr-skip]")!.click();
    await vi.runAllTimersAsync();
    expect(root.classList.contains("is-done")).toBe(true);
    expect(root.querySelector("[data-cr-domain]")!.textContent).toBe(String(COMMON + MYTHIC));
  });

  it("reads the banked charge Domain score from /hq/galaxy/me, and nothing when signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ planets: [], chargeDomain: RARE }) })));
    await expect(fetchChargeDomainTotal("wss://example.test/ws", { currentUser: { getIdToken: async () => "t" } } as never)).resolves.toBe(RARE);
    await expect(fetchChargeDomainTotal("wss://example.test/ws", { currentUser: null } as never)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
