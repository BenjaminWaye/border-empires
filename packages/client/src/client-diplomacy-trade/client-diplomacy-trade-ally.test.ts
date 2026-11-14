// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDiplomacyTradeScreen, diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "./client-diplomacy-trade.js";

afterEach(() => closeDiplomacyTradeScreen());

const overlay = (): HTMLElement => document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;

// Playtest 2026-11-13 (pt-diplomat): an ally's deal screen offered Truce 12h /
// Truce 24h / Alliance, and pricing the alliance said the ally "wants about 18
// more coin" for an alliance that already existed.
describe("trade screen for an empire you're allied with", () => {
  it("offers no truce or alliance and opens on goods", () => {
    const deps = diplomacyTradeDepsFor({ gold: 40, allies: ["ai-7"] }, vi.fn().mockReturnValue(true));
    openDiplomacyTradeScreen({ targetName: "Solveig", targetPlayerId: "ai-7", kind: "alliance", durationHours: 12 }, deps);
    expect(overlay().querySelector("[data-trade-kind]")).toBeNull();
    expect(overlay().querySelector("[data-trade-allied]")?.textContent).toBe("Already allied. Trade goods below.");
    expect(overlay().querySelector("[data-trade-verdict]")?.textContent).toBe("Add goods from either side to trade with your ally.");
  });

  it("keeps the treaty buttons for an empire you're not allied with", () => {
    const deps = diplomacyTradeDepsFor({ gold: 40, allies: ["ai-7"] }, vi.fn().mockReturnValue(true));
    openDiplomacyTradeScreen({ targetName: "Hugo", targetPlayerId: "ai-2", kind: "truce", durationHours: 24 }, deps);
    expect(overlay().querySelector("[data-trade-allied]")).toBeNull();
    expect(overlay().querySelector("[data-trade-kind='alliance:0']")).not.toBeNull();
  });

  // Review of #2777: countering an ally's truce offer must stay a truce
  // counter, not silently become a coin gift with no treaty.
  it("keeps the treaty when countering an ally's offer", () => {
    const deps = diplomacyTradeDepsFor({ gold: 40, allies: ["ai-7"] }, vi.fn().mockReturnValue(true));
    openDiplomacyTradeScreen(
      { targetName: "Solveig", targetPlayerId: "ai-7", kind: "truce", durationHours: 24, counters: { kind: "truce", requestId: "r-1" } },
      deps
    );
    expect(overlay().querySelector("[data-trade-allied]")).toBeNull();
    expect(overlay().querySelector("[data-trade-deal]")?.textContent).toContain("Truce");
  });
});
