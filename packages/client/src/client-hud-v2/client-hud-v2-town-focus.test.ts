import { describe, expect, it } from "vitest";
import type { TownFocusCard } from "../client-town-focus/client-town-focus.js";
import { townFocusCardHtml } from "./client-hud-v2-town-focus.js";

const stat = { value: "1", delta: "", tone: "same" as const };
const option = (focus: TownFocusCard["options"][number]["focus"], state: "active" | "queued" | "idle") => ({
  focus, name: focus === "LEVY" ? "Levy" : focus === "BALANCED" ? "Balanced" : focus, tagline: "t", rule: "r", tradeLine: "x", costLine: "y", state, coin: stat, manpower: stat, growth: stat
});
const card = (queued?: "LEVY"): TownFocusCard => ({
  options: [option("BALANCED", "active"), option("GROWTH", "idle"), option("LEVY", queued ? "queued" : "idle"), option("COMMERCE", "idle")],
  active: "BALANCED", queued, startsInMs: 97 * 60_000, queuedInMs: queued ? 97 * 60_000 : 0, growthLabel: "To City", growthPaused: false
});

describe("Town focus card (town screen)", () => {
  it("renders four focus buttons and one detail strip per focus, defaulting to the active one", () => {
    const html = townFocusCardHtml(card());
    expect(html.match(/class="v2tf-opt /g)).toHaveLength(4);
    expect(html.match(/class="v2tf-detail /g)).toHaveLength(4);
    expect(html).toContain('v2tf-detail v2tf-detail-balanced v2tf-detail-default');
    expect(html).toContain('<span class="v2tf-state">Active</span>');
    expect(html).toContain("Refill <b>1h 37m</b>");
  });

  it("keeps Active on the current focus while another is queued, shows the queue in the header and defaults the strip to it", () => {
    const html = townFocusCardHtml(card("LEVY"));
    expect(html).toContain(">Active<");
    expect(html).toContain(">Next<");
    expect(html).toContain("Levy next");
    expect(html).toContain("v2tf-detail-levy v2tf-detail-default");
    expect(html).toContain("Tap Balanced to cancel.");
  });

  it("offers All towns only when some town would change, and asks again before applying", () => {
    const counts = { BALANCED: 2, GROWTH: 0, LEVY: 1, COMMERCE: 0 };
    expect(townFocusCardHtml(card(), { counts })).toContain("All towns → Balanced");
    expect(townFocusCardHtml(card(), { counts, confirmAll: true })).toContain("Tap again: 1 town → Balanced");
    expect(townFocusCardHtml(card(), { counts: { BALANCED: 3, GROWTH: 0, LEVY: 0, COMMERCE: 0 } })).not.toContain("data-v2-town-focus-all");
    expect(townFocusCardHtml(card(), { empireManpowerPerRefill: 24 })).toContain("Empire +24 MP/refill");
  });
});
