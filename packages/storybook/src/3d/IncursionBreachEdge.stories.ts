import type { Meta, StoryObj } from "@storybook/html-vite";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial } from "three";
import { createIncursionOverlay3D } from "@client/client-map-3d-incursion-overlay/client-map-3d-incursion-overlay.js";
import { incursionHatchColors, incursionMarkColor } from "@client/client-reach-incursion/client-reach-incursion.js";
import { incursionBreachLayout } from "@client/client-reach-incursion/client-incursion-breach-layout.js";
import { INCURSION_BREACH_STYLES, type IncursionBreachStyle } from "@client/client-reach-incursion/client-incursion-breach-style.js";
import { normalizeColorForThree } from "@client/client-three-color/client-three-color.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";
import { BREACH_STYLE_LABELS, buildBreachDemoWorld, demoKindAt, parseTileKey, type BreachDemoWorld } from "../incursion-breach/incursion-breach-demo-world.js";

/**
 * The incursion pocket edge -- the outline around a rival's tiles inside my
 * reach -- in each breach style, through the REAL production 3D overlay
 * (createIncursionOverlay3D, animated via update()) and layout
 * (incursionBreachLayout), exactly as addReachTileOverlays3D feeds them in-game. In the game the style
 * is the Settings > Admin "Breach Edge Style" switch.
 *
 * The pocket on my east border keeps the plain strip on its outer side in
 * every style: only sides facing my own tiles get the breach look.
 */

type Args = {
  style: IncursionBreachStyle;
  cameraDistance: number;
  cameraTilt: number;
  myColor: string;
  intruderColor: string;
};

const OWNERSHIP_OPACITY = 0.78;
const HATCH_Y = 0.004;

/** Flat ownership fill (my colour / the intruder's) so the overlay sits on something game-like. */
const ownershipMesh = (world: BreachDemoWorld, myColor: string, intruderColor: string): Mesh => {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  for (const [keys, hex] of [
    [world.mine, myColor],
    [world.pocket, intruderColor]
  ] as const) {
    color.set(normalizeColorForThree(hex));
    for (const key of keys) {
      const { x, y } = parseTileKey(key);
      const corners = [
        [x - 0.5, y - 0.5],
        [x + 0.5, y - 0.5],
        [x + 0.5, y + 0.5],
        [x - 0.5, y - 0.5],
        [x + 0.5, y + 0.5],
        [x - 0.5, y + 0.5]
      ];
      for (const [cx, cz] of corners) {
        positions.push(cx!, 0, cz!);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: OWNERSHIP_OPACITY, depthWrite: false, side: DoubleSide, toneMapped: false }));
  mesh.renderOrder = 5;
  return mesh;
};

const renderOne = (args: Args, label?: string): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#0a0e14" });
  const ground = createGrassGround(9);
  stage.scene.add(ground.group);
  const group = new Group();
  stage.scene.add(group);

  const world = buildBreachDemoWorld();
  const ownership = ownershipMesh(world, args.myColor, args.intruderColor);
  group.add(ownership);

  const overlay = createIncursionOverlay3D(group, world.pocket.size);
  const hatch = incursionHatchColors(args.intruderColor, args.myColor);
  const mark = incursionMarkColor(args.intruderColor);
  overlay.clear();
  for (const key of world.pocket) {
    const { x, y } = parseTileKey(key);
    const layout = incursionBreachLayout(args.style, demoKindAt(world, x, y), x, y);
    overlay.addTile(x, y, HATCH_Y, hatch, mark, layout.straightEdges, { style: args.style, worldX: x, worldY: y, layout });
  }
  overlay.commit();

  let animId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    animId = requestAnimationFrame(animate);
  };
  animate();

  const container = wrapWithCleanup(stage, [
    () => cancelAnimationFrame(animId),
    overlay.dispose,
    () => {
      ownership.geometry.dispose();
      (ownership.material as MeshBasicMaterial).dispose();
    },
    ground.dispose
  ]);
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
  for (const style of INCURSION_BREACH_STYLES) grid.appendChild(renderOne({ ...args, style }, BREACH_STYLE_LABELS[style]));
  return grid;
};

const meta: Meta<Args> = {
  title: "3D Library/IncursionBreachEdge",
  argTypes: {
    style: { control: { type: "select" }, options: [...INCURSION_BREACH_STYLES] },
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.2, max: 1.2, step: 0.05 } },
    myColor: { control: { type: "color" } },
    intruderColor: { control: { type: "color" } }
  },
  // Red-pink me, light-green intruder (-> near-black outline), as in the original screenshot.
  args: { style: "spikes", cameraDistance: 10, cameraTilt: 0.7, myColor: "#e0535d", intruderColor: "#7be05a" },
  render: (args) => renderOne(args, BREACH_STYLE_LABELS[args.style])
};

export default meta;
type Story = StoryObj<Args>;

export const CompareAll: Story = { render: renderCompare };
export const Current: Story = { args: { style: "straight" } };
export const Spikes: Story = { args: { style: "spikes" } };
/** Spikes with a dark attacker: blue teeth on a white rim. */
export const SpikesDarkIntruder: Story = { args: { style: "spikes", intruderColor: "#2b3a8c" } };
export const Option1Ember: Story = { args: { style: "ember" } };
export const Option2Ink: Story = { args: { style: "ink" } };
export const Option3Veil: Story = { args: { style: "veil" } };
/** A dark intruder colour flips the outline to white -- check every style still reads. */
export const CompareAllDarkIntruder: Story = { args: { intruderColor: "#2b3a8c" }, render: renderCompare };
