// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { latestClientChangelogTimestamp, sortedClientChangelogEntries } from "../client-changelog/client-changelog.js";
import { toggledUpdate, updateKey, updatesTabHtml } from "./client-hud-v2-chronicle-updates.js";

const render = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

describe("Chronicle Updates tab", () => {
  // Regression: Updates dropped the legacy What's New cards (Why paragraphs, rounded cards) into the drawer.
  it("lists releases one line each, with only the newest unread one open", () => {
    const [newest, second] = sortedClientChangelogEntries();
    const host = render(updatesTabHtml((second?.createdAt ?? 0) - 1));
    const rows = host.querySelectorAll<HTMLElement>(".v2u-row");
    expect(rows.length).toBe(2);
    expect(host.querySelectorAll(".v2u-new").length).toBe(2);
    expect(rows[0]?.dataset.v2Update).toBe(newest ? updateKey(newest) : "");
    expect(rows[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll(".v2u-changes").length).toBe(1);
    expect(host.querySelectorAll(".v2u-changes li").length).toBe(newest?.changes.length);
    expect(host.textContent).not.toContain("Why");
    expect(host.querySelector(".changelog-entry")).toBeNull();
  });

  it("shows the recent ten closed once everything is read", () => {
    const host = render(updatesTabHtml(latestClientChangelogTimestamp()));
    expect(host.querySelectorAll(".v2u-row").length).toBe(Math.min(10, sortedClientChangelogEntries().length));
    expect(host.querySelectorAll(".v2u-new, .v2u-changes").length).toBe(0);
  });

  it("opens the clicked release and closes it on a second click", () => {
    expect(toggledUpdate(undefined, "5|a", "7|b")).toBe("7|b");
    expect(toggledUpdate(undefined, "5|a", "5|a")).toBeNull();
    expect(toggledUpdate("7|b", "5|a", "7|b")).toBeNull();
    expect(toggledUpdate(null, "5|a", "5|a")).toBe("5|a");
    const [newest] = sortedClientChangelogEntries();
    const host = render(updatesTabHtml(latestClientChangelogTimestamp(), newest ? updateKey(newest) : undefined));
    expect(host.querySelectorAll(".v2u-changes").length).toBe(1);
  });

  // Rows were keyed by createdAt alone; two releases authored in the same millisecond would open together.
  it("keys rows by time and title, so releases sharing a timestamp stay separate", () => {
    expect(updateKey({ createdAt: 5, title: "A" })).not.toBe(updateKey({ createdAt: 5, title: "B" }));
    expect(toggledUpdate(undefined, undefined, updateKey({ createdAt: 5, title: "B" }))).toBe("5|B");
  });
});
