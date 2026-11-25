// @vitest-environment happy-dom
// Playtest Run 5 (Henrik, 375x620): with Expand To as the main action on neutral land, a blocked
// Build Relay Beacon fell to the minor row greyed out, its reason only in a tooltip a phone never shows.
import { describe, expect, it } from "vitest";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { actionBarHtml } from "./client-hud-v2-action-bar.js";
import { minorActionButtonHtml } from "./client-hud-v2-minor-button.js";

const neutral = (actions: TileActionDef[]): TileMenuView => ({ title: "Grassland (5, 5)", subtitle: "Neutral", tabs: ["actions"], overviewLines: [], actions, buildings: [], crystal: [] });
const minorButton = (html: string, id: string): HTMLButtonElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector(`.hud-v2-minor[data-hud-v2-action="${id}"]`) as HTMLButtonElement;
};

describe("minor-row buttons say why they are blocked", () => {
  it("shows a blocked Relay Beacon's reason on the button, not only in a tooltip", () => {
    const html = actionBarHtml(neutral([
      { id: "settle_land", label: "Expand To", cost: "10 coin" },
      { id: "build_relay_beacon_frontier" as TileActionDef["id"], label: "Build Relay Beacon", disabled: true, disabledReason: "Need a free FOOD slot" }
    ]));
    const button = minorButton(html, "build_relay_beacon_frontier");
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".hud-v2-minor-why")?.textContent).toBe("Need a free FOOD slot");
  });

  it("adds nothing to an enabled button, and escapes the reason", () => {
    expect(minorActionButtonHtml({ id: "abandon_territory", label: "Abandon" } as TileActionDef, "", "")).not.toContain("hud-v2-minor-why");
    expect(minorActionButtonHtml({ id: "abandon_territory", label: "Abandon", disabled: true, disabledReason: "<b>" } as TileActionDef, "", "")).toContain("&lt;b&gt;");
  });
});
