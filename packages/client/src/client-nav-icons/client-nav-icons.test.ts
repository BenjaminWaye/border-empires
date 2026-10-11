import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navTabIconHtml, setTabButtonHtml, type NavTabIconKey } from "./client-nav-icons.js";

const KEYS: NavTabIconKey[] = ["core", "missions", "tech", "domains", "alliance", "leaderboard", "feed", "activity", "settings"];

const srcsOf = (html: string): string[] => [...html.matchAll(/\/icons\/[a-z]+\/[a-z]+-\d+\.png/g)].map((match) => match[0]);

describe("navTabIconHtml", () => {
  it("references only PNGs that ship in public/", () => {
    for (const key of KEYS) {
      const srcs = srcsOf(navTabIconHtml(key));
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) {
        const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
        expect(existsSync(file), `${key}: ${file}`).toBe(true);
      }
    }
  });

  it("reuses the Shard resource icon for the Sharding tab", () => {
    expect(srcsOf(navTabIconHtml("domains"))).toEqual([
      "/icons/resources/shard-48.png",
      "/icons/resources/shard-48.png",
      "/icons/resources/shard-72.png",
      "/icons/resources/shard-96.png"
    ]);
  });

  it("keeps the tab-icon wrapper so existing button styling still applies", () => {
    expect(navTabIconHtml("tech")).toMatch(/^<span class="tab-icon tab-icon-art"><img class="tab-icon-img" /);
  });
});

describe("setTabButtonHtml", () => {
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
