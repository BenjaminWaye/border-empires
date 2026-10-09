import { afterEach, describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, nextManpowerRefillAtMs } from "@border-empires/shared";
import { manpowerGaugeChipHtml, ownStagedManpower, resetOwnStagedManpowerCache, type ManpowerGaugeInput } from "./client-manpower-gauge.js";
import { formatRefillCountdown, msUntilManpowerFull, nextManpowerRefillForPlayer } from "./client-manpower-refill.js";

const NOW = 1_790_000_000_000;
const input = (overrides: Partial<ManpowerGaugeInput> = {}): ManpowerGaugeInput => ({
  manpower: 412,
  manpowerCap: 720,
  staged: 0,
  regenPerMinute: 0.4,
  logisticsPerMinute: 0,
  nextRefillAtMs: NOW + 80 * 60_000,
  nowMs: NOW,
  mobile: false,
  formatAmount: (value) => String(Math.round(value)),
  ...overrides
});

describe("manpowerGaugeChipHtml", () => {
  it("shows the value, a countdown to the next refill, and a proportional fill", () => {
    const html = manpowerGaugeChipHtml(input());
    expect(html).toContain('data-panel="manpower"');
    expect(html).toContain("412<small>/720</small>");
    expect(html).toContain("Refill in 1h 20m");
    expect(html).toContain('style="width:57.22%"');
    expect(html).toContain('aria-valuenow="412"');
  });

  it("uses the compact label and bare countdown on mobile", () => {
    const html = manpowerGaugeChipHtml(input({ mobile: true }));
    expect(html).toContain(">MP<");
    expect(html).toContain(">1h 20m<");
    expect(html).not.toContain("Refill in");
  });

  it("turns ember below an ordinary attack and verdigris at the cap", () => {
    expect(manpowerGaugeChipHtml(input({ manpower: 42 }))).toContain("is-low");
    const full = manpowerGaugeChipHtml(input({ manpower: 720 }));
    expect(full).toContain("is-full");
    expect(full).toContain(">Full<");
    expect(full).not.toContain("Refill in");
  });

  it("flags waystation overflow above the cap and clamps the fill to 100%", () => {
    const html = manpowerGaugeChipHtml(input({ manpower: 1_200 }));
    expect(html).toContain("is-overflow");
    expect(html).toContain("+480 over cap");
    expect(html).toContain('style="width:100.00%"');
  });

  it("shows muster-staged manpower as its own segment that never spills past the bar", () => {
    const html = manpowerGaugeChipHtml(input({ manpower: 210, staged: 180 }));
    expect(html).toContain("mp-gauge-staged");
    expect(html).toContain('style="left:29.17%;width:25.00%"');
    expect(html).toContain("180 is staged in muster flags");
    expect(manpowerGaugeChipHtml(input({ manpower: 700, staged: 500 }))).toContain("width:2.78%");
  });

  it("reads Refilling… once the refill is due and Paused when regen is frozen", () => {
    expect(manpowerGaugeChipHtml(input({ nextRefillAtMs: NOW - 1_000 }))).toContain("Refilling…");
    expect(manpowerGaugeChipHtml(input({ regenPerMinute: 0 }))).toContain(">Paused<");
  });

  it("mentions logistics throughput in the tooltip only when there is some", () => {
    expect(manpowerGaugeChipHtml(input({ logisticsPerMinute: 1.5 }))).toContain("Muster logistics throughput: 1.5/min");
    expect(manpowerGaugeChipHtml(input())).not.toContain("logistics");
  });
});

describe("refill helpers", () => {
  it("derives the same schedule the server uses from the player id", () => {
    expect(nextManpowerRefillForPlayer("player-1", NOW)).toBe(nextManpowerRefillAtMs("player-1", NOW));
    expect(nextManpowerRefillForPlayer(undefined, NOW)).toBeUndefined();
  });

  it("formats countdowns to the minute and never reads zero", () => {
    expect(formatRefillCountdown(80 * 60_000)).toBe("1h 20m");
    expect(formatRefillCountdown(2 * 3_600_000)).toBe("2h");
    expect(formatRefillCountdown(45 * 60_000)).toBe("45m");
    expect(formatRefillCountdown(5_000)).toBe("1m");
    expect(formatRefillCountdown(0)).toBe("<1m");
  });

  it("counts whole refills to reach the cap", () => {
    const perRefill = 0.5 * (MANPOWER_REFILL_WINDOW_MS / 60_000);
    expect(msUntilManpowerFull(0, perRefill * 3, 0.5, NOW + 1_000, NOW)).toBe(1_000 + 2 * MANPOWER_REFILL_WINDOW_MS);
    expect(msUntilManpowerFull(10, 10, 0.5, NOW + 1_000, NOW)).toBe(0);
    expect(msUntilManpowerFull(0, 100, 0, NOW + 1_000, NOW)).toBeUndefined();
  });
});

describe("ownStagedManpower", () => {
  afterEach(() => resetOwnStagedManpowerCache());

  it("sums only the player's own muster flags and caches for a second", () => {
    const tiles = [
      { muster: { ownerId: "me", amount: 100 } },
      { muster: { ownerId: "me", amount: 50 } },
      { muster: { ownerId: "rival", amount: 999 } },
      {}
    ];
    expect(ownStagedManpower(tiles, "me", NOW)).toBe(150);
    tiles.push({ muster: { ownerId: "me", amount: 25 } });
    expect(ownStagedManpower(tiles, "me", NOW + 500)).toBe(150);
    expect(ownStagedManpower(tiles, "me", NOW + 1_500)).toBe(175);
  });
});
