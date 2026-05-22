import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  scenario: "single-player" | "two-players" | "frontier-skirmish";
  cameraDistance: number;
};

const PLAYER_A = new Color("#4a8cff");
const PLAYER_B = new Color("#ff6a4a");
const PLAYER_C = new Color("#5ac06b");

type TileSpec = { readonly cx: number; readonly cz: number; readonly color: Color; readonly frontier: boolean };

const tilesForScenario = (scenario: Args["scenario"]): TileSpec[] => {
  const tiles: TileSpec[] = [];
  if (scenario === "single-player") {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        tiles.push({ cx: dx, cz: dz, color: PLAYER_A, frontier: r === 2 });
      }
    }
    return tiles;
  }
  if (scenario === "two-players") {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const color = dx < 0 ? PLAYER_A : PLAYER_B;
        const frontier = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dx === 0;
        tiles.push({ cx: dx, cz: dz, color, frontier });
      }
    }
    return tiles;
  }
  for (let dz = -2; dz <= 2; dz += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const color = dx < -1 ? PLAYER_A : dx > 1 ? PLAYER_B : PLAYER_C;
      tiles.push({ cx: dx, cz: dz, color, frontier: true });
    }
  }
  return tiles;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2030" });
  const tiles = tilesForScenario(args.scenario);
  const overlay = createOwnershipOverlay(stage.scene, tiles.length);
  for (const t of tiles) {
    const x0 = t.cx - 0.5;
    const x1 = t.cx + 0.5;
    const z0 = t.cz - 0.5;
    const z1 = t.cz + 0.5;
    const y = 0.001;
    overlay.addTile(
      x0, y, z0,
      x1, y, z0,
      x0, y, z1,
      x1, y, z1,
      t.color,
      t.frontier
    );
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/OwnershipOverlay",
  parameters: {
    docs: { description: { component: "Tinted tile fills for territory. SETTLED tiles use opacity 0.85; frontier uses FRONTIER_OPACITY (0.32)." } }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["single-player", "two-players", "frontier-skirmish"] },
    cameraDistance: { control: { type: "range", min: 5, max: 24, step: 1 } }
  },
  args: { scenario: "two-players", cameraDistance: 10 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const TwoPlayers: Story = {};
export const SinglePlayer: Story = { args: { scenario: "single-player" } };
export const FrontierSkirmish: Story = { args: { scenario: "frontier-skirmish" } };
