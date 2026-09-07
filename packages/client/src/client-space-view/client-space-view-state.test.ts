import { describe, expect, it } from "vitest";
import {
  classifyPlanetState,
  decorativeOrbitBodyCount,
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

describe("decorativeOrbitBodyCount", () => {
  it("is deterministic for the same seasonId", () => {
    expect(decorativeOrbitBodyCount("season-42")).toBe(decorativeOrbitBodyCount("season-42"));
  });

  it("always returns a count in the 2-4 range", () => {
    for (const seasonId of ["season-1", "season-2", "season-3", "season-4", "season-5"]) {
      const count = decorativeOrbitBodyCount(seasonId);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
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

  it("classifies an uncharted, non-owned system as unknown", () => {
    const state = classifyPlanetState({ seasonId: "other-6", tier: "PLANET", claimed: true }, mine, undefined, () => false);
    expect(state).toBe("unknown");
  });

  it("never downgrades an owned system to unknown, even if uncharted", () => {
    const state = classifyPlanetState({ seasonId: "mine-1", tier: "PLANET" }, mine, undefined, () => false);
    expect(state).toBe("owned");
  });

  it("never downgrades a contested system to unknown, even if uncharted", () => {
    const state = classifyPlanetState({ seasonId: "other-7", tier: "PLANET" }, mine, () => true, () => false);
    expect(state).toBe("contested");
  });

  it("defaults isCharted to always-true when omitted", () => {
    const state = classifyPlanetState({ seasonId: "other-8", tier: "PLANET", claimed: true }, mine);
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

  it("hides a planet's name for an uncharted (unknown) system", () => {
    const models = toSpacePlanetViewModels(
      [{ seasonId: "other-1", tier: "PLANET", claimed: true, planetName: "Vex" }],
      new Set(),
      undefined,
      () => false
    );
    expect(models).toEqual([{ seasonId: "other-1", tier: "PLANET", label: "Unknown System", state: "unknown" }]);
  });
});
