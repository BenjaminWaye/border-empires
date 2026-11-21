// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { findGuideAnchorElement, syncGuideAnchorOutline } from "./tutorial-guide-anchor.js";
import { confirmFirstMusterStage } from "../client-muster-stage-confirm/client-muster-stage-confirm.js";
import { hideBreakPactSheet } from "../client-break-pact-sheet/client-break-pact-sheet.js";

const rect = (element: HTMLElement, top: number, height: number): void => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 10, y: top, left: 10, top, right: 190, bottom: top + height, width: 180, height, toJSON: () => ({})
  });
};

beforeEach(() => {
  document.body.innerHTML = '<button data-v2-build-category="town_support">Town Support</button><div id="list" style="overflow-y:auto"><button data-v2-build-pick="build_manufactory">Manufactory</button></div>';
  rect(document.querySelector<HTMLElement>("[data-v2-build-category]")!, 50, 40);
  rect(document.getElementById("list")!, 100, 120);
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

it("does not outline a Manufactory row clipped by the scrolling build list", () => {
  const row = document.querySelector<HTMLElement>("[data-v2-build-pick]")!;
  rect(row, 60, 80); // On the viewport, but partly behind the list's header.
  const category = document.querySelector("[data-v2-build-category]");
  expect(findGuideAnchorElement("manufactory")).toBe(category);
  syncGuideAnchorOutline("manufactory");
  expect(document.getElementById("tutorial-guide-anchor-outline")?.style.top).toBe("46px");
});

it("outlines the row after it scrolls fully into view", () => {
  const row = document.querySelector<HTMLElement>("[data-v2-build-pick]")!;
  rect(row, 120, 60);
  expect(findGuideAnchorElement("manufactory")).toBe(row);
});

it("prefers the visible Place button even when the selected row has scrolled away", () => {
  rect(document.querySelector<HTMLElement>("[data-v2-build-pick]")!, 60, 80);
  const place = document.createElement("button");
  place.dataset.hudV2Action = "build_manufactory";
  document.body.appendChild(place);
  rect(place, 240, 40);
  expect(findGuideAnchorElement("manufactory")).toBe(place);
});

it("points the muster step at Stage Muster, then at the first-flag confirm sheet's button above it", () => {
  // Regression (2026-11-21 playtest): neither the tile's Stage Muster button nor the confirm was outlined.
  const stage = document.createElement("button");
  stage.dataset.hudV2Action = "muster_hold";
  document.body.appendChild(stage);
  rect(stage, 300, 40);
  expect(findGuideAnchorElement("muster")).toBe(stage);
  syncGuideAnchorOutline("muster");
  expect(document.getElementById("tutorial-guide-anchor-outline")?.style.zIndex).toBe("");

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10, y: 400, left: 10, top: 400, right: 190, bottom: 440, width: 180, height: 40, toJSON: () => ({})
  });
  confirmFirstMusterStage({ authEmail: "guide-muster@test", flagCap: 30, x: 1, y: 2, proceed: () => undefined });
  const go = document.querySelector('[data-sheet="stage-muster"] [data-pact-go]');
  expect(go).not.toBeNull();
  expect(findGuideAnchorElement("muster")).toBe(go);
  syncGuideAnchorOutline("muster");
  expect(document.getElementById("tutorial-guide-anchor-outline")?.style.zIndex).toBe("10000");
  hideBreakPactSheet();
});
