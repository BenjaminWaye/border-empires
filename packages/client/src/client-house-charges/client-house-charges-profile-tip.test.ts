// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { renderHouseChargesPanel } from "./client-house-charges-panel.js";
import { houseChargesProfileSectionHtml } from "./client-house-charges-profile.js";
import { MANAGE_CHARGES_CALLOUT_MS, resetHouseChargesProfileTipForTests } from "./client-house-charges-profile-tip.js";

// happy-dom makes import.meta.url non-file; tests run from packages/client.
const source = (name: string): string =>
  readFileSync(resolve(process.cwd(), "src/client-house-charges", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const charge = (id: string, kept: boolean): HouseChargeView => ({
  id, kind: "SEAT", title: `Charge ${id}`, rarity: "COMMON", renown: 1, kept, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 10 }, targets: []
});

/** A panel with the keep choice open and a working save: the "server" confirms the new keep at once. */
const openPanel = () => {
  const now = 5_000;
  const panelEl = document.createElement("div");
  document.body.appendChild(panelEl);
  const state = {
    activePanel: "charges" as "charges" | null,
    houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1, choiceClosesAt: 1e15, charges: [charge("a", true), charge("b", true), charge("c", false)] },
    houseChargesDraftKeep: undefined as string[] | undefined,
    me: "me-1",
    activePlayerProfileId: undefined as string | undefined,
    camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 22, houseChargeFocusId: undefined
  };
  const closePanel = vi.fn(() => {
    state.activePanel = null;
  });
  const sendGameMessage = vi.fn((payload: unknown, _message?: string): boolean => {
    const message = payload as { keptIds: string[] };
    state.houseCharges = { ...state.houseCharges, charges: state.houseCharges.charges.map((entry) => ({ ...entry, kept: message.keptIds.includes(entry.id) })) };
    state.houseChargesDraftKeep = undefined;
    deps.rerender();
    return true;
  });
  const deps = {
    root: document, panelEl, rerender: () => renderHouseChargesPanel(state, deps), requestViewRefresh: () => {}, sendGameMessage,
    wrapX: (x: number) => x, wrapY: (y: number) => y, now: () => now, closePanel, viewport: () => ({ width: 1440, height: 900 })
  };
  deps.rerender();
  const tap = (selector: string): void => {
    panelEl.querySelector<HTMLButtonElement>(selector)!.click();
  };
  return { state, panelEl, tap, closePanel, sendGameMessage, now };
};

afterEach(() => {
  resetHouseChargesProfileTipForTests();
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("House Charges keep popover", () => {
  // Regression (owner 2026-11-21): the Keep bar sat above the cards in the panel's flow, pushing them down and
  // cutting off their bottoms on desktop. It is now a popover floating over the hand.
  it("floats the Keep bar over the cards instead of pushing them down", () => {
    const { panelEl, tap } = openPanel();
    tap('[data-house-charge-pick="c"]');
    tap('[data-house-charge-pick="a"]');
    const bar = panelEl.querySelector(".house-charges-choice");
    expect(bar?.classList.contains("house-charges-popover")).toBe(true);
    const motion = source("client-house-charges-deck-motion.css");
    expect(motion).toMatch(/charges-panel-active \.house-charges-popover \{[^}]*position: fixed/);
  });
});

describe("House Charges profile tip", () => {
  it("after a save, says the charges live in the profile, and Show me opens it with Manage charges glowing", () => {
    const { state, panelEl, tap, closePanel, sendGameMessage, now } = openPanel();
    expect(panelEl.querySelector(".house-charges-tip")).toBeNull();
    tap('[data-house-charge-pick="c"]');
    tap('[data-house-charge-pick="a"]');
    tap("[data-house-charges-save]");
    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    expect(panelEl.querySelector(".house-charges-tip")?.textContent).toContain("profile");

    tap("[data-house-charges-tip-show]");
    expect(state.activePlayerProfileId).toBe("me-1");
    expect(closePanel).toHaveBeenCalled();
    expect(houseChargesProfileSectionHtml(state.houseCharges, now)).toContain("is-callout");
    expect(houseChargesProfileSectionHtml(state.houseCharges, now + MANAGE_CHARGES_CALLOUT_MS)).not.toContain("is-callout");
  });

  it("shows only once per deal", () => {
    const first = openPanel();
    first.tap('[data-house-charge-pick="c"]');
    first.tap('[data-house-charge-pick="a"]');
    first.tap("[data-house-charges-save]");
    first.tap("[data-house-charges-tip-close]");
    expect(first.panelEl.querySelector(".house-charges-tip")).toBeNull();
    document.body.innerHTML = "";

    const again = openPanel();
    again.tap('[data-house-charge-pick="c"]');
    again.tap('[data-house-charge-pick="b"]');
    again.tap("[data-house-charges-save]");
    expect(again.panelEl.querySelector(".house-charges-tip")).toBeNull();
  });

  // Review of #2922: the tip waited only for "nothing unsaved", so after a rejected save, tapping the cards back to
  // the server's kept pair showed "Charges kept" for a save that never happened.
  it("does not show after a rejected save, even once the draft matches the server again", () => {
    const { state, panelEl, tap, sendGameMessage } = openPanel();
    sendGameMessage.mockImplementation(() => true); // sent, but the server keeps its old list
    tap('[data-house-charge-pick="c"]');
    tap('[data-house-charge-pick="a"]');
    tap("[data-house-charges-save]");
    tap('[data-house-charge-pick="c"]');
    tap('[data-house-charge-pick="a"]');
    expect(state.houseChargesDraftKeep?.slice().sort()).toEqual(["a", "b"]);
    expect(panelEl.querySelector(".house-charges-tip")).toBeNull();
  });

  it("does not show when the save could not be sent", () => {
    const { panelEl, tap, sendGameMessage } = openPanel();
    sendGameMessage.mockImplementation(() => false);
    tap('[data-house-charge-pick="c"]');
    tap('[data-house-charge-pick="a"]');
    tap("[data-house-charges-save]");
    expect(panelEl.querySelector(".house-charges-tip")).toBeNull();
  });
});

describe("House Charges card shape", () => {
  // Regression (owner 2026-11-21): a House named by its account id is one long unbreakable word; it widened the
  // card's frame past the card's edge once the progress line ("House …'s AFC: not garrisoned") showed on a kept card.
  it("wraps long words inside the card instead of widening it", () => {
    const deck = source("client-house-charges-deck.css");
    expect(deck).toMatch(/\.hcd-card \.hc-frame \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(deck).toMatch(/\.hcd-card \.hc-text \{[^}]*overflow-wrap: anywhere/);
    expect(deck).toMatch(/\.hcd-card \.hc-name \{[^}]*overflow-wrap: anywhere/);
  });

  // Regression (owner 2026-11-21): the desktop hand stretched every card to the longest one's text, far taller than
  // a card. Cards keep a card's shape; the text scrolls inside.
  it("keeps the desktop cards card-shaped", () => {
    const motion = source("client-house-charges-deck-motion.css");
    expect(motion).toMatch(/charges-panel-active \.hcd-card\.hc-card \{[^}]*aspect-ratio: 2 \/ 3/);
    expect(motion).toMatch(/charges-panel-active \.hcd-card\.hc-card \{[^}]*min-height: 0/);
    expect(motion).toMatch(/charges-panel-active \.hcd-card \.hc-text \{[^}]*overflow-y: auto/);
    // Review of #2922: a fixed shape alone pushed card bottoms below the fold on a short laptop screen.
    expect(motion).toMatch(/charges-panel-active \.hcd-card\.hc-card \{[^}]*max-height: max\(320px, calc\(100dvh - 270px\)\)/);
  });
});
