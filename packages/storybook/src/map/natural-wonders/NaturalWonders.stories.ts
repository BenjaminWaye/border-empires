import type { Meta, StoryObj } from "@storybook/html-vite";
import { ACESFilmicToneMapping } from "three";
import { NATURAL_WONDER_LABELS, type NaturalWonderType } from "@border-empires/shared";
import { createNaturalWonderOverlays } from "@client/client-map-3d-natural-wonders/client-map-3d-natural-wonder-overlays.js";
import { attachSceneLabels } from "../../fixtures/scene-labels.js";
import { startUpdateLoop } from "../../fixtures/stage-lighting.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

type Args = {
  wonder: NaturalWonderType | "ALL";
  cameraDistance: number;
  grass: boolean;
};

const WONDERS = Object.keys(NATURAL_WONDER_LABELS) as NaturalWonderType[];
const COLUMNS = 3;
const SPACING = 2.4;

// The map samples real terrain height at each corner for the wonder's ground
// glow; a flat stage has none.
const FLAT_TERRAIN = (): number => 0;

const render = (args: Args): HTMLElement => {
  const shown = args.wonder === "ALL" ? WONDERS : [args.wonder];
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, background: "#11141c" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  const cleanups: Array<() => void> = [];
  const rows = Math.ceil(shown.length / COLUMNS);
  const placed = shown.map((type, i) => ({
    type,
    x: shown.length === 1 ? 0 : ((i % COLUMNS) - (COLUMNS - 1) / 2) * SPACING,
    z: shown.length === 1 ? 0 : (Math.floor(i / COLUMNS) - (rows - 1) / 2) * SPACING
  }));
  if (args.grass) {
    const ground = createGrassGround(shown.length === 1 ? 2 : 5);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  }
  const overlays = createNaturalWonderOverlays(stage.scene, FLAT_TERRAIN);
  overlays.clear();
  placed.forEach((p, i) => overlays.addInstance(p.type, p.x, p.z, 0, i * 11, i * 5));
  overlays.commit();
  cleanups.push(overlays.dispose, startUpdateLoop([overlays]));
  const container = wrapWithCleanup(stage, cleanups);
  if (shown.length > 1) {
    cleanups.push(attachSceneLabels(container, stage, placed.map((p) => ({ text: NATURAL_WONDER_LABELS[p.type].name, x: p.x, z: p.z + 0.9 }))));
  }
  return container;
};

const meta: Meta<Args> = {
  title: "Map/Natural Wonders",
  parameters: {
    docs: {
      description: {
        component:
          "The natural wonders as the 3D map draws them: the real `createNaturalWonderOverlays` output, one of each wonder type."
      }
    }
  },
  argTypes: {
    wonder: {
      control: { type: "select", labels: { ALL: "All wonders", ...Object.fromEntries(WONDERS.map((w) => [w, NATURAL_WONDER_LABELS[w].name])) } },
      options: ["ALL", ...WONDERS]
    },
    cameraDistance: { control: { type: "range", min: 2, max: 20, step: 0.5 } },
    grass: { control: "boolean" }
  },
  args: { wonder: "ALL", cameraDistance: 11, grass: true },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const AllWonders: Story = {};
export const FoundryHeart: Story = { args: { wonder: "FOUNDRY_HEART", cameraDistance: 4 } };
export const DeepwaterEngine: Story = { args: { wonder: "DEEPWATER_ENGINE", cameraDistance: 4 } };
export const ConscriptionEngine: Story = { args: { wonder: "CONSCRIPTION_ENGINE", cameraDistance: 4 } };
export const Warpress: Story = { args: { wonder: "WARPRESS", cameraDistance: 4 } };
export const BastionFrame: Story = { args: { wonder: "BASTION_FRAME", cameraDistance: 4 } };
export const CalculatingEngine: Story = { args: { wonder: "CALCULATING_ENGINE", cameraDistance: 4 } };
export const Quickforge: Story = { args: { wonder: "QUICKFORGE", cameraDistance: 4 } };
export const WatchtowerEngine: Story = { args: { wonder: "WATCHTOWER_ENGINE", cameraDistance: 4 } };
export const CartographersLens: Story = { args: { wonder: "CARTOGRAPHERS_LENS", cameraDistance: 4 } };
