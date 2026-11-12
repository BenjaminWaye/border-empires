import type { Meta, StoryObj } from "@storybook/html-vite";
import { CylinderGeometry, DirectionalLight, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";
import { makePath } from "./road-concept-kit.js";
import { buildRoadConcept, type RoadConcept } from "./road-concepts.js";

// Design spike: five structurally different ideas for the town-to-town link,
// on the same little network — three towns, a bend, a diagonal and a junction.
const CENTER = 100;
type Args = { concept: RoadConcept; cameraDistance: number; cameraTilt: number };

const TOWNS: Array<[number, number]> = [[-4, 0], [4, -2], [1, 2]];
const ROUTES: Array<Array<[number, number]>> = [
  [[-4, 0], [-3, 0], [-2, 0], [-1, 0], [0, -1], [1, -1]],
  [[1, -1], [2, -1], [3, -2], [4, -2]],
  [[1, -1], [1, 0], [1, 1], [1, 2]]
];

const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const sun = new DirectionalLight("#fff0c0", 1.8);
  sun.position.set(-14, 9, 6);
  stage.scene.add(sun);
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(true);
  hf.rebuild({ camX: CENTER, camY: CENTER, halfW: 9, halfH: 9, worldWidth: 240, worldHeight: 240, tileKindAt, isHillsAt: () => false });

  const ground = (dx: number, dy: number): Vector3 => new Vector3(dx + 0.5, hf.cornerYAt(CENTER + dx, CENTER + dy) ?? 0, dy + 0.5);
  // Routes start/end at the edge of the town plinth, not its centre.
  const paths = ROUTES.map((route) => makePath(route.map(([x, y]) => ground(x, y))));
  const hubs = [ground(1, -1)];

  // Stand-in towns: an octagonal plinth with a spire, so the links have ends.
  const plinthGeo = new CylinderGeometry(0.36, 0.38, 0.06, 8), spireGeo = new CylinderGeometry(0.03, 0.12, 0.45, 6);
  const plinthMat = new MeshStandardMaterial({ color: "#3b3f46", metalness: 0.5, roughness: 0.5 });
  const spireMat = new MeshStandardMaterial({ color: "#c9ccd2", metalness: 0.6, roughness: 0.35 });
  const townMeshes = TOWNS.flatMap(([x, y]) => {
    const base = ground(x, y);
    const plinth = new Mesh(plinthGeo, plinthMat);
    plinth.position.copy(base).setY(base.y + 0.03);
    const spire = new Mesh(spireGeo, spireMat);
    spire.position.copy(base).setY(base.y + 0.28);
    stage.scene.add(plinth, spire);
    return [plinth, spire];
  });

  const concept = buildRoadConcept(stage.scene, args.concept, paths, hubs);
  townMeshes[0]!.onBeforeRender = () => concept.update(performance.now() / 1000);

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, sun, ...townMeshes); },
    hf.dispose,
    concept.dispose,
    () => { plinthGeo.dispose(); spireGeo.dispose(); plinthMat.dispose(); spireMat.dispose(); }
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Roads/Concepts",
  argTypes: {
    concept: { control: "inline-radio", options: ["conduit", "monorail", "traffic", "beacons", "relays"] },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { concept: "conduit", cameraDistance: 9, cameraTilt: 0.6 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Conduit: Story = { args: { concept: "conduit" } };
export const Monorail: Story = { args: { concept: "monorail" } };
export const Traffic: Story = { args: { concept: "traffic" } };
export const Beacons: Story = { args: { concept: "beacons" } };
export const Relays: Story = { args: { concept: "relays" } };
