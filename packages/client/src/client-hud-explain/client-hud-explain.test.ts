// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUD_EXPLAIN_LINES, hudExplainAttr, hudExplainSeen, interceptHudExplainTap, resetHudExplainForTests } from "./client-hud-explain.js";
import { navHtml } from "../client-hud-v2/client-hud-v2-nav.js";
import { resourceBarHtml } from "../client-hud-v2/client-hud-v2-resource-bar.js";
import { buildSlotsHtml } from "../client-hud-v2/client-hud-v2-tracker.js";
import { houseChargesDockHtml } from "../client-house-charges/client-house-charges-bubble.js";

const button = (key: string): HTMLButtonElement => {
  document.body.innerHTML = `<button type="button"${hudExplainAttr(key as keyof typeof HUD_EXPLAIN_LINES)}><span class="inner">Word</span></button>`;
  return document.querySelector("button")!;
};
const callout = (): HTMLElement | null => document.getElementById("hud-explain-callout");

beforeEach(() => resetHudExplainForTests());
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// First-15 playtest 2026-11-28: Integrity, Dev, "over cap", sealed charges, Victory race, AFC, Manifest and
// Chronicle meant nothing to new players; the owner asked for a one-line explanation on tap.
describe("tap-to-explain HUD words", () => {
  it("explains a word on its first tap and swallows that tap", () => {
    const el = button("integrity");
    expect(interceptHudExplainTap(el.querySelector(".inner"))).toBe(true);
    expect(callout()?.querySelector(".hud-explain-text")?.textContent).toBe(HUD_EXPLAIN_LINES.integrity);
    expect(hudExplainSeen("integrity")).toBe(true);
  });

  it("lets later taps through and closes the callout", () => {
    const el = button("afc");
    interceptHudExplainTap(el);
    expect(interceptHudExplainTap(el)).toBe(false);
    expect(callout()).toBeNull();
  });

  it("remembers seen words across reloads", () => {
    const el = button("manifest");
    interceptHudExplainTap(el);
    expect(JSON.parse(localStorage.getItem("be.hudExplainSeen.v1") ?? "[]")).toContain("manifest");
  });

  it("ignores taps on unmarked elements", () => {
    document.body.innerHTML = `<button type="button">Plain</button>`;
    expect(interceptHudExplainTap(document.querySelector("button"))).toBe(false);
    expect(callout()).toBeNull();
  });

  it("Open performs the word's own action", () => {
    const el = button("chronicle");
    const acted = vi.fn();
    el.addEventListener("click", acted);
    interceptHudExplainTap(el);
    callout()!.querySelector<HTMLButtonElement>(".hud-explain-open")!.click();
    expect(acted).toHaveBeenCalledTimes(1);
    expect(callout()).toBeNull();
  });

  // Review of PR #3086: "dev" sits in the desktop tracker and the phone summary; Open clicked the first, even hidden.
  it("Open acts on the word's element that is on screen, not a hidden copy", () => {
    document.body.innerHTML = `<button type="button" id="hidden"${hudExplainAttr("dev")}>Dev</button><span id="shown"${hudExplainAttr("dev")}>Dev</span>`;
    const hidden = document.getElementById("hidden")!;
    const shown = document.getElementById("shown")!;
    // display:none leaves an element with no client rects.
    vi.spyOn(hidden, "getClientRects").mockReturnValue({ length: 0 } as unknown as DOMRectList);
    const hiddenActed = vi.fn();
    const shownActed = vi.fn();
    hidden.addEventListener("click", hiddenActed);
    shown.addEventListener("click", shownActed);
    interceptHudExplainTap(shown);
    callout()!.querySelector<HTMLButtonElement>(".hud-explain-open")!.click();
    expect(shownActed).toHaveBeenCalledTimes(1);
    expect(hiddenActed).not.toHaveBeenCalled();
  });

  it("closes on a press elsewhere, or by itself after a few seconds", () => {
    vi.useFakeTimers();
    interceptHudExplainTap(button("dev"));
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(callout()).toBeNull();
    interceptHudExplainTap(button("victory"));
    vi.advanceTimersByTime(8_001);
    expect(callout()).toBeNull();
  });

  it("keeps every explanation to one short line", () => {
    for (const line of Object.values(HUD_EXPLAIN_LINES)) {
      expect(line.length).toBeLessThanOrEqual(100);
      expect(line).not.toMatch(/\n|per minute|\/min/);
    }
  });

  it("marks every main-screen HUD word", () => {
    const nav = navHtml({ name: "Me", color: "#fff", afcReady: 0, diplomacyRequests: 0, chronicleUnread: 0, active: undefined });
    for (const key of ["manifest", "towns", "afc", "diplomacy", "ranks", "chronicle"]) expect(nav).toContain(`data-hud-explain="${key}"`);
    const zero = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
    expect(resourceBarHtml({ gold: 1, netPerMinute: 0, slotSupply: zero, slotDemand: zero, integrityPct: 50 })).toContain('data-hud-explain="integrity"');
    expect(buildSlotsHtml({ busy: 0, limit: 3 }, false, false)).toContain('data-hud-explain="dev"');
    expect(houseChargesDockHtml({ charges: [] } as never, false)).toContain('data-hud-explain="charges"');
  });
});
