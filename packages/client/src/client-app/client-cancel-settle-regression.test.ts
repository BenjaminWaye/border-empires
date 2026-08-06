import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("cancel settlement regression guard", () => {
  it("keeps the active-settlement cancel action wired to the CANCEL_SETTLE server message", () => {
    const menuUiSource = readFileSync(resolve(here, "../client-tile-action-menu-ui/client-tile-action-menu-ui.ts"), "utf8");
    const actionFlowSource = readFileSync(resolve(here, "../client-action-flow.ts"), "utf8");

    expect(menuUiSource).toContain('if (btn.dataset.progressAction === "cancel_settle")');
    expect(menuUiSource).toContain('deps.sendGameMessage({ type: "CANCEL_SETTLE", x: tile.x, y: tile.y })');
    expect(actionFlowSource).toContain('cancelActionId: "cancel_settle" as const');
  });
});
