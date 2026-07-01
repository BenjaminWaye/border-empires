import type { Meta, StoryObj } from "@storybook/html-vite";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type TerrainPattern = "all-grass" | "all-sand" | "checker" | "coastline" | "mountain-ridge" | "mixed";

type Args = {
  pattern: TerrainPattern;
  showGridlines: boolean;
  withFog: boolean;
  cameraDistance: number;
};

const tileKindForPattern = (pattern: TerrainPattern) => (wx: number, wy: number): HeightfieldTerrainKind => {
  switch (pattern) {
    case "all-grass": return "GRASS";
    case "all-sand": return "SAND";
    case "checker": return (wx + wy) % 2 === 0 ? "GRASS" : "SAND";
    case "coastline": {
      if (wy < -3) return "SEA";
      if (wy < -1) return "COASTAL_SEA";
      if (wy < 0) return "SAND";
      return "GRASS";
    }
    case "mountain-ridge": {
      if (Math.abs(wx) <= 1) return "MOUNTAIN";
      if (Math.abs(wx) <= 3) return "GRASS";
      return "SAND";
    }
    case "mixed": {
      const r = Math.hypot(wx, wy);
      if (r < 1.5) return "MOUNTAIN";
      if (r < 4) return "GRASS";
      if (r < 6) return "SAND";
      if (r < 8) return "COASTAL_SEA";
      return "SEA";
    }
  }
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: args.withFog ? "#0e1218" : "#1a2030" });
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);

  hf.rebuild({
    camX: 0,
    camY: 0,
    halfW: 12,
    halfH: 12,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt: tileKindForPattern(args.pattern)
  });

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.gridlines); },
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/Heightfield",
  parameters: {
    docs: { description: { component: "Base terrain mesh. Elevations: deep sea -0.36, coastal sea -0.16, sand 0.07, grass 0.18, mountain 1.15." } }
  },
  argTypes: {
    pattern: { control: "inline-radio", options: ["all-grass", "all-sand", "checker", "coastline", "mountain-ridge", "mixed"] },
    showGridlines: { control: "boolean" },
    withFog: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 10, max: 60, step: 2 } }
  },
  args: { pattern: "mixed", showGridlines: false, withFog: false, cameraDistance: 24 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Mixed: Story = {};
export const Coastline: Story = { args: { pattern: "coastline" } };
export const MountainRidge: Story = { args: { pattern: "mountain-ridge" } };
export const Checker: Story = { args: { pattern: "checker", showGridlines: true } };
export const AllGrass: Story = { args: { pattern: "all-grass" } };
export const AllSand: Story = { args: { pattern: "all-sand" } };
