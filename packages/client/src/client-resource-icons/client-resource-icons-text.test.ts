// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resourceGlyphsToIconHtml, resourceIconHtml, setTextWithResourceIcons } from "./client-resource-icons.js";

describe("resourceGlyphsToIconHtml", () => {
  it("swaps resource glyphs in already-HTML text for the icon images", () => {
    expect(resourceGlyphsToIconHtml("Raided. Lost ◉ 12, 🍞 3 Food, ✦ 1 Shard.")).toBe(
      `Raided. Lost ${resourceIconHtml("GOLD")} 12, ${resourceIconHtml("FOOD")} 3 Food, ${resourceIconHtml("SHARD")} 1 Shard.`
    );
  });

  it("leaves text without resource glyphs untouched", () => {
    expect(resourceGlyphsToIconHtml("Captured (4, 7) from <em>Ada</em>.")).toBe("Captured (4, 7) from <em>Ada</em>.");
  });
});

describe("setTextWithResourceIcons", () => {
  it("renders glyphs as images and everything else as plain text", () => {
    const el = document.createElement("div");
    setTextWithResourceIcons(el, "Conquered from <b>Evil</b>. Plundered ⛏ 2 Titanium, 💎 1 Crystal.");
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toBe("Conquered from <b>Evil</b>. Plundered  2 Titanium,  1 Crystal.");
    expect(Array.from(el.querySelectorAll("img")).map((img) => img.getAttribute("src"))).toEqual([
      "/icons/simple/titanium.svg",
      "/icons/simple/crystal.svg"
    ]);
    expect(Array.from(el.querySelectorAll("img")).map((img) => img.getAttribute("alt"))).toEqual(["Titanium", "Crystal"]);
  });

  it("skips the rebuild when the text is unchanged", () => {
    const el = document.createElement("div");
    setTextWithResourceIcons(el, "Plundered 🟣 4 Umbrite.");
    const img = el.querySelector("img");
    setTextWithResourceIcons(el, "Plundered 🟣 4 Umbrite.");
    expect(el.querySelector("img")).toBe(img);
  });

  it("rebuilds after another code path overwrote the element", () => {
    const el = document.createElement("div");
    setTextWithResourceIcons(el, "Plundered ◉ 9.");
    el.textContent = "";
    setTextWithResourceIcons(el, "Plundered ◉ 9.");
    expect(el.querySelector("img")?.getAttribute("src")).toBe("/icons/simple/gold.svg");
    expect(el.textContent).toBe("Plundered  9.");
  });
});
