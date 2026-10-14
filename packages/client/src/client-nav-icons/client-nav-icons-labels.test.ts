// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";

// Playtest feedback: the top-bar panel icons had no names ("include the
// names below each icon, they are not intuitive"). The names are drawn by
// client-nav-icons-labels-style.css from each button's aria-label, so every
// desktop panel button needs one, and the stylesheet must be loaded.
const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string => readFileSync(resolve(here, relativePath), "utf8");

describe("desktop top-bar icon names", () => {
  it("gives every #panel-actions button an aria-label to show as its name", () => {
    const container = document.createElement("div");
    container.innerHTML = hudMarkup;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("#panel-actions .icon-btn.icon-only"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
      expect.arrayContaining(["Manifest", "Allies", "Ranks", "Alerts", "Activity", "Sharding", "Settings"])
    );
    for (const button of buttons) expect(button.getAttribute("aria-label")?.trim()).toBeTruthy();
  });

  it("renders the aria-label as a name under the icon, and the stylesheet is loaded", () => {
    const css = read("./client-nav-icons-labels-style.css");
    expect(css).toContain("#panel-actions .icon-btn.icon-only::after");
    expect(css).toContain("content: attr(aria-label)");
    expect(read("../main.ts")).toContain('import "./client-nav-icons/client-nav-icons-labels-style.css";');
  });
});
