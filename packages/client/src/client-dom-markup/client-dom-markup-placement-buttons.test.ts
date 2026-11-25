// @vitest-environment happy-dom
// Playtest 2026-11-25 (illustrator, 375 wide): the building placement bar's Cancel / Confirm were blue and
// green rounded pills that matched nothing else. They are the shared .v2s-btn / .v2s-btn-primary now.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hudMarkup } from "./client-dom-markup.js";

const OLD_PILL_CLASSES = ["placement-btn", "placement-cancel-btn", "placement-confirm-btn"];

describe("placement bar buttons", () => {
  const host = document.createElement("div");
  host.innerHTML = hudMarkup;
  const cancel = host.querySelector("#placement-cancel")!;
  const confirm = host.querySelector("#placement-confirm")!;

  it("Confirm is the shared primary button and Cancel the shared secondary one", () => {
    expect([...confirm.classList]).toEqual(expect.arrayContaining(["v2s-btn", "v2s-btn-primary"]));
    expect(cancel.classList.contains("v2s-btn")).toBe(true);
    expect(cancel.classList.contains("v2s-btn-primary")).toBe(false);
  });

  it("drops the old pill classes", () => {
    for (const button of [cancel, confirm]) {
      for (const pill of OLD_PILL_CLASSES) expect(button.classList.contains(pill)).toBe(false);
    }
  });

  it("the bar's stylesheet draws no pill or blue/green fill", () => {
    const css = readFileSync(resolve(process.cwd(), "src/client-placement-overlay-style.css"), "utf8");
    expect(css).not.toMatch(/999px|9999px/);
    expect(css).not.toMatch(/rgba\(\s*(24, 68, 112|56, 176, 60)/);
  });
});
