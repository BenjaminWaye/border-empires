// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { hostProfileOverlay, profileScreenStep, unhostProfileOverlay } from "./client-hud-v2-profile.js";

describe("player profile screen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Regression: the profile opened as the old small modal instead of a screen like the Manifest.
  it("opens for a picked player and closes once dismissed", () => {
    expect(profileScreenStep("p2", null)).toBe("open");
    expect(profileScreenStep("p2", "ranks")).toBe("open");
    expect(profileScreenStep("p2", "profile")).toBe("stay");
    expect(profileScreenStep(undefined, "profile")).toBe("close");
    expect(profileScreenStep(undefined, "manifest")).toBe("stay");
  });

  it("moves the profile into the frame body and back, keeping the same element", () => {
    document.body.innerHTML = `<div id="hud"><div id="player-profile-overlay"><section class="intel-modal">Vasker</section></div><div id="after"></div></div><div id="v2s-body">placeholder</div>`;
    const overlay = document.getElementById("player-profile-overlay");
    hostProfileOverlay();
    expect(overlay?.parentElement?.id).toBe("v2s-body");
    expect(document.getElementById("v2s-body")?.textContent).toBe("Vasker");
    hostProfileOverlay();
    unhostProfileOverlay();
    expect(overlay?.parentElement?.id).toBe("hud");
    expect(overlay?.nextElementSibling?.id).toBe("after");
  });
});
