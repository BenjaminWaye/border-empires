import { describe, expect, it } from "vitest";
import { actionBarHtml } from "../client-hud-v2/client-hud-v2-action-bar.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { tileMenuHeaderStatusForTile } from "./client-tile-menu-status.js";

const frontier: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" };
const viewWithStatus = (status: { text: string; helpText?: string }): TileMenuView => ({
  title: "Frontier (10, 10)", subtitle: "Your frontier", tabs: ["actions"], overviewLines: [], actions: [], buildings: [], crystal: [],
  statusText: status.text, statusTone: "warning", ...(status.helpText ? { statusHelpText: status.helpText } : {})
});

// Playtest 2026-11 (staging): the reach badge read "Inside Rosa&amp;#39;s Garden II Reach": the status
// escaped the empire name and the HUD escaped the whole line again.
describe("reach badge with an apostrophe in the empire name", () => {
  it("is escaped exactly once by the HUD action bar, on the badge and in its explainer", () => {
    const status = tileMenuHeaderStatusForTile(frontier, 1_000, () => false, () => ["Rosa's Garden II"]);
    expect(status).toBeDefined();
    const badge = actionBarHtml(viewWithStatus(status!));
    expect(badge).toContain("Inside Rosa's Garden II Reach ⓘ</button>");
    const explainer = actionBarHtml(viewWithStatus(status!), "status");
    expect(explainer).toContain("<strong>Inside Rosa's Garden II Reach:</strong>");
    expect(`${badge}${explainer}`).not.toContain("&amp;#39;");
    expect(`${badge}${explainer}`).not.toContain("&#39;");
  });

  it("still escapes markup in a name", () => {
    const status = tileMenuHeaderStatusForTile(frontier, 1_000, () => false, () => ["<b>Evil</b>"]);
    expect(actionBarHtml(viewWithStatus(status!))).toContain("Inside &lt;b&gt;Evil&lt;/b&gt; Reach");
  });
});
