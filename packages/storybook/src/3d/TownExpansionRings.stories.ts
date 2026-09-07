import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createStructureOverlay, type StructureKind } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// DESIGN CONCEPT STORY — not shipped gameplay. Illustrates a proposal:
// each town-tier upgrade grants a new ring of buildable tiles around the
// town (Chebyshev distance from center), rather than an automatic flat
// gold/manpower-cap and regen bonus. Tier upgrades still grant a small
// baseline regen/cap bump (not shown here), but the *large* bonuses come
// from what the player chooses to build in the new ring.
//
// Ring 1 (radius 1, 8 tiles) unlocks at TOWN.
// Ring 2 (radius 2, +16 tiles) unlocks at CITY.
// Ring 3 (radius 3, +24 tiles) unlocks at GREAT_CITY.
// Ring 4 (radius 4, +32 tiles) unlocks at METROPOLIS.
// SETTLEMENT has no ring yet — just the town center tile.

type RingTier = Exclude<TownTier, "SETTLEMENT"> | "SETTLEMENT";

const TIER_RADIUS: Record<RingTier, number> = {
  SETTLEMENT: 0,
  TOWN: 1,
  CITY: 2,
  GREAT_CITY: 3,
  METROPOLIS: 4
};

const TIER_ORDER: RingTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

// Illustrative building mix per newly-unlocked ring — a sample of what a
// player *could* choose to fill the new tiles with, not a prescribed
// layout. Mixes economy (MINE/GRANARY), manpower-regen (LOGISTICS_GUILD,
// QUARTERMASTERS_OFFICE), and civic (CENSUS_HALL, CLEARING_HOUSE)
// structures to show the tradeoff space the ring creates.
const RING_BUILDINGS: Record<Exclude<RingTier, "SETTLEMENT">, StructureKind[]> = {
  TOWN: ["GRANARY", "MINE", "CENSUS_HALL", "FARMSTEAD", "QUARTERMASTERS_OFFICE", "OBSERVATORY", "WATERWORKS", "CLEARING_HOUSE"],
  CITY: [
    "GRANARY", "MINE", "FARMSTEAD", "LOGISTICS_GUILD", "CUSTOMS_HOUSE", "GARRISON_HALL",
    "TITANIUM_WORKS", "OBSERVATORY", "CENSUS_HALL", "CLEARING_HOUSE", "GOVERNORS_OFFICE",
    "MINTWORKS", "WATERWORKS", "RAIL_DEPOT", "UMBRITE_SYNTHESIZER", "CRYSTAL_SYNTHESIZER"
  ],
  GREAT_CITY: [
    "FOUNDRY", "ADVANCED_TITANIUM_WORKS", "ASSEMBLY_WORKS", "AIRPORT", "RADAR_SYSTEM",
    "ADVANCED_UMBRITE_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER", "GARRISON_HALL",
    "LOGISTICS_GUILD", "MINE", "GRANARY", "FARMSTEAD", "CUSTOMS_HOUSE", "CENSUS_HALL",
    "MINTWORKS", "WATERWORKS", "TITANIUM_WORKS", "GOVERNORS_OFFICE", "RAIL_DEPOT",
    "OBSERVATORY", "CLEARING_HOUSE", "QUARTERMASTERS_OFFICE", "UMBRITE_SYNTHESIZER", "CRYSTAL_SYNTHESIZER"
  ],
  METROPOLIS: [
    "AETHER_TOWER", "POPULATION_BUREAU", "TITANIUM_LEVY", "TITANIUM_WEAPONS_FACTORY", "WEAPONS_WORKSHOP",
    "FOUNDRY", "ADVANCED_TITANIUM_WORKS", "ASSEMBLY_WORKS", "AIRPORT", "RADAR_SYSTEM",
    "ADVANCED_UMBRITE_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER", "GARRISON_HALL", "LOGISTICS_GUILD",
    "MINE", "GRANARY", "FARMSTEAD", "CUSTOMS_HOUSE", "CENSUS_HALL", "MINTWORKS", "ASTRAL_DOCK",
    "TITANIUM_WORKS", "GOVERNORS_OFFICE", "RAIL_DEPOT", "OBSERVATORY", "CLEARING_HOUSE",
    "QUARTERMASTERS_OFFICE", "UMBRITE_SYNTHESIZER", "CRYSTAL_SYNTHESIZER", "SEED_GRANARY", "WATERWORKS"
  ]
};

type RingCell = { readonly gx: number; readonly gz: number };

// All cells at exactly Chebyshev distance `radius` from origin (a hollow
// square ring), in a stable clockwise order so building assignment reads
// naturally left-to-right, front-to-back.
const ringCells = (radius: number): RingCell[] => {
  if (radius === 0) return [{ gx: 0, gz: 0 }];
  const cells: RingCell[] = [];
  for (let gx = -radius; gx <= radius; gx += 1) {
    for (let gz = -radius; gz <= radius; gz += 1) {
      if (Math.max(Math.abs(gx), Math.abs(gz)) === radius) cells.push({ gx, gz });
    }
  }
  return cells;
};

type Args = {
  tier: RingTier;
  cameraDistance: number;
  spacing: number;
  showLabels: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    background: "#1e2538",
    camera: "orthographic",
    orthoHalfHeight: Math.max(2, TIER_RADIUS[args.tier] + 1.5)
  });

  const radius = TIER_RADIUS[args.tier];
  const spacing = args.spacing;

  const townOverlay = createTownOverlay(stage.scene, 1);
  townOverlay.addInstance(0, 0, 0, args.tier === "SETTLEMENT" ? "SETTLEMENT" : args.tier);
  townOverlay.commit();

  const allRingCells: RingCell[] = [];
  for (let r = 1; r <= radius; r += 1) allRingCells.push(...ringCells(r));
  const maxStructures = Math.max(1, allRingCells.length);

  const contactShadows = createContactShadowOverlay(stage.scene, maxStructures);
  const structureOverlay = createStructureOverlay(stage.scene, maxStructures, contactShadows);

  const tierIndex = TIER_ORDER.indexOf(args.tier);
  for (let step = 1; step <= tierIndex; step += 1) {
    const stepTier = TIER_ORDER[step] as Exclude<RingTier, "SETTLEMENT">;
    const cells = ringCells(step);
    const buildings = RING_BUILDINGS[stepTier];
    cells.forEach((cell, idx) => {
      const kind = buildings[idx % buildings.length];
      structureOverlay.addInstance(cell.gx * spacing, 0, cell.gz * spacing, kind);
    });
  }
  structureOverlay.commit();
  contactShadows.commit();

  const ground = createGrassGround(radius + 1, 0);
  stage.scene.add(ground.group);

  const container = wrapWithCleanup(stage, [
    townOverlay.dispose,
    structureOverlay.dispose,
    contactShadows.dispose,
    ground.dispose
  ]);

  if (args.showLabels) {
    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.top = "8px";
    label.style.left = "8px";
    label.style.color = "#fff";
    label.style.font = "600 13px system-ui, sans-serif";
    label.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
    label.textContent =
      radius === 0
        ? "SETTLEMENT — town tile only, no building ring yet"
        : `${args.tier} — ring radius ${radius} (${allRingCells.length} building tiles unlocked)`;
    container.appendChild(label);
  }

  return container;
};

const meta: Meta<Args> = {
  title: "Design Concepts/Town Expansion Rings",
  parameters: {
    docs: {
      description: {
        component: [
          "PROPOSAL, not shipped behavior: each town-tier upgrade grants a new ring of buildable tiles",
          "around the town (radius 1 at TOWN, 2 at CITY, 3 at GREAT_CITY, 4 at METROPOLIS), instead of an",
          "automatic flat gold/manpower-cap and regen bump. A small baseline regen/cap bump still comes",
          "from the tier upgrade itself (not visualized here) so a player is never fully gated behind a",
          "specific building — but the *large* bonuses (cap, regen, production) come from what the player",
          "chooses to build in the new ring. This keeps growth visually legible on the map and turns each",
          "expansion into a real placement decision instead of a number ticking up.",
          "",
          "Use the Tier control to step through SETTLEMENT -> TOWN -> CITY -> GREAT_CITY -> METROPOLIS and",
          "watch both the town center model and the surrounding ring grow. Building choices per ring are",
          "illustrative samples, not a prescribed layout."
        ].join("\n")
      }
    }
  },
  argTypes: {
    tier: { control: { type: "select" }, options: TIER_ORDER },
    cameraDistance: { control: { type: "range", min: 4, max: 30, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.9, max: 1.4, step: 0.05 } },
    showLabels: { control: "boolean" }
  },
  args: { tier: "METROPOLIS", cameraDistance: 16, spacing: 1.1, showLabels: true },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Metropolis: Story = {};
export const Settlement: Story = { args: { tier: "SETTLEMENT", cameraDistance: 6 } };
export const Town: Story = { args: { tier: "TOWN", cameraDistance: 8 } };
export const City: Story = { args: { tier: "CITY", cameraDistance: 11 } };
export const GreatCity: Story = { args: { tier: "GREAT_CITY", cameraDistance: 14 } };

// Side-by-side progression: five independent stages placed left to right so
// the growth from a bare settlement to a metropolis-with-four-rings reads
// at a glance, matching how Town.stories.ts's Progression story works for
// the town center alone.
export const Progression: Story = {
  args: { cameraDistance: 40, spacing: 1.05, showLabels: false },
  render: (args) => {
    const stage = createStage({
      cameraDistance: args.cameraDistance,
      background: "#1e2538",
      camera: "orthographic",
      orthoHalfHeight: 5.5
    });

    const gap = 11; // world-space distance between each tier's town center
    const disposers: Array<() => void> = [];

    TIER_ORDER.forEach((tier, tierPos) => {
      const originX = (tierPos - (TIER_ORDER.length - 1) / 2) * gap;
      const radius = TIER_RADIUS[tier];

      const townOverlay = createTownOverlay(stage.scene, 1);
      townOverlay.addInstance(originX, 0, 0, tier === "SETTLEMENT" ? "SETTLEMENT" : tier);
      townOverlay.commit();
      disposers.push(townOverlay.dispose);

      const allCells: RingCell[] = [];
      for (let r = 1; r <= radius; r += 1) allCells.push(...ringCells(r));
      const maxStructures = Math.max(1, allCells.length);
      const contactShadows = createContactShadowOverlay(stage.scene, maxStructures);
      const structureOverlay = createStructureOverlay(stage.scene, maxStructures, contactShadows);

      const tierIndex = TIER_ORDER.indexOf(tier);
      for (let step = 1; step <= tierIndex; step += 1) {
        const stepTier = TIER_ORDER[step] as Exclude<RingTier, "SETTLEMENT">;
        const cells = ringCells(step);
        const buildings = RING_BUILDINGS[stepTier];
        cells.forEach((cell, idx) => {
          const kind = buildings[idx % buildings.length];
          structureOverlay.addInstance(originX + cell.gx * args.spacing, 0, cell.gz * args.spacing, kind);
        });
      }
      structureOverlay.commit();
      contactShadows.commit();
      disposers.push(structureOverlay.dispose, contactShadows.dispose);

      const ground = createGrassGround(radius + 1, 0);
      ground.group.position.x = originX;
      stage.scene.add(ground.group);
      disposers.push(ground.dispose);
    });

    return wrapWithCleanup(stage, disposers);
  }
};
