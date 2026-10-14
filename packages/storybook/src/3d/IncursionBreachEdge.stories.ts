import type { Meta, StoryObj } from "@storybook/html-vite";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, ShapeUtils, Vector2 } from "three";
import { createIncursionOverlay3D } from "@client/client-map-3d-incursion-overlay/client-map-3d-incursion-overlay.js";
import { incursionHatchColors, incursionMarkColor } from "@client/client-reach-incursion/client-reach-incursion.js";
import { normalizeColorForThree } from "@client/client-three-color/client-three-color.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import {
  BREACH_EDGE_LABELS,
  BREACH_EDGE_STYLES,
  buildBreachDemoWorld,
  buildBreachEdgePolygons,
  parseTileKey,
  type BreachEdgeStyle,
  type BreachPolygon,
  type BreachWorld
} from "../incursion-breach/incursion-breach-prototypes.js";

/**
 * Prototype comparison for the incursion pocket edge -- the dark (or white)
 * outline around a rival's tiles that sit inside my reach. The hatch is the
 * REAL production overlay (createIncursionOverlay3D); for "current" its real
 * edge strips are drawn too. For the three options the real strips are
 * switched off and the candidate edge shapes from
 * incursion-breach-prototypes.ts are drawn on top instead. Not wired into the
 * game -- this is for picking a direction.
 *
 * Note the pocket on my east border: its outer side faces unowned land, so it
 * keeps the plain strip in every option -- only sides facing my own tiles get
 * the breach treatment.
 */

type Args = {
  style: BreachEdgeStyle;
  cameraDistance: number;
  cameraTilt: number;
  myColor: string;
  intruderColor: string;
};

const OWNERSHIP_OPACITY = 0.78;
const HATCH_Y = 0.004;
const EDGE_Y = 0.008;
const LAYER_LIFT = 0.002;

/** Triangulates flat tile-space polygons (x, y) into one mesh on the ground plane (x, h, y). */
const polygonsMesh = (polygons: readonly BreachPolygon[], colorFor: (p: BreachPolygon) => string, y: (p: BreachPolygon) => number, opacity: number, renderOrder: number): Mesh => {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  for (const polygon of polygons) {
    color.set(normalizeColorForThree(colorFor(polygon)));
    const contour = polygon.points.map((p) => new Vector2(p.x, p.y));
    const height = y(polygon);
    for (const face of ShapeUtils.triangulateShape(contour, [])) {
      for (const index of face) {
        const p = polygon.points[index]!;
        positions.push(p.x, height, p.y);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  return mesh;
};

const tileSquare = (key: string): BreachPolygon["points"] => {
  const { x, y } = parseTileKey(key);
  return [
    { x: x - 0.5, y: y - 0.5 },
    { x: x + 0.5, y: y - 0.5 },
    { x: x + 0.5, y: y + 0.5 },
    { x: x - 0.5, y: y + 0.5 }
  ];
};

const buildScene = (parent: Group, world: BreachWorld, args: Args): (() => void) => {
  const disposers: Array<() => void> = [];
  const track = (mesh: Mesh): void => {
    parent.add(mesh);
    disposers.push(() => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    });
  };

  // Plain ownership fill: mine in my colour, the pocket in the intruder's.
  const ownership: BreachPolygon[] = [
    ...[...world.mine].map((key): BreachPolygon => ({ points: tileSquare(key), paint: "mark", layer: 0 })),
    ...[...world.pocket].map((key): BreachPolygon => ({ points: tileSquare(key), paint: "intruder", layer: 0 }))
  ];
  track(polygonsMesh(ownership, (p) => (p.paint === "intruder" ? args.intruderColor : args.myColor), () => 0, OWNERSHIP_OPACITY, 5));

  // The real production hatch (+ its real edge strips only for "current").
  const overlay = createIncursionOverlay3D(parent, world.pocket.size);
  const hatch = incursionHatchColors(args.intruderColor, args.myColor);
  const mark = incursionMarkColor(args.intruderColor);
  overlay.clear();
  for (const key of world.pocket) {
    const { x, y } = parseTileKey(key);
    const real = args.style === "current";
    const edges = {
      north: real && !world.pocket.has(`${x},${y - 1}`),
      east: real && !world.pocket.has(`${x + 1},${y}`),
      south: real && !world.pocket.has(`${x},${y + 1}`),
      west: real && !world.pocket.has(`${x - 1},${y}`)
    };
    overlay.addTile(x, y, HATCH_Y, hatch, mark, edges);
  }
  overlay.commit();
  disposers.push(overlay.dispose);

  if (args.style !== "current") {
    const polygons = buildBreachEdgePolygons(world, args.style);
    for (const layer of [0, 1, 2] as const) {
      const inLayer = polygons.filter((p) => p.layer === layer);
      if (inLayer.length === 0) continue;
      track(polygonsMesh(inLayer, (p) => (p.paint === "intruder" ? args.intruderColor : mark), () => EDGE_Y + layer * LAYER_LIFT, 0.95, 20 + layer));
    }
  }
  return () => disposers.forEach((fn) => fn());
};

const renderOne = (args: Args, label?: string): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#0a0e14" });
  const ground = createGrassGround(9);
  stage.scene.add(ground.group);
  const group = new Group();
  stage.scene.add(group);
  const disposeScene = buildScene(group, buildBreachDemoWorld(), args);
  const container = wrapWithCleanup(stage, [disposeScene, ground.dispose]);
  if (label) {
    const tag = document.createElement("div");
    tag.textContent = label;
    tag.style.cssText = "position:absolute;left:10px;top:8px;padding:4px 10px;border-radius:6px;background:rgba(10,14,20,0.78);color:#f1e6c8;font:600 14px system-ui,sans-serif;";
    container.appendChild(tag);
  }
  return container;
};

const renderCompare = (args: Args): HTMLElement => {
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:8px;background:#0a0e14;padding:8px;";
  for (const style of BREACH_EDGE_STYLES) grid.appendChild(renderOne({ ...args, style }, BREACH_EDGE_LABELS[style]));
  return grid;
};

const meta: Meta<Args> = {
  title: "3D Library/IncursionBreachEdge",
  argTypes: {
    style: { control: { type: "select" }, options: [...BREACH_EDGE_STYLES] },
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.2, max: 1.2, step: 0.05 } },
    myColor: { control: { type: "color" } },
    intruderColor: { control: { type: "color" } }
  },
  // Colours match the screenshot this came from: red-pink me, light-green intruder (-> near-black marks).
  args: { style: "spikes", cameraDistance: 10, cameraTilt: 0.7, myColor: "#e0535d", intruderColor: "#7be05a" },
  render: (args) => renderOne(args, BREACH_EDGE_LABELS[args.style])
};

export default meta;
type Story = StoryObj<Args>;

export const CompareAll: Story = { render: renderCompare };
export const Current: Story = { args: { style: "current" } };
export const Option1Spikes: Story = { args: { style: "spikes" } };
export const Option2Jagged: Story = { args: { style: "jagged" } };
export const Option3Shattered: Story = { args: { style: "shattered" } };
/** A dark intruder colour flips the marks to white -- check every option still reads. */
export const CompareAllDarkIntruder: Story = { args: { intruderColor: "#2b3a8c" }, render: renderCompare };
