import type { Meta, StoryObj } from "@storybook/html-vite";
import { ACESFilmicToneMapping, DirectionalLight, PCFSoftShadowMap } from "three";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";
import { attachSceneLabels } from "../../fixtures/scene-labels.js";
import {
  CONCEPT_NAMES, FOREST_CONCEPTS, FOREST_SPECIES, SPECIES_NAMES, createForestConcept, type ForestConcept, type ForestSpecies
} from "./umbrite-forest-models.js";

type Args = { revealed: boolean; rotation: number; zoom: number; overhead: boolean; species: ForestSpecies; forestContext: boolean };

const render = (args: Args, concepts: readonly ForestConcept[]): HTMLElement => {
  const comparison = concepts.length > 1;
  const spacing = args.forestContext ? 1.04 : 1.35;
  const stage = createStage({
    width: 1200, height: args.forestContext ? 760 : comparison ? 600 : 720,
    camera: "orthographic", orthoHalfHeight: (args.forestContext ? 1.85 : comparison ? 1.08 : 0.86) / args.zoom,
    bloom: true, cameraDistance: 6, cameraTilt: args.overhead ? 0.18 : 0.65, background: "#222c29"
  });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.1;
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = PCFSoftShadowMap;
  stage.scene.traverse((object) => {
    if (!(object instanceof DirectionalLight) || object.intensity < 1) return;
    object.color.set("#ffe5bf");
    object.intensity = 1.65;
    object.castShadow = true;
    object.shadow.mapSize.set(2048, 2048);
    const extent = args.forestContext ? 4 : comparison ? 3 : 1.1;
    object.shadow.camera.left = -extent;
    object.shadow.camera.right = extent;
    object.shadow.camera.top = extent;
    object.shadow.camera.bottom = -extent;
    object.shadow.camera.near = 0.1;
    object.shadow.camera.far = 35;
    object.shadow.normalBias = 0.002;
    object.shadow.bias = -0.00015;
    object.shadow.radius = 4;
    object.shadow.camera.updateProjectionMatrix();
  });
  const resourceFill = new DirectionalLight("#d9deff", 0.65);
  resourceFill.position.set(1, 4, 8);
  stage.scene.add(resourceFill);
  const models = concepts.map((concept, i) => {
    const model = createForestConcept(concept, args.revealed, args.species);
    model.group.position.x = (i - (concepts.length - 1) / 2) * spacing;
    model.group.rotation.y = args.rotation * Math.PI / 180;
    stage.scene.add(model.group);
    return model;
  });
  if (args.forestContext) {
    // A continuous same-species forest behind and beside the three revealed tiles.
    // Keep its front open so canopy does not obscure the proposed resources.
    for (let x = -2; x <= 2; x += 1) {
      for (let z = -1; z <= 0; z += 1) {
        if (z === 0 && Math.abs(x) <= 1) continue;
        const forest = createForestConcept("roots", false, args.species);
        forest.group.position.set(x * spacing, 0, z * spacing);
        stage.scene.add(forest.group);
        models.push(forest);
      }
    }
  }
  const cleanups: (() => void)[] = models.map((model) => model.dispose);
  const container = wrapWithCleanup(stage, cleanups);
  const labelsCleanup = attachSceneLabels(container, stage, concepts.map((concept, i) => ({
    text: CONCEPT_NAMES[concept].replace(" · ", "\n"), x: (i - (concepts.length - 1) / 2) * spacing, z: 0.69
  })));
  cleanups.push(labelsCleanup);
  const caption = document.createElement("div");
  caption.style.cssText = "padding:16px 20px;color:#dce5dd;font:14px/1.5 system-ui;background:#222c29";
  caption.textContent = args.revealed
    ? `${SPECIES_NAMES[args.species]} · Revealed umbrite. All trees on each tile use the same species, matching the game. Use Species to compare pine, spruce, broadleaf and tropical palm; Revealed to compare discovery.`
    : `${SPECIES_NAMES[args.species]} · Before discovery. No purple resource detail is exposed.`;
  container.append(caption);
  return container;
};

const meta: Meta<Args> = {
  title: "Sandbox/Umbrite Forest/Concepts",
  parameters: { sandbox: { owner: "BenjaminWaye", added: "2026-11-05" }, layout: "fullscreen", docs: { description: { component:
    "Three proposed forest-integrated umbrite scenes, available for all four eligible forest species. Dark GRASS supports umbrite, including tropical latitudes. Each forest tile uses one species; dark tundra and sand deposits are outside this forest exploration. Storybook-only 3D art exploration; live 3D and 2D rendering are unchanged. Mineralized wood is proposed fiction, not an accepted canon change."
  } } },
  args: { revealed: true, rotation: -20, zoom: 1, overhead: false, species: "pine", forestContext: false },
  argTypes: {
    forestContext: { control: "boolean" },
    species: { options: FOREST_SPECIES, control: { type: "select", labels: SPECIES_NAMES } },
    revealed: { control: "boolean" }, overhead: { control: "boolean" },
    rotation: { control: { type: "range", min: -180, max: 180, step: 5 } },
    zoom: { control: { type: "range", min: 0.5, max: 1.6, step: 0.1 } }
  },
  render: (args) => render(args, FOREST_CONCEPTS)
};
export default meta;
type Story = StoryObj<Args>;
export const ThreeVariations: Story = {};
export const RootBearingElder: Story = { render: (args) => render(args, ["roots"]) };
export const UmbriteRootbed: Story = { name: "Umbrite Rootbed", render: (args) => render(args, ["rootbed"]) };
export const FallenUmberwood: Story = { render: (args) => render(args, ["fallen"]) };
export const BeforeDiscovery: Story = { args: { revealed: false } };
// Approximate screen-space checks, not the live game's camera/LOD pipeline.
export const MapScale: Story = { args: { zoom: 0.85, overhead: true, forestContext: true, rotation: 0 } };
export const DistantMapScale: Story = { args: { zoom: 0.5, overhead: true, forestContext: true, rotation: 0 } };

// Separate species stories keep the three concepts directly comparable in each habitat.
export const PineForest: Story = { args: { species: "pine", forestContext: true, rotation: 0 } };
export const SpruceForest: Story = { args: { species: "spruce", forestContext: true, rotation: 0 } };
export const BroadleafForest: Story = { args: { species: "broadleaf", forestContext: true, rotation: 0 } };
export const TropicalPalmForest: Story = { args: { species: "palm", forestContext: true, rotation: 0 } };

export const ForestWithThreeVariations: Story = { args: { forestContext: true, rotation: 0 } };

export const ElderDetail: Story = { args: { zoom: 1.4, rotation: -35 }, render: (args) => render(args, ["roots"]) };

export const AlternativesDetail: Story = {
  args: { zoom: 1.25, rotation: -15 },
  render: (args) => render(args, ["rootbed", "fallen"])
};
