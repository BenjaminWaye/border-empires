import { describe, expect, it } from "vitest";
import { afcFoundedBy } from "./afc-founder.js";

describe("afcFoundedBy", () => {
  it("keeps the recorded founder after a capture", () => {
    expect(afcFoundedBy({ ownerId: "p2", capturedAt: 5, foundedBy: "p1" })).toBe("p1");
  });

  it("treats an AFC that was never captured as its owner's", () => {
    expect(afcFoundedBy({ ownerId: "p1" })).toBe("p1");
  });

  it("does not guess the founder of an AFC captured before founders were recorded", () => {
    expect(afcFoundedBy({ ownerId: "p2", capturedAt: 5 })).toBeUndefined();
    expect(afcFoundedBy(undefined)).toBeUndefined();
  });
});
