// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { HOUSE_CHARGES_DRAW_MS } from "./client-house-charges-deck.js";
import { foldHouseChargeCards } from "./client-house-charges-fold.js";
import { houseChargesPanelHtml, renderHouseChargesPanel } from "./client-house-charges-panel.js";

// happy-dom makes import.meta.url non-file; tests run from packages/client.
const source = (name: string): string => readFileSync(resolve(process.cwd(), "src/client-house-charges", name), "utf8");
const deckCss = source("client-house-charges-deck.css").replace(/\/\*[\s\S]*?\*\//g, "");
const motionCss = source("client-house-charges-deck-motion.css").replace(/\/\*[\s\S]*?\*\//g, "");

const charge = (id: string, kind: HouseChargeView["kind"], kept = true): HouseChargeView => ({
  id, kind, title: `Charge ${id}`, rarity: "COMMON", renown: 1, kept, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 10 }, targets: []
});
const charges = [charge("a", "CHARTER"), charge("b", "SEAT"), charge("c", "SURVEY", false)];
const payload = { type: "HOUSE_CHARGES" as const, dealtAt: 1, choiceClosesAt: 0, charges };

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("House Charges card styles", () => {
  // Regression (owner 2026-11-20): the hand kept the HUD's bottom reserve (up to 236px, client-hud-v2.css), so
  // the bottom of every card was cut off; and How charges work pushed the cards down into a scroll.
  it("lets the desktop hand reach the bottom of the screen and floats the help over the cards", () => {
    expect(motionCss).toMatch(/#side-panel\.charges-panel-active \{[^}]*bottom: 16px/);
    const style = source("client-house-charges-style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(style).toMatch(/\.house-charges-more \{[^}]*position: absolute/);
  });

  // Regression (owner 2026-11-19, staging): "text on the cards is unreadable". The panel's generic `.card p`
  // (pale parchment text, specificity 0,1,1) beat the card's ink, which was set on bare classes (0,1,0).
  it("sets the card text's ink on selectors that beat the panel's generic `.card p`", () => {
    expect(deckCss).toMatch(/\.hcd-card \.hc-text p \{[^}]*color: #2a2116/);
    expect(deckCss).toMatch(/\.hcd-card \.hc-text \.hc-flavour \{[^}]*color:/);
    expect(deckCss).toMatch(/\.hcd-card \.hc-text \.hcd-progress \{[^}]*color:/);
    expect(deckCss).toMatch(/\.hcd-card \.hc-text \.hcd-status \{[^}]*color:/);
  });

  // Review of #2887: a phone held sideways is wider than 900 px but compact, and must keep the phone panel.
  it("floats the hand only on the desktop HUD, never on a compact one", () => {
    const desktop = motionCss.slice(motionCss.indexOf("@media (min-width: 901px)"), motionCss.indexOf("@keyframes hcd-float"));
    const selectors = desktop.match(/^\s*[^{}@][^{}]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) expect(selector).toContain("body:not(.hud-v2-compact)");
  });
});

describe("Show on map fold", () => {
  // Review of #2887: happy-dom has no Web Animations, so stub it to see what the fold does.
  it("flies one copy per card into the dock, the pressed card last and on top, then cleans up", () => {
    const finishers: (() => void)[] = [];
    const animate = vi.fn(function animate() {
      const animation = { onfinish: null as null | (() => void), oncancel: null as null | (() => void) };
      finishers.push(() => animation.onfinish?.());
      return animation;
    });
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, width: 300, height: 420, right: 310, bottom: 430, x: 10, y: 10, toJSON: () => ({}) });
    const panel = document.createElement("div");
    panel.innerHTML = houseChargesPanelHtml({ activePanel: "charges", houseCharges: payload, houseChargesDraftKeep: undefined }, 5);
    document.body.appendChild(panel);

    foldHouseChargeCards(panel, "a");
    const copies = document.querySelectorAll<HTMLElement>(".hcd-fold-layer .hcd-card.is-folding");
    expect(copies).toHaveLength(3);
    expect(copies[copies.length - 1]!.querySelector(".hc-name")?.textContent).toBe("Charge a");
    expect(document.querySelector(".hcd-fold-layer [data-house-charge-jump], .hcd-fold-layer [data-house-charge-pick]")).toBeNull();
    expect(panel.querySelectorAll(".hcd-card")).toHaveLength(3);
    finishers.forEach((finish) => finish());
    expect(document.querySelector(".hcd-fold-layer")).toBeNull();
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });
});

describe("drawing the cards on open", () => {
  // Review of #2887: a rewrite of the panel during the draw (a push, a Keep tap) built a new deck without the
  // draw, so the cards snapped from mid-turn to rest.
  it("draws on opening and keeps drawing across a rewrite, then stops", () => {
    let now = 5_000;
    const panelEl = document.createElement("div");
    document.body.appendChild(panelEl);
    const state = { activePanel: "charges" as const, houseCharges: { ...payload, choiceClosesAt: 1e15 }, houseChargesDraftKeep: undefined as string[] | undefined, camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 22, selected: undefined, houseChargeFocusId: undefined };
    const deps = { root: document, panelEl, rerender: () => renderHouseChargesPanel(state, deps), requestViewRefresh: () => {}, sendGameMessage: () => true, wrapX: (x: number) => x, wrapY: (y: number) => y, now: () => now, closePanel: () => {}, viewport: () => ({ width: 1440, height: 900 }) };
    localStorage.setItem("be.houseCharges.pickDealt", "1");
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector(".hcd-deck")!.classList.contains("is-drawing")).toBe(true);
    const before = panelEl.querySelector(".hcd-deck");
    now += 200;
    state.houseChargesDraftKeep = ["a"];
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector(".hcd-deck")).not.toBe(before);
    expect(panelEl.querySelector(".hcd-deck")!.classList.contains("is-drawing")).toBe(true);
    now += HOUSE_CHARGES_DRAW_MS;
    state.houseChargesDraftKeep = ["a", "b"];
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector(".hcd-deck")!.classList.contains("is-drawing")).toBe(false);
  });
});
