import { describe, expect, it } from "vitest";
import { surveySweepFeedEntry } from "./client-network-survey-sweep-feed.js";

describe("surveySweepFeedEntry", () => {
  it("lists resource and town coordinates and focuses the first site", () => {
    const entry = surveySweepFeedEntry(
      [
        { x: 10, y: 20, kind: "resource" },
        { x: 11, y: 21, kind: "town" }
      ],
      5
    );
    expect(entry.text).toContain("1 resource site and 1 town");
    expect(entry.text).toContain("Resources: (10, 20).");
    expect(entry.text).toContain("Towns: (11, 21).");
    expect(entry).toMatchObject({ focusX: 10, focusY: 20, at: 5 });
  });

  it("caps long lists and omits focus when nothing was found", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ x: i, y: 0, kind: "resource" as const }));
    expect(surveySweepFeedEntry(many, 1).text).toContain("+3 more");
    const none = surveySweepFeedEntry([], 1);
    expect(none.focusX).toBeUndefined();
    expect(none.text).not.toContain("Resources:");
  });
});
