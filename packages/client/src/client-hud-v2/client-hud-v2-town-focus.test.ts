import { describe, expect, it } from "vitest";
import type { TownFocusCard } from "../client-town-focus/client-town-focus.js";
import { townFocusCardHtml } from "./client-hud-v2-town-focus.js";

const stat = { value: "1", delta: "", tone: "same" as const };
const option = (focus: TownFocusCard["options"][number]["focus"], state: "active" | "queued" | "idle") => ({
  focus, name: focus, tagline: "t", rule: "r", tradeLine: "x", costLine: "y", state, coin: stat, manpower: stat, growth: stat
});
const card = (queued?: "LEVY"): TownFocusCard => ({
  options: [option("BALANCED", "active"), option("GROWTH", "idle"), option("LEVY", queued ? "queued" : "idle"), option("COMMERCE", "idle")],
  active: "BALANCED", queued, startsInMs: 97 * 60_000, queuedInMs: queued ? 97 * 60_000 : 0, growthLabel: "To City", growthPaused: false, growthEstimated: false
});

describe("Town focus card (town screen)", () => {
  it("renders one pressable row per focus with the active one marked", () => {
    const html = townFocusCardHtml(card());
    expect(html.match(/data-v2-town-focus="/g)).toHaveLength(4);
    expect(html).toContain('class="v2tf-badge v2tf-badge-active">Active');
    expect(html).toContain("Next refill <span class=\"v2tf-em\">1h 37m</span>");
  });

  it("keeps ACTIVE on the current focus while another is queued, and puts the queue in the header", () => {
    const html = townFocusCardHtml(card("LEVY"));
    expect(html).toContain(">Active<");
    expect(html).toContain(">Next<");
    expect(html).toContain("Levy next");
    expect(html).toContain("Pick <span class=\"v2tf-em\">BALANCED</span> to cancel".replace("BALANCED", "Balanced"));
  });

  it("shows how the player's towns are set", () => {
    const html = townFocusCardHtml(card(), { counts: { BALANCED: 2, GROWTH: 0, LEVY: 1, COMMERCE: 0 }, empireManpowerPerRefill: 24 });
    expect(html).toContain("1 Levy · 2 Balanced");
    expect(html).toContain("net +24 MP per refill vs all Balanced");
    expect(html).toContain('data-v2-town-focus-all="1"');
  });
});
