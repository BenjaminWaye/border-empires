import { describe, expect, it } from "vitest";

import type { GarrisonManyPlan } from "./client-garrison-many-model.js";
import { garrisonManyHtml } from "./client-garrison-many-view.js";

const plan = (blocked: string): GarrisonManyPlan => ({ tiles: [], excluded: [], manpower: 90, coin: 0, blocked });
const message = (html: string): string => /garrison-many-message" role="status">([^<]*)</.exec(html)?.[1] ?? "";

// Review of #2775: a stale refusal note hid why Confirm was disabled once tiles were selected.
describe("garrisonManyHtml message", () => {
  it("shows the refusal note over the empty-selection prompt", () => {
    expect(message(garrisonManyHtml(0, plan("Tap your frontier tiles inside your reach"), "Outside your reach"))).toBe("Outside your reach");
  });

  it("keeps the plan's blocked reason once tiles are selected", () => {
    expect(message(garrisonManyHtml(3, plan("Need 90 manpower"), "Outside your reach"))).toBe("Need 90 manpower");
  });

  it("shows the note when the selection can be confirmed", () => {
    expect(message(garrisonManyHtml(3, plan(""), "Outside your reach"))).toBe("Outside your reach");
  });
});
