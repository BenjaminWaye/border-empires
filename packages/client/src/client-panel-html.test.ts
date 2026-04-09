import { describe, expect, it } from "vitest";

import { feedHtml } from "./client-panel-html.js";

describe("feedHtml", () => {
  it("renders a focus button for feed entries with tile coordinates", () => {
    const html = feedHtml([
      {
        title: "Town Lost",
        text: "Aetherwick was captured by Red Empire.",
        type: "combat",
        severity: "error",
        at: Date.now() - 1000,
        focusX: 18,
        focusY: 42,
        actionLabel: "Center"
      }
    ]);

    expect(html).toContain("Town Lost");
    expect(html).toContain('data-feed-focus-x="18"');
    expect(html).toContain('data-feed-focus-y="42"');
    expect(html).toContain(">Center<");
  });

  it("renders admin tile debug controls when enabled for the viewer", () => {
    const html = feedHtml([], {
      visible: true,
      enabled: false,
      selectedTileKey: "78,322"
    });

    expect(html).toContain("Admin Tile Debug");
    expect(html).toContain("Target: 78,322");
    expect(html).toContain('data-debug-tile-toggle="1"');
    expect(html).toContain("Debug Selected Tile");
  });
});
