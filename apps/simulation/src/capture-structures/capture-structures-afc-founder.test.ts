import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { afcFoundedBy } from "@border-empires/shared";
import { capturedStructureFields } from "./capture-structures.js";

const afcTile = (afc: NonNullable<DomainTileState["afc"]>): DomainTileState =>
  ({ x: 1, y: 1, terrain: "LAND", ownerId: afc.ownerId, ownershipState: "SETTLED", afc }) as DomainTileState;

describe("AFC founder through captures", () => {
  it("records the House that landed an AFC when it is first captured", () => {
    const afc = capturedStructureFields(afcTile({ ownerId: "varn", status: "active", landedAt: 0 }), "sigrid", 10).afc;
    expect(afc).toMatchObject({ ownerId: "sigrid", foundedBy: "varn" });
  });

  it("keeps the first founder when the AFC changes hands again", () => {
    const once = capturedStructureFields(afcTile({ ownerId: "varn", status: "active" }), "sigrid", 10).afc!;
    const twice = capturedStructureFields(afcTile(once), "alden", 20).afc;
    expect(afcFoundedBy(twice)).toBe("varn");
  });

  it("leaves the founder unknown for an AFC captured before founders were recorded", () => {
    const afc = capturedStructureFields(afcTile({ ownerId: "sigrid", status: "active", capturedAt: 5 }), "alden", 20).afc;
    expect(afc?.foundedBy).toBeUndefined();
    expect(afcFoundedBy(afc)).toBeUndefined();
  });
});
