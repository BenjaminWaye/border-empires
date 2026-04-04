import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("build cancel regression guard", () => {
  it("keeps one progress cancel action wired to the generic cancel-build server message", () => {
    const menuUiSource = readFileSync(resolve(here, "./client-tile-action-menu-ui.ts"), "utf8");
    const viewSource = readFileSync(resolve(here, "./client-tile-menu-view.ts"), "utf8");

    expect(menuUiSource).toContain('if (btn.dataset.progressAction !== "cancel_structure_build") return;');
    expect(menuUiSource).toContain('deps.sendGameMessage({ type: "CANCEL_STRUCTURE_BUILD", x: tile.x, y: tile.y })');
    expect(viewSource).toContain('cancelLabel: "Cancel construction"');
  });
});
