import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createStructureOverlay, type StructureKind } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { heightfieldTileColor } from "@client/client-map-3d-heightfield-terrain.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// DESIGN CONCEPT STORY — not shipped gameplay. Illustrates a proposal:
// each town-tier upgrade grants a new ring of buildable tiles around the
// town (Chebyshev distance from center — a square ring, since the game's
// tile grid is square, not hex), rather than an automatic flat
// gold/manpower-cap and regen bonus. Tier upgrades still grant a small
// baseline regen/cap bump (not shown here), but the *large* bonuses come
// from what the player chooses to build in the new ring.
//
// Ring 1 (radius 1, 8 tiles) unlocks at TOWN.
// Ring 2 (radius 2, +16 tiles) unlocks at CITY.
// Ring 3 (radius 3, +24 tiles) unlocks at GREAT_CITY.
// Ring 4 (radius 4, +32 tiles) unlocks at METROPOLIS.
// SETTLEMENT has no ring yet — just the town center tile.
//
// Every ring tile shows the same building (MINTWORKS, a gold-themed
// structure — a stand-in "mint house") purely so the ring shape itself is
// legible; which buildings actually go where is a separate, unresolved
// design question.
//
// Ground tint uses heightfieldTileColor("GRASS", variant) — the same RGB
// values the shipped 3D map renderer (client-map-3d-heightfield-terrain.ts)
// paints its real grass tiles with — instead of an arbitrary placeholder
// green, so the ring reads against a color that matches the real map.
// It's still a flat plane, not the actual heightfield mesh/texture
// pipeline (that requires real per-tile world data and the full map
// orchestrator, out of scope for this concept mockup).

type RingTier = Exclude<TownTier, "SETTLEMENT"> | "SETTLEMENT";

const TIER_RADIUS: Record<RingTier, number> = {
  SETTLEMENT: 0,
  TOWN: 1,
  CITY: 2,
  GREAT_CITY: 3,
  METROPOLIS: 4
};

const TIER_ORDER: RingTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

// Single repeated "mint house" per the user's request — every ring tile is
// the same building so the ring shape is what reads, not a building mix.
const RING_BUILDING: StructureKind = "MINTWORKS";

type RingCell = { readonly gx: number; readonly gz: number };

// All cells at exactly Chebyshev distance `radius` from origin (a hollow
// square ring).
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

// heightfieldTileColor returns values already in the 0-255 range (see
// legacy3DTerrainPalette in client-map-3d-terrain-textures.ts), not 0-1 —
// no further scaling here.
const rgbToCss = ([r, g, b]: [number, number, number]): string =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

const GRASS_LIGHT_CSS = rgbToCss(heightfieldTileColor("GRASS", 1));
const GRASS_DEEP_CSS = rgbToCss(heightfieldTileColor("GRASS", 0));
const GRASS_TILE_GAP = 0.04;

// Real-map-colored ground: same tile-checkerboard shape as
// three-stage.ts's createGrassGround, but tinted with the shipped
// renderer's actual GRASS heightfield colors instead of a made-up green.
const createRealMapGround = (radius: number): { group: Group; dispose: () => void } => {
  const group = new Group();
  const geometry = new PlaneGeometry(1 - GRASS_TILE_GAP, 1 - GRASS_TILE_GAP);
  const lightMat = new MeshStandardMaterial({ color: GRASS_LIGHT_CSS, roughness: 0.95, metalness: 0 });
  const deepMat = new MeshStandardMaterial({ color: GRASS_DEEP_CSS, roughness: 0.95, metalness: 0 });
  for (let gz = -radius; gz <= radius; gz += 1) {
    for (let gx = -radius; gx <= radius; gx += 1) {
      const tile = new Mesh(geometry, (gx + gz) % 2 === 0 ? lightMat : deepMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(gx, -0.01, gz);
      group.add(tile);
    }
  }
  const dispose = (): void => { geometry.dispose(); lightMat.dispose(); deepMat.dispose(); };
  return { group, dispose };
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

  // Every ring from 1 up to the current tier's radius is filled — the
  // town's whole footprint is built up with the ring building, not just
  // the newest outer ring, so there are no empty gap tiles between the
  // town and the outer edge.
  const filledCells: RingCell[] = [];
  for (let r = 1; r <= radius; r += 1) filledCells.push(...ringCells(r));
  const maxStructures = Math.max(1, filledCells.length);

  const contactShadows = createContactShadowOverlay(stage.scene, maxStructures);
  const structureOverlay = createStructureOverlay(stage.scene, maxStructures, contactShadows);

  // addInstance's signature is (sceneX, sceneZ, surfaceY, kind) — sceneZ
  // and surfaceY (height) are NOT interchangeable, unlike the per-family
  // layout callbacks (sceneX, surfaceY, sceneZ) used internally. Passing
  // the ring's z-offset as "surfaceY" here previously collapsed every
  // building onto z=0, which is why an earlier version of this story only
  // showed buildings in one row instead of the actual ring.
  filledCells.forEach((cell) => {
    structureOverlay.addInstance(cell.gx * spacing, cell.gz * spacing, 0, RING_BUILDING);
  });
  structureOverlay.commit();
  contactShadows.commit();

  const ground = createRealMapGround(radius + 1);
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
        : `${args.tier} — radius ${radius} (${filledCells.length} building tiles filled)`;
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
          "chooses to build in the new ring.",
          "",
          "Every ring tile currently shows the same building (Mintworks, stand-in 'mint house') so the ring",
          "shape itself is what reads clearly here — actual per-building placement/eligibility is a separate,",
          "unresolved design question. Ground tint is pulled from the shipped 3D renderer's real GRASS",
          "heightfield colors (client-map-3d-heightfield-terrain.ts), not a placeholder green — though it's",
          "still a flat plane, not the full heightfield mesh.",
          "",
          "Use the Tier control to step through SETTLEMENT -> TOWN -> CITY -> GREAT_CITY -> METROPOLIS."
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
