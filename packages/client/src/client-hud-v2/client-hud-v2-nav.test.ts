// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { navHtml } from "./client-hud-v2-nav.js";

it("keeps destination names inside buttons and exposes the selected destination", () => {
  const host = document.createElement("div");
  host.innerHTML = navHtml({ name: "House", color: "#abc", afcReady: 2, diplomacyRequests: 1, chronicleUnread: 65, active: "towns" });
  const buttons = Array.from(host.querySelectorAll(".hud-v2-bubble"));
  expect(buttons.map((b) => b.querySelector(".hud-v2-bubble-label")?.textContent)).toEqual(["Manifest", "Towns", "AFC", "Diplomacy", "Ranks", "Chronicle"]);
  expect(host.querySelector('[aria-pressed="true"]')?.getAttribute("data-hud-v2-open")).toBe("towns");
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  expect(host.querySelector('[data-hud-v2-open="chronicle"] .hud-v2-bubble-badge-info')?.textContent).toBe("65");
  expect(host.querySelector('[data-hud-v2-open="diplomacy"] .hud-v2-bubble-badge-info')).toBeNull();
});

it("keeps the icon-only Profile button named and selected for assistive technology", () => {
  const host = document.createElement("div");
  host.innerHTML = navHtml({ name: "House", color: "#abc", afcReady: 0, diplomacyRequests: 0, chronicleUnread: 0, active: "self" });
  const crest = host.querySelector('[data-hud-v2-open="self"]');
  expect(crest?.textContent).toBe("H");
  expect(crest?.getAttribute("aria-label")).toBe("House, your profile");
  expect(host.querySelector('[aria-pressed="true"]')?.getAttribute("data-hud-v2-open")).toBe("self");
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
});
