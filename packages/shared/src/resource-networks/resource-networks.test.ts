import { describe, expect, it } from "vitest";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "./resource-networks.js";
import { ClientMessageSchema } from "../messages/messages.js";
import { structureShowsOnTile } from "../structure-placement.js";

describe("resource networks", () => {
  for (const resource of NETWORK_RESOURCES) {
    it(`${resource}: accepts the real build wire command and restricts placement to its deposit`, () => {
      const building = RESOURCE_NETWORKS[resource].building;
      expect(ClientMessageSchema.parse({ type: "BUILD_ECONOMIC_STRUCTURE", x: 10, y: 10, structureType: building })).toMatchObject({ structureType: building });
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED", resource })).toBe(true);
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED", resource: "FARM" })).toBe(false);
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED" })).toBe(false);
    });
  }
});
