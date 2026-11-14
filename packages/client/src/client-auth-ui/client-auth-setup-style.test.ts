// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";

const css = (file: string): string => readFileSync(new URL(file, import.meta.url), "utf8");
const shown = (selector: string): boolean => getComputedStyle(document.querySelector(selector)!).display !== "none";

beforeEach(() => {
  document.head.innerHTML = `<style>${css("../style.css")}</style><style>${css("./client-auth-setup-style.css")}</style>`;
  document.body.innerHTML = hudMarkup;
});

// Playtest 2026-11-13: the nation setup form showed "Sign in to your empire / Choose your preferred method"
// above "Found your first standard", plus a "Backend … Fly app …" debug line.
describe("nation setup screen", () => {
  it("shows only the setup form, not the sign-in heading or the backend route", () => {
    const panel = document.querySelector<HTMLElement>(".auth-panel")!;
    panel.dataset.mode = "setup";
    expect(shown(".auth-onboarding-state")).toBe(true);
    expect(shown(".auth-panel-head")).toBe(false);
    expect(shown(".auth-panel-emblem")).toBe(false);
    expect(shown("#auth-debug-route")).toBe(false);
  });

  it("keeps the sign-in heading on the sign-in step", () => {
    document.querySelector<HTMLElement>(".auth-panel")!.dataset.mode = "login";
    expect(shown(".auth-panel-head")).toBe(true);
    expect(shown(".auth-onboarding-state")).toBe(false);
  });

  it("is loaded with the other styles", () => {
    expect(css("../client-styles.ts")).toContain('import "./client-auth-ui/client-auth-setup-style.css";');
  });
});
