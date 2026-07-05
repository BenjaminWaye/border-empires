import { describe, expect, it } from "vitest";

import { InMemoryGalaxyPlanetStore } from "./galaxy-planet-store.js";

describe("InMemoryGalaxyPlanetStore", () => {
  it("christens a planet once and reports it as inserted", async () => {
    const store = new InMemoryGalaxyPlanetStore(() => 1_000);

    await expect(
      store.christen({ seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard" })
    ).resolves.toEqual({
      inserted: true,
      record: { seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard", namedAt: 1_000 }
    });
  });

  it("does not overwrite an existing planet name on a second christening", async () => {
    let now = 1_000;
    const store = new InMemoryGalaxyPlanetStore(() => now);

    await store.christen({ seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard" });
    now = 2_000;

    await expect(
      store.christen({ seasonId: "season-1", ownerAuthUid: "uid-2", planetName: "New Terra" })
    ).resolves.toEqual({
      inserted: false,
      record: { seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard", namedAt: 1_000 }
    });
  });

  it("round-trips by seasonId", async () => {
    const store = new InMemoryGalaxyPlanetStore(() => 1_000);
    await store.christen({ seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard" });

    await expect(store.getBySeasonId("season-1")).resolves.toEqual({
      seasonId: "season-1",
      ownerAuthUid: "uid-1",
      planetName: "Aethelgard",
      namedAt: 1_000
    });
    await expect(store.getBySeasonId("season-missing")).resolves.toBeUndefined();
  });

  it("round-trips by owner, returning all of that owner's planets", async () => {
    const store = new InMemoryGalaxyPlanetStore(() => 1_000);
    await store.christen({ seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard" });
    await store.christen({ seasonId: "season-2", ownerAuthUid: "uid-1", planetName: "New Terra" });
    await store.christen({ seasonId: "season-3", ownerAuthUid: "uid-2", planetName: "Kepler's Rest" });

    const owned = await store.getByOwner("uid-1");
    expect(owned.map((r) => r.seasonId).sort()).toEqual(["season-1", "season-2"]);
  });
});
