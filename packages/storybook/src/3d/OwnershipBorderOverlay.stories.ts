import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createOwnershipBorderOverlay, addOwnershipBorderEdgesForTile } from "@client/client-map-3d-ownership-border-overlay.js";
import type { Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

/**
 * The new crisp border ribbon prototype (client-map-3d-ownership-border-
 * overlay.ts) rendered on top of the existing flat ownership fill
 * (client-map-3d-ownership-overlay.ts), so it's directly comparable to
 * OwnershipOverlay.stories.ts's fill-only rendering of the same three
 * scenarios. Uses real Tile objects and the real addOwnershipBorderEdgesForTile
 * helper (which internally reuses exposedBorderSides from
 * client-tile-borders.ts, the same "exposed edge" logic the 2D canvas map
 * already draws its border with) rather than approximating the edge
 * geometry here, so what's on screen is exactly what client-map-3d.ts
 * will produce, not just a lookalike.
 */

type Args = {
  scenario: "single-player" | "two-players" | "frontier-skirmish";
  showBorder: boolean;
  cameraDistance: number;
};

const PLAYER_A = { id: "player-a", color: new Color("#4a8cff") };
const PLAYER_B = { id: "player-b", color: new Color("#ff6a4a") };
const PLAYER_C = { id: "player-c", color: new Color("#5ac06b") };

const GRID = 16;
const ORIGIN = Math.floor(GRID / 2);
const keyFor = (x: number, y: number): string => `${x},${y}`;
const identity = (v: number): number => v;

const makeTile = (x: number, y: number, ownerId: string, frontier: boolean): Tile =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: frontier ? "FRONTIER" : "SETTLED" }) as unknown as Tile;

type Owner = { readonly id: string; readonly color: Color };

const worldForScenario = (scenario: Args["scenario"]): { tiles: Map<string, Tile>; colorFor: Map<string, Color> } => {
  const tiles = new Map<string, Tile>();
  const colorFor = new Map<string, Color>();
  const place = (dx: number, dz: number, owner: Owner, frontier: boolean): void => {
    const x = ORIGIN + dx;
    const y = ORIGIN + dz;
    tiles.set(keyFor(x, y), makeTile(x, y, owner.id, frontier));
    colorFor.set(owner.id, owner.color);
  };

  if (scenario === "single-player") {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        place(dx, dz, PLAYER_A, r === 2);
      }
    }
    return { tiles, colorFor };
  }
  if (scenario === "two-players") {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const owner = dx < 0 ? PLAYER_A : PLAYER_B;
        const frontier = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dx === 0;
        place(dx, dz, owner, frontier);
      }
    }
    return { tiles, colorFor };
  }
  for (let dz = -2; dz <= 2; dz += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const owner = dx < -1 ? PLAYER_A : dx > 1 ? PLAYER_B : PLAYER_C;
      place(dx, dz, owner, true);
    }
  }
  return { tiles, colorFor };
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2030" });
  const { tiles, colorFor } = worldForScenario(args.scenario);
  const fill = createOwnershipOverlay(stage.scene, tiles.size);
  const border = createOwnershipBorderOverlay(stage.scene, tiles.size * 4);
  const deps = { tiles, keyFor, wrapX: identity, wrapY: identity };

  for (const tile of tiles.values()) {
    if (!tile.ownerId) continue;
    const color = colorFor.get(tile.ownerId)!;
    const x0 = tile.x - ORIGIN - 0.5;
    const x1 = tile.x - ORIGIN + 0.5;
    const z0 = tile.y - ORIGIN - 0.5;
    const z1 = tile.y - ORIGIN + 0.5;
    fill.addTile(x0, 0.001, z0, x1, 0.001, z0, x0, 0.001, z1, x1, 0.001, z1, color, tile.ownershipState === "FRONTIER");
    if (args.showBorder) addOwnershipBorderEdgesForTile(border, tile, deps, x0, x1, z0, z1, 0.001, 0.001, 0.001, 0.001, color);
  }
  fill.commit();
  border.commit();

  return wrapWithCleanup(stage, [fill.dispose, border.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/OwnershipBorderOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Prototype: the fill overlay from OwnershipOverlay.stories.ts with the new crisp border-ribbon overlay layered on top, along each owned tile's exposed edges. Toggle `showBorder` off to see the exact same scenario with fill only -- the current live-game look -- for an apples-to-apples before/after."
      }
    }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["single-player", "two-players", "frontier-skirmish"] },
    showBorder: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 5, max: 24, step: 1 } }
  },
  args: { scenario: "two-players", showBorder: true, cameraDistance: 10 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const TwoPlayersWithBorder: Story = {};
export const TwoPlayersFillOnlyBefore: Story = { args: { showBorder: false } };
export const SinglePlayerWithBorder: Story = { args: { scenario: "single-player" } };
export const FrontierSkirmishWithBorder: Story = { args: { scenario: "frontier-skirmish" } };
