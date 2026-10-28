import { describe, expect, it } from "vitest";
import type { ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { shouldRenderRawResource } from "./network-resource-3d.js";

const tileWith = (resource: ResourceType, type?: NonNullable<Tile["economicStructure"]>["type"]): Tile => ({
  x: 4, y: 4, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", resource,
  ...(type ? { economicStructure: { ownerId: "p", type, status: "active" } } : {})
});

describe("shouldRenderRawResource for deposit improvements", () => {
  it.each([
    ["TITANIUM", "MINE"],
    ["GEMS", "MINE"],
    ["UMBRITE", "UMBRITE_RIG"]
  ] as const)("hides the raw %s deposit once a %s is built on it", (resource, building) => {
    expect(shouldRenderRawResource(resource, tileWith(resource))).toBe(true);
    expect(shouldRenderRawResource(resource, tileWith(resource, building))).toBe(false);
  });

  it("keeps the deposit under an unrelated structure", () => {
    expect(shouldRenderRawResource("TITANIUM", tileWith("TITANIUM", "UMBRITE_RIG"))).toBe(true);
    expect(shouldRenderRawResource("UMBRITE", tileWith("UMBRITE", "MINE"))).toBe(true);
  });
});
