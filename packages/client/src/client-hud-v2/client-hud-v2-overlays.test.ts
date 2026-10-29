// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { lensClick, lensMenu, overlaysHtml } from "./client-hud-v2-overlays.js";
import { ownerStanceTagHtml } from "./client-hud-v2-stance-tag.js";

const host = (html: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("map lens button", () => {
  it("is one notched button with no legend, and lists the lenses only while open", () => {
    const closed = host(overlaysHtml(false, false));
    expect(closed.querySelectorAll("button")).toHaveLength(1);
    expect(closed.querySelector("[data-hud-v2-lens-toggle]")?.getAttribute("aria-expanded")).toBe("false");
    // Regression: the old toggle reused the Allies icon and drew a legend box beside the minimap.
    expect(closed.innerHTML).not.toContain("alliance.svg");
    expect(closed.innerHTML).not.toContain("legend");
    const open = host(overlaysHtml(false, true));
    expect(Array.from(open.querySelectorAll<HTMLElement>("[data-hud-v2-lens]")).map((b) => b.dataset.hudV2Lens)).toEqual(["terrain", "diplomacy"]);
    expect(open.querySelector('[data-hud-v2-lens="terrain"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the active lens on the button", () => {
    const on = host(overlaysHtml(true, false));
    expect(on.querySelector("img")?.getAttribute("src")).toBe("/icons/simple/lens-diplomacy.svg");
    expect(on.querySelector(".hud-v2-lens-on")).not.toBeNull();
    expect(host(overlaysHtml(false, false)).querySelector("img")?.getAttribute("src")).toBe("/icons/simple/lens.svg");
  });

  it("opens the list, then a pick sets the view and folds the list", () => {
    const state = { showDiplomacyOverlay: false };
    lensMenu.open = false;
    const toggle = host(overlaysHtml(false, false)).querySelector("[data-hud-v2-lens-toggle]")!;
    expect(lensClick(state, toggle)).toEqual({ handled: true, viewChanged: false });
    expect(lensMenu.open).toBe(true);
    const pick = host(overlaysHtml(false, true)).querySelector('[data-hud-v2-lens="diplomacy"]')!;
    expect(lensClick(state, pick)).toEqual({ handled: true, viewChanged: true });
    expect(state.showDiplomacyOverlay).toBe(true);
    expect(lensMenu.open).toBe(false);
    lensMenu.open = true;
    const same = host(overlaysHtml(true, true)).querySelector('[data-hud-v2-lens="diplomacy"]')!;
    expect(lensClick(state, same)).toEqual({ handled: true, viewChanged: false });
    expect(lensMenu.open).toBe(false);
  });
});

describe("tile owner stance tag", () => {
  const state = { me: "me", allies: ["a"], activeTruces: [{ otherPlayerId: "t", otherPlayerName: "T", startedAt: 0, endsAt: 5.5 * 3_600_000, createdByPlayerId: "me" }] };

  it("tags allies, truces with time left, and everyone else (barbarians too) as hostile", () => {
    expect(ownerStanceTagHtml("a", state, 0)).toContain(">Ally<");
    expect(ownerStanceTagHtml("t", state, 0)).toContain(">Truce 6h<");
    expect(ownerStanceTagHtml("x", state, 0)).toContain("hud-v2-stance-hostile");
    expect(ownerStanceTagHtml("barbarian-1", state, 0)).toContain(">Hostile<");
  });

  it("has no tag for your own or unowned land", () => {
    expect(ownerStanceTagHtml("me", state, 0)).toBe("");
    expect(ownerStanceTagHtml(undefined, state, 0)).toBe("");
  });

  it("reads 1h for a truce in its last hour", () => {
    expect(ownerStanceTagHtml("t", state, 5.2 * 3_600_000)).toContain(">Truce 1h<");
  });
});
