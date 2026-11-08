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
