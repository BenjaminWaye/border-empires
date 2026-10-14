import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { hasManifestBuildSite } from "./client-manifest-build-sites.js";

const farm: Tile = { x: 10, y: 10, ownerId: "me", terrain: "LAND", ownershipState: "SETTLED", resource: "FARM" };

describe("Manifest build sites", () => {
  it("requires an active nearby Hydrogarden before recommending Hydroworks", () => {
    const garden: Tile = { ...farm, economicStructure: { type: "HYDROGARDEN", ownerId: "me", status: "active" } };
    const site = { ...farm, x: 20 };
    expect(hasManifestBuildSite("HYDROWORKS", [site])).toBe(false);
    expect(hasManifestBuildSite("HYDROWORKS", [site, garden])).toBe(true);
    expect(hasManifestBuildSite("HYDROWORKS", [{ ...site, x: 21 }, garden])).toBe(false);
  });
  it("does not recommend Hydroworks for gardens already boosted by another active Hydroworks", () => {
    const garden: Tile = { ...farm, economicStructure: { type: "HYDROGARDEN", ownerId: "me", status: "active" } };
    const existing: Tile = { ...farm, x: 9, economicStructure: { type: "HYDROWORKS", ownerId: "me", status: "active" } };
    expect(hasManifestBuildSite("HYDROWORKS", [{ ...farm, x: 20 }, garden, existing])).toBe(false);
  });
  it("does not promise capped town buildings without verified support eligibility", () => {
    expect(hasManifestBuildSite("CENSUS_HALL", [{ ...farm, townPopulationTier: "CITY" }])).toBe(false);
  });
  it("does not count a Settlement as a developed town for town-only buildings", () => {
    expect(hasManifestBuildSite("MINTWORKS", [{ ...farm, townPopulationTier: "SETTLEMENT" }])).toBe(false);
  });
  it("requires a Farm for a Hydrogarden, not Fish or generic land", () => {
    expect(hasManifestBuildSite("HYDROGARDEN", [])).toBe(false);
    expect(hasManifestBuildSite("HYDROGARDEN", [{ ...farm, resource: "FISH" }])).toBe(false);
    expect(hasManifestBuildSite("HYDROGARDEN", [{ x: 10, y: 10, terrain: "LAND", ownershipState: "SETTLED" }])).toBe(false);
    expect(hasManifestBuildSite("HYDROGARDEN", [farm])).toBe(true);
  });
  it("requires garrisoning before promising an immediate Farm build", () => {
    expect(hasManifestBuildSite("HYDROGARDEN", [{ ...farm, ownershipState: "FRONTIER" }])).toBe(false);
  });
  it("does not promise a build on a fogged or occupied Farm", () => {
    expect(hasManifestBuildSite("HYDROGARDEN", [{ ...farm, fogged: true }])).toBe(false);
    expect(hasManifestBuildSite("HYDROGARDEN", [{ ...farm, observatory: { ownerId: "me", status: "active" } }])).toBe(false);
  });
});
