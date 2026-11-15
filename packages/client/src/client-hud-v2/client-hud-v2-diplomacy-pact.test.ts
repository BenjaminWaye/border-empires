// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { ActiveTruceView } from "../client-types.js";
import { dealPactClick, dealPactHtml, type DealPactInput } from "./client-hud-v2-diplomacy-pact.js";

const HOUR = 3_600_000;
const truce = (overrides: Partial<ActiveTruceView> = {}): ActiveTruceView => ({
  otherPlayerId: "ai-4",
  otherPlayerName: "Bryn",
  startedAt: 0,
  endsAt: 14 * HOUR,
  createdByPlayerId: "me",
  ...overrides
});
const input = (overrides: Partial<DealPactInput> = {}): DealPactInput => ({
  targetId: "ai-4",
  allies: [],
  activeTruces: [],
  activeAllianceBreaks: [],
  nowMs: 0,
  ...overrides
});

const element = (html: string, selector: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector<HTMLElement>(selector)!;
};

// Playtest 2026-11-13 (pt-strategist): Break Truce was only in the Alliances
// panel and the tile menu on the partner's land, so on a phone it couldn't be reached.
describe("Diplomacy deal pact line", () => {
  it("offers Break Truce for a negotiated truce", () => {
    const html = dealPactHtml(input({ activeTruces: [truce()] }));
    expect(html).toContain("Truce · 14h left");
    expect(html).toContain('data-v2-dip-break="truce" data-player-id="ai-4"');
    expect(html).toContain('data-v2-dip-alliances="ai-4"');
  });

  it("says a Court armistice is binding instead of offering a break", () => {
    const html = dealPactHtml(input({ activeTruces: [truce({ origin: "court" })] }));
    expect(html).toContain("Court armistice · binding");
    expect(html).not.toContain("data-v2-dip-break");
  });

  it("offers Break Alliance for an ally, or the time left once breaking", () => {
    expect(dealPactHtml(input({ allies: ["ai-4"] }))).toContain('data-v2-dip-break="alliance"');
    const breaking = dealPactHtml(input({ allies: ["ai-4"], activeAllianceBreaks: [{ otherPlayerId: "ai-4", otherPlayerName: "Bryn", startedAt: 0, endsAt: 20 * HOUR, createdByPlayerId: "me" }] }));
    expect(breaking).toContain("Alliance ends in 20h");
    expect(breaking).not.toContain("data-v2-dip-break");
  });

  it("is empty with no pact", () => {
    expect(dealPactHtml(input())).toBe("");
  });

  it("confirms before sending TRUCE_BREAK", () => {
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const sheets: BreakPactSheetOptions[] = [];
    const state = { playerNames: new Map([["ai-4", "Bryn"]]) } as never;
    const button = element(dealPactHtml(input({ activeTruces: [truce()] })), "[data-v2-dip-break]");
    expect(dealPactClick({ state, sendGameMessage, renderHud: vi.fn() }, button, vi.fn(), (o) => { sheets.push(o); return true; })).toBe(true);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(sheets[0]?.title).toBe("Break truce with Bryn?");
    sheets[0]!.onConfirm();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_BREAK", targetPlayerId: "ai-4" }, expect.any(String));
  });

  // Playtest 2026-11-13 (pt-diplomat): the Alliances panel opened only from an ally's tile.
  it("opens the Alliances panel at that empire's row, closing the screen first", () => {
    const state = { activePanel: null, socialFocus: undefined, expandedSocialPlayerId: undefined, playerNames: new Map() };
    const closeToMap = vi.fn();
    const button = element(dealPactHtml(input({ activeTruces: [truce()] })), "[data-v2-dip-alliances]");
    dealPactClick({ state: state as never, sendGameMessage: vi.fn(), renderHud: vi.fn() }, button, closeToMap);
    expect(closeToMap).toHaveBeenCalled();
    expect(state.activePanel).toBe("alliance");
    expect(state.expandedSocialPlayerId).toBe("ai-4");
  });

  it("opens the Alliances panel from the list link with no empire focused", () => {
    const state = { activePanel: null, expandedSocialPlayerId: undefined, playerNames: new Map() };
    const button = element(`<button data-v2-dip-alliances="">Alliances</button>`, "button");
    dealPactClick({ state: state as never, sendGameMessage: vi.fn(), renderHud: vi.fn() }, button, vi.fn());
    expect(state.activePanel).toBe("alliance");
    expect(state.expandedSocialPlayerId).toBeUndefined();
  });
});
