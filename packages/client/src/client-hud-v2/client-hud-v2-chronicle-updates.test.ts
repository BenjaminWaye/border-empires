// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { latestClientChangelogTimestamp, sortedClientChangelogEntries } from "../client-changelog/client-changelog.js";
import { toggledUpdate, updatesTabHtml } from "./client-hud-v2-chronicle-updates.js";

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
    expect(rows[0]?.dataset.v2Update).toBe(String(newest?.createdAt));
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
    expect(toggledUpdate(undefined, 5, 7)).toBe(7);
    expect(toggledUpdate(undefined, 5, 5)).toBeNull();
    expect(toggledUpdate(7, 5, 7)).toBeNull();
    expect(toggledUpdate(null, 5, 5)).toBe(5);
    const [newest] = sortedClientChangelogEntries();
    const host = render(updatesTabHtml(latestClientChangelogTimestamp(), newest?.createdAt));
    expect(host.querySelectorAll(".v2u-changes").length).toBe(1);
  });
});
