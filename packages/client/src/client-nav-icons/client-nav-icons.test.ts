// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navTabIconHtml, setTabButtonHtml, type NavTabIconKey } from "./client-nav-icons.js";

const KEYS: NavTabIconKey[] = ["core", "missions", "tech", "domains", "alliance", "leaderboard", "feed", "activity", "settings"];

const srcsOf = (html: string): string[] => [...html.matchAll(/\/icons\/[a-z]+\/[a-z-]+\.svg/g)].map((match) => match[0]);

describe("navTabIconHtml", () => {
  it("references only PNGs that ship in public/", () => {
    for (const key of KEYS) {
      const srcs = srcsOf(navTabIconHtml(key));
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) {
        const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../public", src.slice(1));
        expect(existsSync(file), `${key}: ${file}`).toBe(true);
      }
    }
  });

  it("uses the AFC icon for AFC Upgrades, not the headquarters icon", () => {
    expect(srcsOf(navTabIconHtml("domains"))).toEqual(["/icons/simple/afc.svg"]);
  });

  it("keeps the tab-icon wrapper so existing button styling still applies", () => {
    expect(navTabIconHtml("tech")).toMatch(/^<span class="tab-icon tab-icon-art"><img class="tab-icon-img" /);
  });
});

describe("setTabButtonHtml", () => {
  it("keeps the same icon element when only the badge changes", () => {
    const button = document.createElement("button");
    setTabButtonHtml(button, navTabIconHtml("tech"));
    const icon = button.querySelector("img");
    setTabButtonHtml(button, navTabIconHtml("tech") + '<span class="tech-ready-dot"></span>');
    expect(button.querySelector("img")).toBe(icon);
    expect(button.querySelector(".tech-ready-dot")).not.toBeNull();
    setTabButtonHtml(button, navTabIconHtml("tech"));
    expect(button.querySelector("img")).toBe(icon);
    expect(button.querySelector(".tech-ready-dot")).toBeNull();
  });

  it("replaces the icon when the button switches to a different tab icon", () => {
    const button = document.createElement("button");
    setTabButtonHtml(button, navTabIconHtml("tech"));
    setTabButtonHtml(button, navTabIconHtml("feed"));
    expect(button.querySelector("img")?.getAttribute("src")).toBe("/icons/simple/feed.svg");
    expect(button.querySelectorAll("img")).toHaveLength(1);
  });

  it("only rewrites the button when the markup changes", () => {
    let writes = 0;
    let current = "";
    const button = {
      get innerHTML() { return current; },
      set innerHTML(value: string) { writes += 1; current = value; }
    } as unknown as HTMLElement;

    setTabButtonHtml(button, navTabIconHtml("feed"));
    setTabButtonHtml(button, navTabIconHtml("feed"));
    expect(writes).toBe(1);

    setTabButtonHtml(button, `${navTabIconHtml("feed")}<span class="feed-alert-dot">2</span>`);
    expect(writes).toBe(2);
    expect(current).toContain("feed-alert-dot");
  });
});
