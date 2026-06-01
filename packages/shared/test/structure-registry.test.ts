import { describe, expect, test } from "vitest";

import { STRUCTURE_REGISTRY, STRUCTURE_REGISTRY_SIZE } from "../src/structure-registry-index.js";
import type { StructureSpec } from "../src/structure-registry.js";
import {
  structureBuildDurationMs,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureCostDefinition,
} from "../src/structure-costs.js";
import {
  FORT_BUILD_MS,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  ECONOMIC_STRUCTURE_BUILD_MS,
} from "../src/config.js";
import type { EconomicStructureType } from "../src/types.js";

// ── Size check ─────────────────────────────────────────────────────

test("STRUCTURE_REGISTRY covers exactly 42 structure types", () => {
  // 3 forts + 1 observatory + 4 outposts + 34 economic = 42
  expect(STRUCTURE_REGISTRY_SIZE).toBe(42);
});

test("all registered types are unique", () => {
  const types = Object.values(STRUCTURE_REGISTRY).map((s) => s.type);
  expect(new Set(types).size).toBe(types.length);
});

// ── Kind coverage ──────────────────────────────────────────────────

test("covers all FortVariant values", () => {
  const fortTypes = ["FORT", "IRON_BASTION", "THUNDER_BASTION"];
  for (const t of fortTypes) {
    const spec = STRUCTURE_REGISTRY[t];
    expect(spec, `missing ${t}`).toBeDefined();
    expect(spec.kind).toBe("FORT");
    expect(spec.tileField).toBe("fort");
  }
});

test("covers OBSERVATORY", () => {
  const spec = STRUCTURE_REGISTRY["OBSERVATORY"];
  expect(spec).toBeDefined();
  expect(spec.kind).toBe("OBSERVATORY");
  expect(spec.tileField).toBe("observatory");
});

test("covers all outpost variants", () => {
  const outpostTypes = ["SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER", "LIGHT_OUTPOST"];
  for (const t of outpostTypes) {
    const spec = STRUCTURE_REGISTRY[t];
    expect(spec, `missing ${t}`).toBeDefined();
    expect(spec.kind).toBe("OUTPOST");
    // LIGHT_OUTPOST lives on economicStructure in Phase 1
    if (t === "LIGHT_OUTPOST") {
      expect(spec.tileField).toBe("economicStructure");
    } else {
      expect(spec.tileField).toBe("siegeOutpost");
    }
  }
});

// ── Cost parity with structure-costs.ts ────────────────────────────

describe("cost parity with structure-costs.ts", () => {
  for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
    test(`${type}: cost matches structure-costs.ts`, () => {
      const def = structureCostDefinition(type as any);
      if (!def) return; // skip non-economic types that aren't in structure-costs

      expect(spec.cost.gold).toBe(def.baseGoldCost);
      expect(spec.cost.manpower).toBe(def.manpowerCost ?? 0);

      if (def.resourceCost) {
        expect(spec.cost.strategic).toBeDefined();
        const key = def.resourceCost.resource as
          | "FOOD"
          | "IRON"
          | "CRYSTAL"
          | "SUPPLY"
          | "SHARD";
        const amount = (spec.cost.strategic as Record<string, number>)[key];
        expect(amount, `${type} strategic ${key} amount`).toBe(
          def.resourceCost.amount,
        );
      } else {
        expect(spec.cost.strategic ?? {}).toEqual({});
      }
    });
  }
});

// ── Build duration parity ─────────────────────────────────────────

describe("buildMs parity with structureBuildDurationMs", () => {
  // structureBuildDurationMs only knows about the four top-level types
  // (FORT, OBSERVATORY, SIEGE_OUTPOST, and economic). Siege variants and
  // sub-types all use SIEGE_OUTPOST_BUILD_MS but the function doesn't map
  // them. Skip types not handled by the existing function.
  const KNOWN_TYPES = new Set([
    "FORT", "OBSERVATORY", "SIEGE_OUTPOST",
    ...Object.keys(STRUCTURE_REGISTRY).filter((t) => {
      const s = STRUCTURE_REGISTRY[t];
      return s.kind === "ECONOMIC" || s === STRUCTURE_REGISTRY["LIGHT_OUTPOST"];
    }),
  ]);

  for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
    if (!KNOWN_TYPES.has(type)) continue; // variant-level type not in structureBuildDurationMs

    test(`${type}: buildMs matches`, () => {
      const expected = structureBuildDurationMs(type as any);
      expect(spec.buildMs).toBe(expected);
    });
  }
});

// ── Tech ID parity ─────────────────────────────────────────────────

describe("techIds parity with existing handlers", () => {
  test("FORT requires masonry", () => {
    expect(STRUCTURE_REGISTRY["FORT"].techIds).toContain("masonry");
  });

  test("IRON_BASTION requires masonry + fortified-walls", () => {
    const ids = STRUCTURE_REGISTRY["IRON_BASTION"].techIds;
    expect(ids).toContain("masonry");
    expect(ids).toContain("fortified-walls");
  });

  test("THUNDER_BASTION requires masonry + fortified-walls + steelworking", () => {
    const ids = STRUCTURE_REGISTRY["THUNDER_BASTION"].techIds;
    expect(ids).toContain("masonry");
    expect(ids).toContain("fortified-walls");
    expect(ids).toContain("steelworking");
  });

  test("OBSERVATORY requires cartography", () => {
    expect(STRUCTURE_REGISTRY["OBSERVATORY"].techIds).toContain("cartography");
  });

  test("SIEGE_OUTPOST requires leatherworking", () => {
    expect(STRUCTURE_REGISTRY["SIEGE_OUTPOST"].techIds).toContain(
      "leatherworking",
    );
  });

  test("SIEGE_TOWER requires leatherworking + siegecraft", () => {
    const ids = STRUCTURE_REGISTRY["SIEGE_TOWER"].techIds;
    expect(ids).toContain("leatherworking");
    expect(ids).toContain("siegecraft");
  });

  test("DREAD_TOWER requires leatherworking + siegecraft + standing-army", () => {
    const ids = STRUCTURE_REGISTRY["DREAD_TOWER"].techIds;
    expect(ids).toContain("leatherworking");
    expect(ids).toContain("siegecraft");
    expect(ids).toContain("standing-army");
  });

  test("LIGHT_OUTPOST has no tech requirement", () => {
    expect(STRUCTURE_REGISTRY["LIGHT_OUTPOST"].techIds).toEqual([]);
  });
});

// ── Tech ID parity for economic structures ─────────────────────────

// Inlined from runtime-structure-rules.ts TECH_REQUIREMENTS_BY_STRUCTURE
const EXPECTED_ECONOMIC_TECH: Record<string, string> = {
  FARMSTEAD: "agriculture",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  SEED_GRANARY: "seed-granaries",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  FUR_SYNTHESIZER: "workshops",
  ADVANCED_FUR_SYNTHESIZER: "advanced-synthetication",
  IRONWORKS: "alchemy",
  ADVANCED_IRONWORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  CARAVANARY: "ledger-keeping",
  FOUNDRY: "industrial-extraction",
  GARRISON_HALL: "organization",
  CUSTOMS_HOUSE: "trade",
  GOVERNORS_OFFICE: "civil-service",
  RADAR_SYSTEM: "radar",
};

describe("economic structure techIds parity", () => {
  for (const [type, expectedTech] of Object.entries(EXPECTED_ECONOMIC_TECH)) {
    test(`${type} requires ${expectedTech}`, () => {
      const spec = STRUCTURE_REGISTRY[type];
      expect(spec, `missing ${type} in registry`).toBeDefined();
      expect(spec.techIds).toContain(expectedTech);
    });
  }

  // Economic structures NOT in TECH_REQUIREMENTS_BY_STRUCTURE should have
  // empty techIds (no tech requirement).
  const noTechTypes: EconomicStructureType[] = [
    "WATERWORKS",
    "CENSUS_HALL",
    "CLEARING_HOUSE",
    "AETHER_TOWER",
    "EXCHANGE_HOUSE",
    "RAIL_DEPOT",
    "IMPERIAL_EXCHANGE_PART",
    "WORLD_ENGINE_PART",
    "AEGIS_DOME_PART",
    "ASTRAL_DOCK_PART",
    "IMPERIAL_EXCHANGE",
    "WORLD_ENGINE",
    "AEGIS_DOME",
    "ASTRAL_DOCK",
  ];
  for (const type of noTechTypes) {
    test(`${type} has no tech requirement`, () => {
      const spec = STRUCTURE_REGISTRY[type];
      expect(spec, `missing ${type}`).toBeDefined();
      expect(spec.techIds).toEqual([]);
    });
  }
});

// ── Upgrade prerequisite parity ────────────────────────────────────

describe("prerequisiteStructureTypes parity", () => {
  test("ADVANCED_FUR_SYNTHESIZER requires FUR_SYNTHESIZER", () => {
    expect(
      STRUCTURE_REGISTRY["ADVANCED_FUR_SYNTHESIZER"].prerequisiteStructureTypes,
    ).toEqual(["FUR_SYNTHESIZER"]);
  });

  test("ADVANCED_IRONWORKS requires IRONWORKS", () => {
    expect(
      STRUCTURE_REGISTRY["ADVANCED_IRONWORKS"].prerequisiteStructureTypes,
    ).toEqual(["IRONWORKS"]);
  });

  test("ADVANCED_CRYSTAL_SYNTHESIZER requires CRYSTAL_SYNTHESIZER", () => {
    expect(
      STRUCTURE_REGISTRY["ADVANCED_CRYSTAL_SYNTHESIZER"]
        .prerequisiteStructureTypes,
    ).toEqual(["CRYSTAL_SYNTHESIZER"]);
  });

  test("SEED_GRANARY requires GRANARY", () => {
    expect(
      STRUCTURE_REGISTRY["SEED_GRANARY"].prerequisiteStructureTypes,
    ).toEqual(["GRANARY"]);
  });

  test("IMPERIAL_EXCHANGE requires IMPERIAL_EXCHANGE_PART", () => {
    expect(
      STRUCTURE_REGISTRY["IMPERIAL_EXCHANGE"].prerequisiteStructureTypes,
    ).toEqual(["IMPERIAL_EXCHANGE_PART"]);
  });

  test("WORLD_ENGINE requires WORLD_ENGINE_PART", () => {
    expect(
      STRUCTURE_REGISTRY["WORLD_ENGINE"].prerequisiteStructureTypes,
    ).toEqual(["WORLD_ENGINE_PART"]);
  });

  test("AEGIS_DOME requires AEGIS_DOME_PART", () => {
    expect(
      STRUCTURE_REGISTRY["AEGIS_DOME"].prerequisiteStructureTypes,
    ).toEqual(["AEGIS_DOME_PART"]);
  });

  test("ASTRAL_DOCK requires ASTRAL_DOCK_PART", () => {
    expect(
      STRUCTURE_REGISTRY["ASTRAL_DOCK"].prerequisiteStructureTypes,
    ).toEqual(["ASTRAL_DOCK_PART"]);
  });
});

// ── Placement check parity ─────────────────────────────────────────

describe("placement predicates", () => {
  test("all specs have at least ownerOwnsTile + tileIsLand", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      expect(
        spec.placement.length,
        `${type} placement array should not be empty`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  test("economic specs include noDuplicateStructureType", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      if (spec.kind === "ECONOMIC") {
        const hasDedup = spec.placement.some((p) => {
          // We can't compare function references directly because they're
          // module-level exports. Instead, test behavior: a tile with a
          // same-type economic structure should be rejected.
          const ctx = {
            tile: {
              x: 0, y: 0,
              terrain: "LAND" as const,
              ownerId: "p1",
              ownershipState: "SETTLED" as const,
              resource: undefined,
              dockId: undefined,
              town: undefined,
              fort: undefined,
              observatory: undefined,
              siegeOutpost: undefined,
              economicStructure: { type },
            },
            actor: { techIds: new Set(), playerId: "p1" },
            isUpgrade: false,
            tileField: "economicStructure" as const,
            extra: { structureType: type },
          };
          const result = p(ctx);
          // Should return a reason string when same type exists
          return result !== null;
        });
        expect(
          hasDedup,
          `${type} should have noDuplicateStructureType check`,
        ).toBe(true);
      }
    }
  });
});

// ── Structural properties ──────────────────────────────────────────

describe("structural properties", () => {
  test("all specs have consumesDevelopmentSlot = true", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      expect(
        spec.consumesDevelopmentSlot,
        `${type} must consume a development slot`,
      ).toBe(true);
    }
  });

  test("all specs have a valid tileField", () => {
    const validFields = [
      "fort",
      "observatory",
      "siegeOutpost",
      "economicStructure",
    ];
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      expect(validFields, `${type} tileField`).toContain(spec.tileField);
    }
  });

  test("every spec has a non-negative gold cost", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      expect(spec.cost.gold, `${type} gold cost`).toBeGreaterThanOrEqual(0);
    }
  });

  test("every spec has a positive buildMs", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      expect(spec.buildMs, `${type} buildMs`).toBeGreaterThan(0);
    }
  });
});
