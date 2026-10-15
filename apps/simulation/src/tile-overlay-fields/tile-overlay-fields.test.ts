import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { mapTile } from "../runtime-snapshot-sections.js";
import { overlaySnakeClearFields, overlaySnakeTruthyFields } from "../simulation-service/proto-overlay-fields.js";
import { OVERLAY_JSON_FIELDS } from "../tile-delta-overlay-fields.js";
import { TILE_OVERLAY_KEYS, overlayJsonFieldsFromTile, overlaySubstructuresFrom, townWireFields } from "./tile-overlay-fields.js";

// Hardcoded on purpose, independent of TILE_OVERLAY_KEYS: dropping a key from
// the shared list must fail here rather than silently shrink every projection.
const EXPECTED_KEYS = [
  "shardSite",
  "naturalWonder",
  "fort",
  "observatory",
  "siegeBattery",
  "economicStructure",
  "sabotage",
  "watchtower",
  "waystation",
  "muster",
  "afc"
];

const EXPECTED_PROTO_FIELDS = [
  "shard_site_json",
  "natural_wonder_json",
  "fort_json",
  "observatory_json",
  "siege_battery_json",
  "economic_structure_json",
  "sabotage_json",
  "watchtower_json",
  "waystation_json",
  "muster_json",
  "afc_json"
];

const fullyLoadedTile: DomainTileState = {
  x: 3,
  y: 4,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  town: { type: "MARKET", name: "Oakford", populationTier: "TOWN" },
  shardSite: { kind: "CACHE", amount: 5 },
  naturalWonder: { type: "DEEPWATER_ENGINE" },
  fort: { ownerId: "p1", status: "active" },
  observatory: { ownerId: "p1", status: "active" },
  siegeBattery: { ownerId: "p1", status: "active" },
  economicStructure: { ownerId: "p1", type: "ORE_REFINERY", status: "active" },
  sabotage: { ownerId: "p2", endsAt: 1000, outputMultiplier: 0.5 },
  watchtower: { activated: true, activatedByPlayerId: "p1" },
  waystation: { activated: false },
  muster: { ownerId: "p1", amount: 10, mode: "HOLD", updatedAt: 0 },
  afc: { ownerId: "p1", status: "active", activatedAt: 0 }
};

describe("tile overlay key list", () => {
  it("covers every overlay substructure", () => {
    expect([...TILE_OVERLAY_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("derives the wire-delta field list from it", () => {
    expect([...OVERLAY_JSON_FIELDS].sort()).toEqual(EXPECTED_KEYS.map((key) => `${key}Json`).sort());
  });

  // That these names exist in simulation.proto is sim-protocol's own test
  // (tile-overlay-fields.test.ts there); this checks the serializer uses them.
  it("serializes every overlay under its proto field name", () => {
    const tile = Object.fromEntries(EXPECTED_KEYS.map((key) => [`${key}Json`, "{}"]));
    expect(Object.keys(overlaySnakeTruthyFields(tile)).sort()).toEqual([...EXPECTED_PROTO_FIELDS].sort());
    const cleared = overlaySnakeClearFields(Object.fromEntries(EXPECTED_KEYS.map((key) => [`${key}Json`, undefined])));
    expect(cleared).toEqual(Object.fromEntries(EXPECTED_PROTO_FIELDS.map((field) => [field, ""])));
  });
});

describe("overlay projections", () => {
  it("persists every overlay in the snapshot tile (mapTile)", () => {
    const snapshot = mapTile(fullyLoadedTile);
    for (const key of EXPECTED_KEYS) {
      expect(snapshot[key as keyof typeof snapshot], `mapTile dropped ${key}`).toEqual(fullyLoadedTile[key as keyof DomainTileState]);
    }
  });

  it("copies present overlays as-is and skips absent ones", () => {
    expect(overlaySubstructuresFrom(fullyLoadedTile)).toEqual(
      Object.fromEntries(EXPECTED_KEYS.map((key) => [key, fullyLoadedTile[key as keyof DomainTileState]]))
    );
    expect(overlaySubstructuresFrom({ fort: undefined })).toEqual({});
  });

  it("stringifies present overlays under their wire names and skips absent ones", () => {
    const fields = overlayJsonFieldsFromTile(fullyLoadedTile);
    for (const key of EXPECTED_KEYS) {
      const field = `${key}Json` as keyof typeof fields;
      expect(fields[field]).toBe(JSON.stringify(fullyLoadedTile[key as keyof DomainTileState]));
    }
    expect(overlayJsonFieldsFromTile({ x: 0, y: 0, terrain: "LAND" } as DomainTileState)).toEqual({});
  });

  it("flattens the town into its wire fields", () => {
    expect(townWireFields(fullyLoadedTile.town)).toEqual({
      townJson: JSON.stringify(fullyLoadedTile.town),
      townType: "MARKET",
      townName: "Oakford",
      townPopulationTier: "TOWN"
    });
    expect(townWireFields(undefined)).toEqual({});
  });
});
