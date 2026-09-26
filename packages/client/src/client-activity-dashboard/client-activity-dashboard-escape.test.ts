import { describe, expect, it } from "vitest";
import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";

describe("escapeActivityDashboardHtml", () => {
  it("escapes player and settlement labels rendered into the dashboard", () => {
    expect(escapeActivityDashboardHtml('<img src=x onerror="alert(1)"> & \'quoted\'')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;"
    );
  });
});
