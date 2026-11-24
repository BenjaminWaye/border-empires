import { describe, expect, it } from "vitest";
import { requesterLandWorthTaking } from "./ai-conquest-worth.js";

const ai = (x: number, y: number) => ({ x, y, ownerId: "ai" });
const me = (x: number, y: number, extra: { townJson?: string; fortJson?: string; resource?: string } = {}) => ({ x, y, ownerId: "me", ...extra });

describe("requesterLandWorthTaking", () => {
  it("is true for an unfortified town or resource near the AI's border", () => {
    expect(requesterLandWorthTaking([ai(0, 0), me(2, 0, { townJson: "{}" })], "ai", "me")).toBe(true);
    expect(requesterLandWorthTaking([ai(0, 0), me(3, 0, { resource: "FARM" })], "ai", "me")).toBe(true);
  });

  it("is false when a fort covers it, when it is far from the border, or when there is nothing of value", () => {
    expect(requesterLandWorthTaking([ai(0, 0), me(2, 0, { townJson: "{}" }), me(3, 0, { fortJson: "{}" })], "ai", "me")).toBe(false);
    expect(requesterLandWorthTaking([ai(0, 0), me(9, 0, { townJson: "{}" })], "ai", "me")).toBe(false);
    expect(requesterLandWorthTaking([ai(0, 0), me(1, 0), me(2, 0)], "ai", "me")).toBe(false);
  });
});
