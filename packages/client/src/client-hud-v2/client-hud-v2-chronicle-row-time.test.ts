import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { chronicleHtml, chronicleRowTimeHtml } from "./client-hud-v2-chronicle.js";

// Mon 23 Nov 2026, 10:30 local.
const now = new Date(2026, 10, 23, 10, 30).getTime();
const at = (day: number, h: number, m: number): number => new Date(2026, 10, day, h, m).getTime();

const timeline = (occurredAt: number): PersonalActivityTimeline => ({
  playerId: "me",
  from: 0,
  to: now,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 1 },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards: [{ kind: "BUILDING_COMPLETED", id: "b1", occurredAt, x: 478, y: 73, structureType: "HYDROGARDEN" }],
  rivals: [],
  truncated: false
});

const html = (t: PersonalActivityTimeline): string => chronicleHtml({
  me: "me", timeline: t, loading: false, error: undefined, rivalFilter: "", selectedId: undefined,
  nameOf: () => undefined, colorOf: () => undefined, techName: () => undefined, nowMs: now
});

describe("Chronicle row time", () => {
  it("shows only the clock under a YESTERDAY heading, not 'yesterday 21:54' overflowing the 40px column", () => {
    const out = html(timeline(at(22, 21, 54)));
    expect(out).toContain(">YESTERDAY</div>");
    expect(out).toContain('<span class="v2c-time">21:54</span>');
    expect(out).not.toContain("yesterday 21:54");
  });

  it("stacks a short day tag above the clock for the cross-day away-losses group", () => {
    expect(chronicleRowTimeHtml(at(22, 21, 54), now, true)).toBe('<span class="v2c-time-day">Sun</span>21:54');
    expect(chronicleRowTimeHtml(at(2, 8, 5), now, true)).toBe('<span class="v2c-time-day">2 Nov</span>08:05');
    expect(chronicleRowTimeHtml(at(23, 9, 0), now, true)).toBe("09:00");
  });
});
