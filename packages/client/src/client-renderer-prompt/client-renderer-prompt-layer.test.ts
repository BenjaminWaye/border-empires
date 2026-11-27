// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { describe, expect, it } from "vitest";
import { liftRendererPromptOverlay } from "./client-renderer-prompt-layer.js";

// Playtest 2026-11-27 (grandparent): the HUD's Dev and Victory race boxes covered the slow-3D prompt's title and
// the charge cards covered its "Switch to 2D" button. Inside #hud (position: fixed, its own stacking context) it
// had no layout and no z-index, so it could never rise above them.
describe("slow-3D prompt layer", () => {
  it("moves the prompt out of #hud to <body>, once", () => {
    document.body.innerHTML = '<div id="hud"><div id="renderer-prompt-overlay" style="display:none"></div></div>';
    const overlay = document.getElementById("renderer-prompt-overlay")!;
    liftRendererPromptOverlay(overlay);
    expect(overlay.parentElement).toBe(document.body);
    liftRendererPromptOverlay(overlay);
    expect(document.querySelectorAll("#renderer-prompt-overlay")).toHaveLength(1);
  });

  it("is a fixed full-screen modal above the HUD (z-index 72 at most) and the guide card", () => {
    const css = readFileSync(new NodeUrl("./client-renderer-prompt-layer.css", import.meta.url), "utf8");
    expect(css).toMatch(/#renderer-prompt-overlay \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 8000;/);
  });
});
