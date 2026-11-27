// @vitest-environment happy-dom
import { CREST_COSMETIC_IDS, type PlayerCosmeticSelection } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { CREST_GLYPHS, crestSvg } from "./client-house-crest-art.js";
import { availableCrests, crestFor, crestLabel, emblemFaceHtml, emblemInitial } from "./client-house-crest.js";
import { crestPickerHtml, pickedCrest } from "./client-crest-picker.js";

const state = (entries: Array<[string, PlayerCosmeticSelection]> = []) => ({ playerCosmetics: new Map(entries) });

describe("House crest art", () => {
  it("draws every crest in the catalogue, and nothing else", () => {
    expect(Object.keys(CREST_GLYPHS).sort()).toEqual([...CREST_COSMETIC_IDS].sort());
  });

  it("is a single currentColor SVG, so the emblem's text colour paints it on the House colour", () => {
    for (const id of CREST_COSMETIC_IDS) {
      const host = document.createElement("span");
      host.innerHTML = crestSvg(id);
      const svg = host.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.getAttribute("fill")).toBe("currentColor");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(crestSvg(id)).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });
});

describe("emblem face", () => {
  it("shows the crest when a House has one and its letter otherwise", () => {
    const s = state([["p1", { crest: "crest-anchor" }], ["p2", { musterFlag: "flag-high-noble" }]]);
    expect(crestFor(s, "p1")).toBe("crest-anchor");
    expect(crestFor(s, "p2")).toBeUndefined();
    expect(crestFor(s, undefined)).toBeUndefined();
    expect(emblemFaceHtml("H", crestFor(s, "p1"))).toContain("<svg");
    expect(emblemFaceHtml("H", crestFor(s, "p2"))).toBe("H");
    expect(emblemFaceHtml("<", undefined)).toBe("&lt;");
  });

  it("takes the initial from the House name", () => {
    expect(emblemInitial("  harrow")).toBe("H");
    expect(emblemInitial("")).toBe("?");
  });

  it("names each crest", () => {
    expect(crestLabel("crest-gear-wing")).toBe("Gear-wing");
  });
});

describe("crest picker", () => {
  it("offers the letter and every free crest even before the server lists what the account owns", () => {
    expect(availableCrests({ ownedCosmetics: [] })).toEqual([...CREST_COSMETIC_IDS]);
    const host = document.createElement("div");
    host.innerHTML = crestPickerHtml({ color: "#123456", initial: "H", selected: "crest-key", available: availableCrests({ ownedCosmetics: [] }), disabled: false, attr: "data-v2-crest" });
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-v2-crest]"));
    expect(buttons.map((b) => b.dataset.v2Crest)).toEqual(["", ...CREST_COSMETIC_IDS]);
    expect(host.querySelector('[aria-pressed="true"]')?.getAttribute("data-v2-crest")).toBe("crest-key");
    expect(host.querySelector<HTMLElement>(".crest-pick-emblem")?.style.background).toContain("#123456");
  });

  it("reads the picked crest, null for the letter, and ignores anything else", () => {
    const button = (value: string | null): HTMLElement => {
      const el = document.createElement("button");
      if (value !== null) el.setAttribute("data-v2-crest", value);
      return el;
    };
    expect(pickedCrest(button("crest-stag"), "data-v2-crest")).toBe("crest-stag");
    expect(pickedCrest(button(""), "data-v2-crest")).toBeNull();
    expect(pickedCrest(button("flag-high-noble"), "data-v2-crest")).toBeUndefined();
    expect(pickedCrest(button(null), "data-v2-crest")).toBeUndefined();
    expect(pickedCrest(null, "data-v2-crest")).toBeUndefined();
  });
});
