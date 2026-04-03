import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("tile menu mobile scroll regression guard", () => {
  it("keeps the tile menu body vertically scrollable and isolates touch scroll from the map", () => {
    const mainSource = sourceFor("./main.ts");
    const styleSource = sourceFor("./style.css");
    expect(mainSource).toContain('const scrollBody = tileActionMenuEl.querySelector<HTMLElement>("[data-tile-menu-scroll]");');
    expect(mainSource).toContain("scrollBody.ontouchmove = (event) => event.stopPropagation();");
    expect(styleSource).toContain("overflow-y: auto;");
    expect(styleSource).toContain("touch-action: pan-y;");
  });
});
