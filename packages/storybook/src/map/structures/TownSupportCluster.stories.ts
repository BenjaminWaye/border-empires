import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight, Mesh, PCFSoftShadowMap, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";
import {
  buildSupportStudy, CLUSTER_BASE_Y, type SupportStudyKind
} from "./town-support-cluster/cluster-buildings.js";
import { buildClusterConnections } from "./town-support-cluster/cluster-connections.js";
import { createClusterMesh } from "./town-support-cluster/cluster-mesh.js";

type Args = {
  tier: Exclude<TownTier, "SETTLEMENT">;
  layout: "cluster" | "lineup";
  connections: boolean;
  framing: "detail" | "gameplay";
  camera: "orthographic" | "perspective";
  yaw: number;
};

type Placement = { readonly x: number; readonly z: number; readonly kind: SupportStudyKind };
const CLUSTER: readonly Placement[] = [
  { x: -1, z: -1, kind: "AETHER_CONDENSER" },
  { x: 0, z: -1, kind: "MANUFACTORY" },
  { x: 1, z: -1, kind: "ANCILLARY_DEPOT" },
  { x: -1, z: 0, kind: "MANUFACTORY" },
  { x: 1, z: 0, kind: "AETHER_CONDENSER" },
  { x: -1, z: 1, kind: "ANCILLARY_DEPOT" },
  { x: 0, z: 1, kind: "MANUFACTORY" },
  { x: 1, z: 1, kind: "AETHER_CONDENSER" }
];
const LINEUP: readonly Placement[] = [
  { x: -1.5, z: 0, kind: "MANUFACTORY" },
  { x: -0.5, z: 0, kind: "ANCILLARY_DEPOT" },
  { x: 0.5, z: 0, kind: "AETHER_CONDENSER" }
];
const TOWN_EDGE: Readonly<Record<Args["tier"], number>> = {
  TOWN: 0.36, CITY: 0.4, GREAT_CITY: 0.418, METROPOLIS: 0.427
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    width: 1200, height: 900, camera: args.camera, cameraDistance: 7,
    cameraTilt: 0.8, background: "#25342b",
    orthoHalfHeight: args.framing === "detail" ? 1.85 : 3.5
  });
  const yaw = args.yaw * Math.PI / 180;
  const distance = args.framing === "detail" ? 6 : 11;
  stage.camera.position.set(Math.sin(yaw) * distance * 0.7, distance * 0.72, Math.cos(yaw) * distance * 0.7);
  stage.camera.lookAt(0, 0.1, 0);
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = PCFSoftShadowMap;
  for (const light of stage.scene.children) {
    if (!(light instanceof DirectionalLight) || light.intensity < 1) continue;
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 40 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.normalBias = 0.008;
  }
  const pmrem = new PMREMGenerator(stage.renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room);
  room.dispose();
  pmrem.dispose();
  const town = createTownOverlay(stage.scene, 1, environment.texture);
  town.addInstance(args.layout === "lineup" ? 1.5 : 0, 0, CLUSTER_BASE_Y, args.tier, 0, 0);
  town.commit();
  const ground = createGrassGround(args.framing === "detail" ? 3 : 6);
  ground.group.traverse(object => { if (object instanceof Mesh) object.receiveShadow = true; });
  stage.scene.add(ground.group);
  const cleanups: Array<() => void> = [town.dispose, ground.dispose, () => environment.dispose()];
  const placements = args.layout === "cluster" ? CLUSTER : LINEUP;
  for (const [i, placement] of placements.entries()) {
    const building = createClusterMesh(t => buildSupportStudy(t, placement.kind), environment.texture, 73 + i);
    building.group.position.set(placement.x, CLUSTER_BASE_Y, placement.z);
    stage.scene.add(building.group);
    cleanups.push(building.dispose);
  }
  if (args.connections && args.layout === "cluster") {
    const links = createClusterMesh(t => buildClusterConnections(t, TOWN_EDGE[args.tier]), environment.texture);
    links.group.position.y = CLUSTER_BASE_Y;
    stage.scene.add(links.group);
    cleanups.push(links.dispose);
  }
  const container = wrapWithCleanup(stage, cleanups);
  container.style.height = "100vh";
  stage.canvas.style.height = "100%";
  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) return;
    stage.renderer.setSize(width, height, false);
    const aspect = width / height;
    if ("isOrthographicCamera" in stage.camera) {
      const halfHeight = args.framing === "detail" ? 1.85 : 3.5;
      stage.camera.left = -halfHeight * aspect;
      stage.camera.right = halfHeight * aspect;
    } else stage.camera.aspect = aspect;
    stage.camera.updateProjectionMatrix();
  });
  resize.observe(container);
  cleanups.push(() => resize.disconnect());
  return container;
};

const meta: Meta<Args> = {
  title: "Map/Structures/Town/Support Cluster",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: [
      "Proposed support-building remodel: three new models using the existing town's geometry kit, palette,",
      "marble plinths, aged brass, lamplight and steam. All support plates have radius 0.38 tiles,",
      "a shared service socket height, and distinct low industrial silhouettes beside the larger town tiers.",
      "The eight-building cluster tests proportions and a modular service ring on a real one-tile grid.",
      "Lineup compares the Manufactory, Ancillary Depot and Aether Condenser directly against the town.",
      "This is a 3D art study only. It does not replace live buildings or change support rules.",
      "Production routing, terrain adaptation, the other support buildings and 2D parity are not implemented."
    ].join(" ") } }
  },
  args: { tier: "METROPOLIS", layout: "cluster", connections: true, framing: "detail", camera: "orthographic", yaw: 0 },
  argTypes: {
    tier: { control: "inline-radio", options: ["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] },
    layout: { control: "inline-radio", options: ["cluster", "lineup"] },
    connections: { control: "boolean" },
    framing: { control: "inline-radio", options: ["detail", "gameplay"] },
    camera: { control: "inline-radio", options: ["orthographic", "perspective"] },
    yaw: { control: { type: "range", min: -180, max: 180, step: 15 } }
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const ConnectedDistrict: Story = {};
export const BuildingLineup: Story = { args: { layout: "lineup", connections: false } };
export const GameplayDistance: Story = { args: { framing: "gameplay" } };
export const WithoutConnections: Story = { args: { connections: false } };
export const SmallTown: Story = { args: { tier: "TOWN" } };
