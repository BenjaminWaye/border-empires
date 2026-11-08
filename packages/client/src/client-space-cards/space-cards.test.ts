// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DukeApi } from "../client-duke-panel/client-duke-api.js";
import { H, NOW, dukeStatus, dukeSystem } from "../client-duke-panel/client-duke-fixtures.js";
import type { DukeStatus } from "../client-duke-panel/client-duke-types.js";
import { mountSpaceCards } from "./space-cards.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const setup = (first: DukeStatus, afterAction: DukeStatus) => {
  const screen = document.createElement("div");
  document.body.append(screen);
  const ok = vi.fn(async () => ({ ok: true as const }));
  const api: DukeApi = {
    fetchStatus: vi.fn(),
    build: ok,
    cancelBuild: ok,
    order: ok,
    answerOffer: ok,
    moveAgainstCourt: ok,
    holdCourt: ok,
    declareGrievance: ok,
    answerWrit: ok,
    lendFleet: ok
  };
  const focusSystem = vi.fn();
  const showGalaxy = vi.fn();
  const cards = mountSpaceCards(screen, {
    api,
    refresh: async () => cards.setStatus(afterAction),
    focusSystem,
    showGalaxy,
    now: () => NOW
  });
  cards.setStatus(first);
  const press = (selector: string) => screen.querySelector<HTMLButtonElement>(selector)!.click();
  return { screen, cards, api, focusSystem, showGalaxy, press };
};

describe("Space View action cards", () => {
  const two = dukeStatus({ systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vesk", incursionArrivesAt: null })] });

  it("opens on the galaxy with the decree hand", () => {
    const { screen } = setup(two, two);
    expect(screen.querySelector("[data-sc-card='hold']")).not.toBeNull();
    expect(screen.textContent).toContain("Decree ready");
  });

  it("after a decree, flies to the first system with an order ready and shows its orders", async () => {
    const { screen, press, api, focusSystem } = setup(two, { ...two, decree: { ready: false, readyAt: NOW + 24 * H } });
    press("[data-sc-play='hold']");
    await flush();
    expect(api.holdCourt).toHaveBeenCalled();
    expect(focusSystem).toHaveBeenCalledWith("s1");
    expect(screen.querySelector("[data-sc-card='fighter']")).not.toBeNull();
  });

  it("after an order, moves to the next ready system, and back to the galaxy when none is left", async () => {
    const afterFirst = { ...two, systems: [dukeSystem({ order: { ready: false, readyAt: NOW + 24 * H } }), two.systems[1]!] };
    const { cards, press, api, focusSystem, showGalaxy } = setup(two, afterFirst);
    cards.showSystem("s1");
    press("[data-sc-play='fighter']");
    await flush();
    expect(api.build).toHaveBeenCalledWith("s1", { kind: "FIGHTER" });
    expect(focusSystem).toHaveBeenLastCalledWith("s2");

    const allSpent = { ...two, systems: two.systems.map((s) => ({ ...s, order: { ready: false, readyAt: NOW + 24 * H } })) };
    const last = setup(afterFirst, allSpent);
    last.cards.showSystem("s2");
    last.press("[data-sc-play='fighter']");
    await flush();
    expect(last.showGalaxy).toHaveBeenCalled();
    expect(showGalaxy).not.toHaveBeenCalled();
  });

  it("a refused action stays put and says why", async () => {
    const { screen, press, api, focusSystem } = setup(two, two);
    (api.holdCourt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, code: "DECREE_NOT_READY", availableAt: NOW + 2 * H });
    press("[data-sc-play='hold']");
    await flush();
    expect(focusSystem).not.toHaveBeenCalled();
    expect(screen.querySelector(".sc-message")?.textContent).toContain("Next in 2h");
  });

  it("the systems strip switches system, and Galaxy goes back out", () => {
    const { screen, cards, press, focusSystem, showGalaxy } = setup(two, two);
    cards.showSystem("s1");
    press("[data-sc-system='s2']");
    expect(focusSystem).toHaveBeenCalledWith("s2");
    expect(screen.querySelector("[data-sc-system='s2']")?.getAttribute("aria-pressed")).toBe("true");
    press("[data-sc-galaxy]");
    expect(showGalaxy).toHaveBeenCalled();
    expect(screen.querySelector("[data-sc-card='hold']")).not.toBeNull();
  });
});

describe("a smoking planet (§31)", () => {
  it("says why when you open it, and the bodies strip carries no hit chip", () => {
    const hit = dukeStatus({ recentHits: [{ seasonId: "s1", at: NOW - 3 * H, by: "WARDEN" }] });
    const { screen, cards } = setup(hit, hit);
    expect(screen.querySelector(".sc-hit")).toBeNull();
    cards.showSystem("s1");
    expect(screen.querySelector(".sc-hit")?.textContent).toBe("Smoking: Wardens got through 3h ago and cost it 20 Stability.");
    expect(screen.querySelector(".sc-bodies")?.textContent).not.toMatch(/Hit|smok/i);
  });
});

describe("review fixes", () => {
  const two = dukeStatus({ systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vesk", incursionArrivesAt: null })] });

  it("Cancel takes a second press, and warns that the day's order stays used", async () => {
    const busy = dukeStatus({ systems: [dukeSystem({ slot: { kind: "FIGHTER", label: "Fighter", startedAt: NOW - H, completesAt: NOW + H } })] });
    const { screen, cards, api, press } = setup(busy, busy);
    cards.showSystem("s1");
    press("[data-sc-cancel]");
    await flush();
    expect(api.cancelBuild).not.toHaveBeenCalled();
    expect(screen.querySelector("[data-sc-cancel]")?.textContent).toContain("Today's order stays used");
    press("[data-sc-cancel]");
    await flush();
    expect(api.cancelBuild).toHaveBeenCalledTimes(1);
  });

  it("ignores navigation while an action is in flight, so the view only moves once", async () => {
    let finish: () => void = () => undefined;
    const { press, api, focusSystem } = setup(two, { ...two, decree: { ready: false, readyAt: NOW + 24 * H } });
    (api.holdCourt as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ ok: true }))));
    press("[data-sc-play='hold']");
    await flush();
    press("[data-sc-play='wager']");
    // Every API method shares one mock here: still one call means the wager was ignored.
    expect(api.moveAgainstCourt).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(focusSystem).toHaveBeenCalledTimes(1);
  });

  it("does not move the view later if the action's refresh brought no status", async () => {
    const screen = document.createElement("div");
    document.body.append(screen);
    const ok = vi.fn(async () => ({ ok: true as const }));
    const api = { fetchStatus: vi.fn(), build: ok, cancelBuild: ok, order: ok, answerOffer: ok, moveAgainstCourt: ok, holdCourt: ok, declareGrievance: ok, answerWrit: ok, lendFleet: ok } as DukeApi;
    const focusSystem = vi.fn();
    const cards = mountSpaceCards(screen, { api, refresh: async () => undefined, focusSystem, showGalaxy: vi.fn(), now: () => NOW });
    cards.setStatus(two);
    screen.querySelector<HTMLButtonElement>("[data-sc-play='hold']")!.click();
    await flush();
    // A later poll arrives: it must not be taken as the action's result.
    cards.setStatus(two);
    expect(focusSystem).not.toHaveBeenCalled();
  });
});
