import { describe, expect, it } from "vitest";
import {
  classifyPlanetState,
  galaxyLayoutPosition,
  ownsSpaceViewEligiblePlanet,
  toSpacePlanetViewModels
} from "./client-space-view-state.js";

describe("ownsSpaceViewEligiblePlanet", () => {
  it("is false with no planets", () => {
    expect(ownsSpaceViewEligiblePlanet(undefined)).toBe(false);
    expect(ownsSpaceViewEligiblePlanet(null)).toBe(false);
    expect(ownsSpaceViewEligiblePlanet([])).toBe(false);
  });

  it("is true with at least one planet", () => {
    expect(ownsSpaceViewEligiblePlanet([{ seasonId: "s1" }])).toBe(true);
  });
});

describe("galaxyLayoutPosition", () => {
  it("is deterministic for the same seasonId", () => {
    const a = galaxyLayoutPosition("season-42");
    const b = galaxyLayoutPosition("season-42");
    expect(a).toEqual(b);
  });

  it("differs across seasonIds (spot check, not a distribution proof)", () => {
    const a = galaxyLayoutPosition("season-1");
    const b = galaxyLayoutPosition("season-2");
    expect(a).not.toEqual(b);
  });

  it("lies on the requested sphere radius", () => {
    const radius = 40;
    const p = galaxyLayoutPosition("season-abc", radius);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    expect(dist).toBeCloseTo(radius, 5);
  });
});

describe("classifyPlanetState", () => {
  const mine = new Set(["mine-1"]);

  it("classifies owned planets first, even if also reported contested", () => {
    const state = classifyPlanetState({ seasonId: "mine-1", tier: "PLANET" }, mine, () => true);
    expect(state).toBe("owned");
  });

  it("classifies contested via the injected predicate", () => {
    const state = classifyPlanetState({ seasonId: "other-1", tier: "PLANET" }, mine, (id) => id === "other-1");
    expect(state).toBe("contested");
  });

  it("classifies unclaimed Planet-tier seasons as frontier", () => {
    const state = classifyPlanetState({ seasonId: "other-2", tier: "PLANET", claimed: false }, mine);
    expect(state).toBe("frontier");
  });

  it("defaults to other for claimed planets owned by someone else", () => {
    const state = classifyPlanetState({ seasonId: "other-3", tier: "PLANET", claimed: true }, mine);
    expect(state).toBe("other");
  });

  it("defaults to other for outposts", () => {
    const state = classifyPlanetState({ seasonId: "other-4", tier: "OUTPOST" }, mine);
    expect(state).toBe("other");
  });

  it("defaults isContested to always-false when omitted", () => {
    const state = classifyPlanetState({ seasonId: "other-5", tier: "PLANET", claimed: true }, mine);
    expect(state).toBe("other");
  });
});

describe("toSpacePlanetViewModels", () => {
  it("maps a full listing end to end", () => {
    const models = toSpacePlanetViewModels(
      [
        { seasonId: "mine-1", tier: "PLANET", planetName: "Aurelia" },
        { seasonId: "other-1", tier: "PLANET", claimed: true, planetName: "Vex" },
        { seasonId: "other-2", tier: "PLANET", claimed: false }
      ],
      new Set(["mine-1"])
    );
    expect(models).toEqual([
      { seasonId: "mine-1", tier: "PLANET", label: "Aurelia", state: "owned" },
      { seasonId: "other-1", tier: "PLANET", label: "Vex", state: "other" },
      { seasonId: "other-2", tier: "PLANET", label: "other-2", state: "frontier" }
    ]);
  });
});
