// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navTabIconHtml, type NavTabIconKey } from "./client-nav-icons.js";

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
