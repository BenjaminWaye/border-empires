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
    const menuUiSource = sourceFor("./client-tile-action-menu-ui.ts");
    const styleSource = sourceFor("./style.css");
    expect(menuUiSource).toContain('const scrollBody = deps.tileActionMenuEl.querySelector<HTMLElement>("[data-tile-menu-scroll]");');
    expect(menuUiSource).toContain("scrollBody.ontouchmove = (event) => event.stopPropagation();");
    expect(menuUiSource).toContain("const shouldReuseRenderedMenu = state.tileActionMenu.visible && state.tileActionMenu.renderSignature === signature;");
    expect(styleSource).toContain("overflow-y: auto;");
    expect(styleSource).toContain("touch-action: pan-y;");
    expect(styleSource).toContain('grid-template-areas:\n    "icon copy"\n    ". cost";');
    expect(styleSource).toContain("overflow-wrap: anywhere;");
  });
});
