import { describe, expect, test } from "vitest";

import { STRUCTURE_REGISTRY, STRUCTURE_REGISTRY_SIZE } from "../src/structure-registry-index.js";
import type { StructureSpec } from "../src/structure-registry.js";
import {
  structureBuildDurationMs,
  structureCostDefinition,
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
} from "../src/structure-costs.js";
import { OBSERVATORY_BUILD_MS } from "../src/config.js";
import type { EconomicStructureType } from "../src/types.js";

// ── Import live source-of-truth for cross-check ────────────────────
// TECH_REQUIREMENTS_BY_STRUCTURE now lives in shared as the single source
// of truth. Both the registry and the simulation import from here.

import { TECH_REQUIREMENTS_BY_STRUCTURE as LIVE_TECH_REQ } from "../src/structure-registry-economic.js";

// ── Size check ─────────────────────────────────────────────────────

test("STRUCTURE_REGISTRY covers exactly 43 structure types", () => {
  // 3 forts + 1 observatory + 4 outposts + 35 economic (incl. WOODEN_FORT) = 43
  expect(STRUCTURE_REGISTRY_SIZE).toBe(43);
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
    if (t === "LIGHT_OUTPOST") {
      expect(spec.tileField).toBe("economicStructure");
    } else {
      expect(spec.tileField).toBe("siegeOutpost");
    }
  }
});

test("WOODEN_FORT is present", () => {
  const spec = STRUCTURE_REGISTRY["WOODEN_FORT"];
  expect(spec).toBeDefined();
  expect(spec.kind).toBe("ECONOMIC");
  expect(spec.tileField).toBe("economicStructure");
});

// ── Cost parity: forts (against FORT_TIER_LADDER) ──────────────────

describe("fort cost parity against FORT_TIER_LADDER", () => {
  for (const [variant, tier] of Object.entries(FORT_TIER_LADDER)) {
    test(`${variant}: cost matches tier ladder`, () => {
      const spec = STRUCTURE_REGISTRY[variant];
      expect(spec).toBeDefined();
      expect(spec.cost.gold).toBe(tier.gold);
      expect(spec.cost.manpower).toBe(tier.manpower);
      expect(spec.cost.strategic).toEqual({ IRON: tier.iron });
    });
  }
});

// ── Cost parity: siege outposts (against SIEGE_TIER_LADDER) ────────

describe("siege outpost cost parity against SIEGE_TIER_LADDER", () => {
  for (const [variant, tier] of Object.entries(SIEGE_TIER_LADDER)) {
    test(`${variant}: cost matches tier ladder`, () => {
      const spec = STRUCTURE_REGISTRY[variant];
      expect(spec).toBeDefined();
      expect(spec.cost.gold).toBe(tier.gold);
      expect(spec.cost.manpower).toBe(tier.manpower);
      const expectedStrategic: Record<string, number> = { SUPPLY: tier.supply };
      if (tier.iron > 0) expectedStrategic.IRON = tier.iron;
      expect(spec.cost.strategic).toEqual(expectedStrategic);
    });
  }
});

// ── Cost parity: observatory ───────────────────────────────────────

test("OBSERVATORY cost matches existing constants", () => {
  const spec = STRUCTURE_REGISTRY["OBSERVATORY"];
  expect(spec.cost.gold).toBe(800);
  expect(spec.cost.manpower).toBe(0);
  expect(spec.cost.strategic).toEqual({ CRYSTAL: 45 });
});

// ── Cost parity: economic structures (against structureCostDefinition) ─

describe("economic structure cost parity against structureCostDefinition", () => {
  for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
    if (spec.kind !== "ECONOMIC") continue;

    test(`${type}: cost matches structureCostDefinition`, () => {
      const def = structureCostDefinition(type as any);
      // WOODEN_FORT and LIGHT_OUTPOST are in EconomicStructureType but have
      // their own STRUCTURE_COST_DEFINITIONS entries.
      expect(def, `${type} missing from STRUCTURE_COST_DEFINITIONS`).toBeDefined();
      if (!def) return;

      expect(spec.cost.gold).toBe(def.baseGoldCost);
      expect(spec.cost.manpower).toBe(def.manpowerCost ?? 0);

      if (def.resourceCost) {
        expect(spec.cost.strategic).toBeDefined();
        const key = def.resourceCost.resource as keyof NonNullable<StructureSpec["cost"]["strategic"]>;
        const amount = (spec.cost.strategic as Record<string, number>)[key];
        expect(amount, `${type} strategic ${key} amount`).toBe(def.resourceCost.amount);
      } else {
        expect(spec.cost.strategic ?? {}).toEqual({});
      }
    });
  }
});

// ── Build duration parity ─────────────────────────────────────────

describe("buildMs parity with structureBuildDurationMs", () => {
  const KNOWN_TYPES = new Set([
    "FORT", "OBSERVATORY", "SIEGE_OUTPOST",
    ...Object.keys(STRUCTURE_REGISTRY).filter((t) => {
      const s = STRUCTURE_REGISTRY[t];
      return s.kind === "ECONOMIC" || s === STRUCTURE_REGISTRY["LIGHT_OUTPOST"];
    }),
  ]);

  for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
    if (!KNOWN_TYPES.has(type)) continue;

    test(`${type}: buildMs matches`, () => {
      const expected = structureBuildDurationMs(type as any);
      expect(spec.buildMs).toBe(expected);
    });
  }
});

// ── Tech ID parity: cross-check against live source ────────────────

describe("techIds parity against live TECH_REQUIREMENTS_BY_STRUCTURE", () => {
  for (const [type] of Object.entries(STRUCTURE_REGISTRY)) {
    if (STRUCTURE_REGISTRY[type].kind !== "ECONOMIC") continue;

    test(`${type}: techIds match live source`, () => {
      const spec = STRUCTURE_REGISTRY[type];
      const liveTech = (LIVE_TECH_REQ as Record<string, string | undefined>)[type];

      if (liveTech) {
        expect(spec.techIds, `${type} should require ${liveTech}`).toContain(liveTech);
      } else {
        expect(spec.techIds, `${type} should have no tech requirement`).toEqual([]);
      }
    });
  }
});

describe("techIds parity with existing handlers (non-economic)", () => {
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
    expect(STRUCTURE_REGISTRY["SIEGE_OUTPOST"].techIds).toContain("leatherworking");
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

  test("WOODEN_FORT has no tech requirement", () => {
    expect(STRUCTURE_REGISTRY["WOODEN_FORT"].techIds).toEqual([]);
  });
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
      STRUCTURE_REGISTRY["ADVANCED_CRYSTAL_SYNTHESIZER"].prerequisiteStructureTypes,
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

// ── Upkeep parity (per-minute rates from structureUpkeepPerMinute) ─

describe("upkeep parity", () => {
  // Per-minute rates derived from structureUpkeepPerMinute in
  // player-update-economy.ts. Constants divided by 10 where the source
  // uses per-10-minute interval buckets.

  const expected: Record<string, Partial<Record<"GOLD" | "FOOD" | "CRYSTAL" | "IRON" | "SUPPLY", number>>> = {
    // Economic structures — per-minute from structureUpkeepPerMinute switch
    FARMSTEAD: { GOLD: 0.1 },
    CAMP: { GOLD: 0.12 },
    MINE: { GOLD: 0.12 },
    MARKET: { FOOD: 0.05 },
    GRANARY: { GOLD: 0.1 },
    BANK: { FOOD: 0.1 },
    WOODEN_FORT: { GOLD: 0.05 },
    LIGHT_OUTPOST: { GOLD: 0.05 },
    CARAVANARY: { FOOD: 0.075 },
    FUR_SYNTHESIZER: { GOLD: 6 },
    ADVANCED_FUR_SYNTHESIZER: { GOLD: 6 },
    IRONWORKS: { GOLD: 6 },
    ADVANCED_IRONWORKS: { GOLD: 6 },
    CRYSTAL_SYNTHESIZER: { GOLD: 8 },
    ADVANCED_CRYSTAL_SYNTHESIZER: { GOLD: 8 },
    FOUNDRY: { GOLD: 5 },
    CUSTOMS_HOUSE: { GOLD: 1.5 },
    GARRISON_HALL: { GOLD: 2.5 },
    GOVERNORS_OFFICE: { GOLD: 3 },
    RADAR_SYSTEM: { GOLD: 4.5 },
    AIRPORT: { CRYSTAL: 0.025 },

    // Non-economic structures — per-tile upkeep loop at L448-456
    FORT: { GOLD: 1, IRON: 0.025 },
    IRON_BASTION: { GOLD: 1, IRON: 0.025 },
    THUNDER_BASTION: { GOLD: 1, IRON: 0.025 },
    SIEGE_OUTPOST: { GOLD: 1, SUPPLY: 0.025 },
    SIEGE_TOWER: { GOLD: 1, SUPPLY: 0.025 },
    DREAD_TOWER: { GOLD: 1, SUPPLY: 0.025 },
    OBSERVATORY: { CRYSTAL: 0.025 },
  };

  const noUpkeepTypes = new Set([
    "WATERWORKS", "SEED_GRANARY", "CENSUS_HALL", "CLEARING_HOUSE",
    "AETHER_TOWER", "EXCHANGE_HOUSE", "RAIL_DEPOT",
    "IMPERIAL_EXCHANGE_PART", "WORLD_ENGINE_PART",
    "AEGIS_DOME_PART", "ASTRAL_DOCK_PART",
    "IMPERIAL_EXCHANGE", "WORLD_ENGINE", "AEGIS_DOME", "ASTRAL_DOCK",
  ]);

  for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
    const expectedUpkeep = expected[type];

    if (expectedUpkeep) {
      test(`${type}: upkeep matches structureUpkeepPerMinute`, () => {
        expect(spec.upkeep.length, `${type} should have upkeep entries`).toBe(1);
        const actual = spec.upkeep[0]!.perMinute;
        for (const [res, val] of Object.entries(expectedUpkeep)) {
          const key = res as keyof typeof actual;
          expect(actual[key], `${type} ${res} upkeep`).toBe(val);
        }
      });
    } else if (noUpkeepTypes.has(type)) {
      test(`${type}: has no upkeep`, () => {
        expect(spec.upkeep, `${type} should have empty upkeep`).toEqual([]);
      });
    } else {
      test(`${type}: covered by upkeep parity`, () => {
        expect.fail(
          `${type} is not in expected upkeep map or noUpkeepTypes — add it`,
        );
      });
    }
  }
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

  test("economic specs and LIGHT_OUTPOST include noDuplicateStructureType", () => {
    for (const [type, spec] of Object.entries(STRUCTURE_REGISTRY)) {
      // LIGHT_OUTPOST has kind=OUTPOST but tileField=economicStructure,
      // so it needs dedup just like economic structures.
      const isDedupTarget =
        spec.kind === "ECONOMIC" ||
        type === "LIGHT_OUTPOST";

      if (!isDedupTarget) continue;

      const hasDedup = spec.placement.some((p) => {
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
          tileField: spec.tileField,
          extra: { structureType: type },
        };
        const result = p(ctx);
        return result !== null;
      });
      expect(
        hasDedup,
        `${type} should have noDuplicateStructureType check`,
      ).toBe(true);
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
    const validFields = ["fort", "observatory", "siegeOutpost", "economicStructure"];
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
