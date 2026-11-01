import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("town bar style regression", () => {
  it("wraps the minor text links onto their own row so they cannot squeeze the Garrison button", () => {
    const source = readFileSync(new URL("./client-hud-v2-town-battle.css", import.meta.url), "utf8");
    const rule = (selector: string): string => source.match(new RegExp(`${selector.replace(/[.#]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? "";

    expect(rule("#v2t-bar.v2t-bar")).toContain("flex-wrap: wrap");
    expect(rule(".v2t-minor")).toContain("flex: 1 0 100%");
  });
});
