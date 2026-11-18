import { describe, expect, it } from "vitest";

import { relativeDayTimeLabel } from "./client-activity-dashboard-time.js";

// Local-time dates, so the labels hold in any test runner's timezone.
const at = (day: number, hour: number, minute: number): number => new Date(2026, 10, day, hour, minute).getTime();
const now = at(16, 12, 0); // Mon 16 Nov 2026, noon

describe("relativeDayTimeLabel", () => {
  it("shows only the clock for today", () => {
    expect(relativeDayTimeLabel(at(16, 0, 45), now)).toBe("00:45");
  });

  it("names the day for anything not today, so last night's 00:45 differs from tonight's", () => {
    expect(relativeDayTimeLabel(at(15, 0, 45), now)).toBe("yesterday 00:45");
    expect(relativeDayTimeLabel(at(17, 0, 45), now)).toBe("tomorrow 00:45");
    expect(relativeDayTimeLabel(at(14, 0, 45), now)).toBe("Sat 00:45");
    expect(relativeDayTimeLabel(at(18, 9, 5), now)).toBe("Wed 09:05");
    expect(relativeDayTimeLabel(at(2, 0, 45), now)).toBe("2 Nov 00:45");
  });
});
