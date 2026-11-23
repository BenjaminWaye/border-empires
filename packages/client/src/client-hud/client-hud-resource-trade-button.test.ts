// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

const opened = vi.hoisted(() => [] as unknown[]);
vi.mock("../client-diplomacy-trade/client-diplomacy-trade.js", () => ({
  diplomacyTradeDepsFor: () => ({}),
  openDiplomacyTradeScreen: (input: unknown) => { opened.push(input); }
}));

import { bindResourceTradeButtons } from "./client-hud-resource-trade-button.js";

const state = { gold: 0, incomingTruceRequests: [], incomingAllianceRequests: [], activeTruces: [] };

// 2026-11-21: deleting the old Alliances panel removed the only binder for the Economy panel's
// "Review trade" button (it was bound by the panel's propose-button wiring), so tapping it did nothing.
describe("Economy panel Review trade", () => {
  it("opens the resource trade screen with that partner", () => {
    const root = document.createElement("div");
    root.innerHTML = `<button class="panel-btn propose-resource-trade" data-propose-player-id="ai-3" data-propose-player-name="Old name">Review trade</button>`;
    bindResourceTradeButtons(root, { playerNameForOwner: (id) => (id === "ai-3" ? "Mira" : undefined), sendGameMessage: () => true, state });
    root.querySelector<HTMLButtonElement>("button")!.click();
    expect(opened).toEqual([{ targetName: "Mira", targetPlayerId: "ai-3", kind: "trade", durationHours: 12 }]);
  });
});
