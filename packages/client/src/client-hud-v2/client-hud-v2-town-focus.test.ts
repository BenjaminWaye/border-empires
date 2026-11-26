import { describe, expect, it } from "vitest";
import type { TownFocusCard } from "../client-town-focus/client-town-focus.js";
import { townFocusCardHtml } from "./client-hud-v2-town-focus.js";

const stat = { value: "1", delta: "", change: 0, tone: "same" as const };
const option = (focus: TownFocusCard["options"][number]["focus"], state: "active" | "idle") => ({
  focus, name: focus === "LEVY" ? "Levy" : focus === "BALANCED" ? "Balanced" : focus, tagline: "t", rule: "r", tradeLine: "x", costLine: "y", costShort: "z", state, coin: stat, manpower: stat, growth: stat
});
const card = (): TownFocusCard => ({
  options: [option("BALANCED", "active"), option("GROWTH", "idle"), option("LEVY", "idle"), option("COMMERCE", "idle")],
  active: "BALANCED", nextRefillInMs: 97 * 60_000, growthLabel: "To City", growthPaused: false, unfed: false
});

describe("Town focus card (town screen)", () => {
  it("renders four focus buttons and one detail strip per focus, defaulting to the active one", () => {
    const html = townFocusCardHtml(card());
    expect(html.match(/class="v2tf-opt /g)).toHaveLength(4);
    expect(html.match(/class="v2tf-detail /g)).toHaveLength(4);
    expect(html).toContain('v2tf-detail v2tf-detail-balanced v2tf-detail-default');
    expect(html).toContain('<span class="v2tf-state">Active</span>');
    expect(html).toContain("Next refill <b>1h 37m</b>");
  });

  it("says a switch is free and immediate, with no queued state", () => {
    const html = townFocusCardHtml(card());
    expect(html).toContain("Switches within a minute");
    expect(html).not.toContain("next refill</");
    expect(html).not.toContain("cancel");
  });

  it("offers All towns only when some town would change, and asks again before applying", () => {
    const counts = { BALANCED: 2, GROWTH: 0, LEVY: 1, COMMERCE: 0 };
    expect(townFocusCardHtml(card(), { counts })).toContain("All towns → Balanced");
    expect(townFocusCardHtml(card(), { counts, confirmAll: true })).toContain("Again to confirm: 1 town → Balanced");
    expect(townFocusCardHtml(card(), { counts: { BALANCED: 3, GROWTH: 0, LEVY: 0, COMMERCE: 0 } })).not.toContain("data-v2-town-focus-all");
    expect(townFocusCardHtml(card(), { empireManpowerPerRefill: 24 })).toContain("All towns vs Balanced <b class=\"v2tf-up\">+24</b> MP/refill");
  });
});

describe("Town focus figures carry their units", () => {
  it("shows a change with the same unit as its figure, so −12 reads as a smaller refill, not a cost", () => {
    const c = card();
    c.options[3] = { ...c.options[3]!, state: "active", manpower: { value: "108", delta: "−12", change: -12, tone: "down" }, coin: { value: "111", delta: "+19", change: 19, tone: "up" } };
    c.options[0] = { ...c.options[0]!, state: "idle" };
    const html = townFocusCardHtml({ ...c, active: "COMMERCE" });
    expect(html).toContain("−12<small>/refill</small>");
    expect(html).toContain("+19<small>/day</small>");
  });
});

describe("Town focus empire sums", () => {
  it("adds changes of 1,000 and more as numbers, never as parsed text (no −NaN)", () => {
    const c = card();
    c.options[2] = { ...c.options[2]!, coin: { value: "5,000", delta: "−1,152", change: -1152, tone: "down" } };
    const html = townFocusCardHtml(c, { empireManpowerPerRefill: 0, empireCoinPerDay: 0 });
    expect(html).not.toContain("NaN");
    expect(html).toContain("−1152");
  });
});
