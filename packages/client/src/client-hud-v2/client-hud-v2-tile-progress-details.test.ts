import { describe, expect, it } from "vitest";
import { tileProgressHtml } from "./client-hud-v2-tile-progress.js";

describe("inline progress details", () => {
  it("keeps the winner and queued start condition, escaping both", () => {
    const html = tileProgressHtml({ title: "Battle resolved", detail: "Winner: <Rival>", remainingLabel: "Done", progress: 1, note: "The result is final.",
      queuedNext: [{ title: "Garrison queued", detail: "Starts after <battle>", cancelLabel: "Cancel", cancelActionId: "cancel_queued_auto_settle" }] });
    expect(html).toContain("Winner: &lt;Rival&gt;");
    expect(html).toContain("Starts after &lt;battle&gt;");
    expect(html).not.toContain("<Rival>");
  });
});
