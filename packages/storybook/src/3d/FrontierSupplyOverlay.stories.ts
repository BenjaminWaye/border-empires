import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createFrontierSupplyOverlay } from "@client/client-map-3d-frontier-supply-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";
import { buildSupplyDemoWorld, DEMO_COLOR, SUPPLY_SCENARIO_DESCRIPTIONS, type SupplyScenario } from "../frontier-supply/frontier-supply-demo-world.js";

/**
 * The real true-3D frontier supply overlay (client-map-3d-frontier-supply-
 * overlay.ts), fed by the real supply model (client-frontier-supply.ts),
 * over the real ownership overlay. Chevrons flow outward from the reach edge
 * into frontier beyond reach, fading the further out they go; amber rings
 * pulse on chokepoints -- single tiles everything past them depends on.
 */

type Args = { scenario: SupplyScenario; cameraDistance: number };

const OWNER = new Color(DEMO_COLOR);

const render = (args: Args): HTMLElement => {
  const world = buildSupplyDemoWorld(args.scenario);
  const centreX = (world.minX + world.maxX) / 2;
  const centreY = (world.minY + world.maxY) / 2;
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.75, background: "#16202c" });

  // Scene coords: tile (x, y) is the unit square centred on (x - centre, y - centre).
  const ownership = createOwnershipOverlay(stage.scene, world.tiles.length);
  for (const tile of world.tiles) {
    const x0 = tile.x - centreX - 0.5;
    const z0 = tile.y - centreY - 0.5;
    ownership.addTile(x0, 0.001, z0, x0 + 1, 0.001, z0, x0, 0.001, z0 + 1, x0 + 1, 0.001, z0 + 1, OWNER, tile.ownershipState === "FRONTIER");
  }
  ownership.commit();

  const supply = createFrontierSupplyOverlay(stage.scene);
  const sceneFor = (x: number, y: number) => ({ sceneX: x - centreX, sceneZ: y - centreY, surfaceY: 0 });
  let rafId = 0;
  const animate = (): void => {
    supply.sync(world.model, sceneFor, "story", DEMO_COLOR, performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), supply.dispose, ownership.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/FrontierSupplyOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Frontier supply lines on the true-3D map. Land beyond your reach can't be garrisoned and is lost the moment its " +
          "chain of frontier back to settled land is cut, so the map draws that chain: faint chevrons flowing outward (fainter the " +
          "further past reach), and pulsing amber rings on chokepoints. Real client code throughout: computeFrontierSupplyModel → " +
          "createFrontierSupplyOverlay, over createOwnershipOverlay."
      }
    }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["snake", "corridor", "branching"] },
    cameraDistance: { control: { type: "range", min: 8, max: 40, step: 1 } }
  },
  args: { scenario: "snake", cameraDistance: 22 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Snake: Story = { parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.snake } } } };
export const Corridor: Story = { args: { scenario: "corridor" }, parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.corridor } } } };
export const Branching: Story = { args: { scenario: "branching" }, parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.branching } } } };
