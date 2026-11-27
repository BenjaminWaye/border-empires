import { describe, expect, it } from "vitest";
import { parseGuideTownLead } from "./guide-town-lead.js";

describe("parseGuideTownLead", () => {
  it("keeps a whole-tile position and turns anything else into null", () => {
    expect(parseGuideTownLead({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    expect(parseGuideTownLead(null)).toBeNull();
    expect(parseGuideTownLead({ x: 1.5, y: 2 })).toBeNull();
    expect(parseGuideTownLead("3,4")).toBeNull();
  });
});
