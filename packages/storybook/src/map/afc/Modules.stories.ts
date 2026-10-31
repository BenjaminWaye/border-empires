import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { attachSceneLabels } from "../../fixtures/scene-labels.js";
import { createContactShadow, glintStage, startUpdateLoop, studioStage } from "../../fixtures/stage-lighting.js";
import { createGrassGround, wrapWithCleanup, type Stage } from "../../fixtures/three-stage.js";
import { AFC_MODULE_MODELS, afcModuleById, isAfcModuleInGame, type AfcModuleModel } from "./afc-modules.js";

type Args = {
  module: string;
  cameraDistance: number;
};

// The default camera looks down +Z while every module's working face points
// along +X, so solo shots turn the content -90° (plus the model's own facing
// in gameplay shots) to swing that face into view.
const buildSingleModule = (stage: Stage, model: AfcModuleModel, opts: { yaw: number; grass: boolean }): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  if (opts.grass) {
    const ground = createGrassGround(1, 1);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  } else {
    const shadow = createContactShadow(model.shadowRadius);
    stage.scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const inner = new Scene();
  const overlay = model.create(inner, 1);
  overlay.addInstance(0, 0, 0, 0, model.seedTile[0], model.seedTile[1]);
  overlay.commit();
  const content = new Group();
  content.add(inner);
  content.rotation.y = opts.yaw;
  stage.scene.add(content);
  cleanups.push(overlay.dispose, startUpdateLoop([overlay]));
  return cleanups;
};

const caption = (model: AfcModuleModel): HTMLElement => {
  const el = document.createElement("div");
  el.style.cssText = "padding:8px 14px;font:13px/1.45 system-ui,sans-serif;color:#d8dee9;background:#121722;";
  const status = isAfcModuleInGame(model)
    ? "Docks in game."
    : "Not wired into the game yet: this tech docks the generic cartridge (see client-map-3d-afc-module-family.ts).";
  el.textContent = `${model.name} · unlocked by the "${model.techId}" tech. ${status}`;
  return el;
};

const withCaption = (model: AfcModuleModel, scene: HTMLElement): HTMLElement => {
  const root = document.createElement("div");
  root.append(caption(model), scene);
  return root;
};

const hero = (background: string) => (args: Args): HTMLElement => {
  const model = afcModuleById(args.module);
  const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background });
  return withCaption(model, wrapWithCleanup(stage, buildSingleModule(stage, model, { yaw: -Math.PI / 2, grass: false })));
};

const MODULE_LABELS = Object.fromEntries(AFC_MODULE_MODELS.map((m) => [m.id, isAfcModuleInGame(m) ? m.name : `${m.name} (not in game)`]));

const meta: Meta<Args> = {
  title: "Map/AFC/Modules",
  parameters: {
    docs: {
      description: {
        component: [
          "Every bespoke AFC module model, rendered by its client overlay. Pick one with the `module` control.",
          "Models marked *not in game* exist and are tested, but their tech is missing from",
          "`MODULE_FAMILY_FACTORIES` in `client-map-3d-afc-module-family.ts`, so in game that tech docks the generic cartridge."
        ].join(" ")
      }
    }
  },
  argTypes: {
    module: { control: { type: "select", labels: MODULE_LABELS }, options: AFC_MODULE_MODELS.map((m) => m.id) },
    cameraDistance: { control: { type: "range", min: 1, max: 14, step: 0.25 } }
  },
  args: { module: AFC_MODULE_MODELS[0]!.id, cameraDistance: 3 }
};

export default meta;
type Story = StoryObj<Args>;

// Every module side by side, five to a row, in the order the AFC ring docks
// them, scaled up so each reads at gallery distance.
const GRID_COLUMNS = 5;
const GRID_SCALE = 2.4;
const GRID_SPACING_X = 2.4;
const GRID_SPACING_Z = 2.1;

// Orthographic, so every row reads at the same size and its captions line up.
export const AllModules: Story = {
  args: { cameraDistance: 12 },
  render: (args) => {
    const stage = studioStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.6, orthoHalfHeight: 5.6, background: "#15161b" });
    const cleanups: (() => void)[] = [];
    const rows = Math.ceil(AFC_MODULE_MODELS.length / GRID_COLUMNS);
    const labels = AFC_MODULE_MODELS.map((model, i) => {
      const x = ((i % GRID_COLUMNS) - (GRID_COLUMNS - 1) / 2) * GRID_SPACING_X;
      const z = (Math.floor(i / GRID_COLUMNS) - (rows - 1) / 2) * GRID_SPACING_Z;
      const inner = new Scene();
      const overlay = model.create(inner, 1);
      overlay.addInstance(0, 0, 0, 0, model.seedTile[0], model.seedTile[1]);
      overlay.commit();
      const content = new Group();
      content.add(inner);
      content.position.set(x, 0, z);
      content.scale.setScalar(GRID_SCALE);
      content.rotation.y = -Math.PI / 2 + model.facing;
      stage.scene.add(content);
      cleanups.push(overlay.dispose, startUpdateLoop([overlay]));
      return { text: isAfcModuleInGame(model) ? model.name : `${model.name}\n(not in game)`, x, z: z + 0.75 };
    });
    const container = wrapWithCleanup(stage, cleanups);
    cleanups.push(attachSceneLabels(container, stage, labels));
    return container;
  }
};

export const Hero: Story = { render: hero("#a6a3a1") };

export const HeroDark: Story = { render: hero("#15161b") };

// Slow turntable so the whole silhouette can be inspected from every side.
export const Turntable: Story = {
  render: (args) => {
    const model = afcModuleById(args.module);
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1.15, background: "#15161b" });
    const inner = new Scene();
    const overlay = model.create(inner, 1);
    overlay.addInstance(0, 0, 0, 0, model.seedTile[0], model.seedTile[1]);
    overlay.commit();
    const content = new Group();
    content.add(inner);
    stage.scene.add(content);
    const shadow = createContactShadow(model.shadowRadius);
    stage.scene.add(shadow.mesh);
    let rafId = 0;
    const spin = (nowMs: number): void => {
      overlay.update(nowMs);
      content.rotation.y = -Math.PI / 4 + nowMs * 0.0005;
      rafId = requestAnimationFrame(spin);
    };
    spin(0);
    return withCaption(model, wrapWithCleanup(stage, [shadow.dispose, overlay.dispose, () => cancelAnimationFrame(rafId)]));
  }
};

// In gameplay context on a grass tile, turned toward the viewer.
export const OnGrass: Story = {
  render: (args) => {
    const model = afcModuleById(args.module);
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    return withCaption(model, wrapWithCleanup(stage, buildSingleModule(stage, model, { yaw: -Math.PI / 2 + model.facing, grass: true })));
  }
};

// Seated in the AFC socket that faces the default camera.
export const DockedToAfc: Story = {
  args: { cameraDistance: 4.5 },
  render: (args) => {
    const model = afcModuleById(args.module);
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    const shadow = createContactShadow(1.7);
    stage.scene.add(shadow.mesh);
    const afc = createFabricationComplexOverlay(stage.scene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 5, 5);
    afc.commit();
    const modules = model.create(stage.scene, 1);
    const attachment = afc.moduleSocketAttachments(afcIndex)[2]!;
    modules.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, attachment.socketIndex + 1, 0);
    modules.commit();
    const cleanups = [shadow.dispose, afc.dispose, modules.dispose, startUpdateLoop([afc, modules])];
    return withCaption(model, wrapWithCleanup(stage, cleanups));
  }
};
