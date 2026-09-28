// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { showWaystationActivationOverlay } from "./client-waystation-activation.js";
import { buildWaystationActivationInfo } from "./client-waystation-activation-detect.js";

const overlayText = (): string => document.getElementById("waystation-activation-overlay")?.textContent ?? "";

afterEach(() => {
  document.getElementById("waystation-activation-overlay")?.remove();
});

describe("waystation activation popup -- GOLD / MANPOWER", () => {
  it("shows the gold amount, with tier-specific narrative", () => {
    showWaystationActivationOverlay({ x: 1, y: 2, grantedEffect: "GOLD", revealedTown: false, grantedGold: 100, grantedGoldTier: "LARGE", onJumpToLocation: () => {} });
    expect(overlayText()).toContain("+100 Gold");
    expect(overlayText()).toContain("vaults were stacked with coin");
  });

  it("shows the manpower amount and that it can exceed the cap", () => {
    showWaystationActivationOverlay({ x: 1, y: 2, grantedEffect: "MANPOWER", revealedTown: false, grantedManpower: 1000, onJumpToLocation: () => {} });
    expect(overlayText()).toContain("+1,000 Manpower (can exceed your cap)");
  });

  it("buildWaystationActivationInfo carries the gold / manpower detail through (live + catch-up paths)", () => {
    const info = buildWaystationActivationInfo(
      { activated: true, activatedByPlayerId: "me", grantedEffect: "GOLD", grantedGold: 25, grantedGoldTier: "SMALL" },
      1,
      2,
      "me",
      [],
      () => {}
    );
    expect(info).toMatchObject({ grantedEffect: "GOLD", grantedGold: 25, grantedGoldTier: "SMALL" });
    const manpower = buildWaystationActivationInfo({ activated: true, activatedByPlayerId: "me", grantedEffect: "MANPOWER", grantedManpower: 1000 }, 1, 2, "me", [], () => {});
    expect(manpower).toMatchObject({ grantedEffect: "MANPOWER", grantedManpower: 1000 });
  });
});
