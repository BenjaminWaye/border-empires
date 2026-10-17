import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createOwnershipOverlay, type OwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createFrontierSupplyOverlay } from "@client/client-map-3d-frontier-supply-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";
import {
  buildSupplyDemoWorld,
  DEMO_COLOR,
  DEMO_RIVAL,
  DEMO_RIVAL_COLOR,
  rerouteCapturesAt,
  SUPPLY_SCENARIO_DESCRIPTIONS,
  type SupplyDemoWorld,
  type SupplyScenario
} from "../frontier-supply/frontier-supply-demo-world.js";

/**
 * The real true-3D frontier supply overlay (client-map-3d-frontier-supply-
 * overlay.ts), fed by the real supply model (client-frontier-supply.ts),
 * over the real ownership overlay. In the Reroute story a rival takes a tile
 * on one arm of a loop every few seconds and the real model is recomputed,
 * so what you see is exactly what the game redraws after a capture.
 */

type Args = { scenario: SupplyScenario; cameraDistance: number; reroutePhaseMs: number };

const OWNER = new Color(DEMO_COLOR);
const RIVAL = new Color(DEMO_RIVAL_COLOR);

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.72, background: "#16202c" });
  const initial = buildSupplyDemoWorld(args.scenario);
  // Frame on the first layout and keep the camera still, so a reroute reads as a change on the map, not a camera jump.
  const centreX = (initial.minX + initial.maxX) / 2;
  const centreY = (initial.minY + initial.maxY) / 2;
  const sceneFor = (x: number, y: number) => ({ sceneX: x - centreX, sceneZ: y - centreY, surfaceY: 0 });

  let ownership: OwnershipOverlay | undefined;
  const paintOwnership = (world: SupplyDemoWorld): void => {
    ownership?.dispose();
    ownership = createOwnershipOverlay(stage.scene, world.tiles.length);
    for (const tile of world.tiles) {
      const x0 = tile.x - centreX - 0.5;
      const z0 = tile.y - centreY - 0.5;
      const rival = tile.ownerId === DEMO_RIVAL;
      ownership.addTile(x0, 0.001, z0, x0 + 1, 0.001, z0, x0, 0.001, z0 + 1, x0 + 1, 0.001, z0 + 1, rival ? RIVAL : OWNER, rival || tile.ownershipState === "FRONTIER");
    }
    ownership.commit();
  };

  const supply = createFrontierSupplyOverlay(stage.scene);
  let world = initial;
  let capturesKey = "";
  paintOwnership(world);
  const start = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    if (args.scenario === "reroute") {
      const captures = rerouteCapturesAt(now - start, args.reroutePhaseMs);
      const key = captures.join("|");
      if (key !== capturesKey) {
        capturesKey = key;
        world = buildSupplyDemoWorld(args.scenario, captures);
        paintOwnership(world);
      }
    }
    supply.sync(world.model, sceneFor, "story", DEMO_COLOR, now);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), supply.dispose, () => ownership?.dispose()]);
};

const meta: Meta<Args> = {
  title: "3D Library/FrontierSupplyOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Frontier supply routes on the true-3D map. Land beyond your reach can't be garrisoned and is lost the moment its " +
          "chain back to settled land is cut, so the map draws that chain: smoothed routes, thicker where more land depends on " +
          "them and fading as they run past reach, with pulses travelling outward and an arrowhead at each frontier tip. Stretches " +
          "hanging off a single tile turn amber and flicker, and amber wedges close in on the pinch. Real client code throughout: " +
          "computeFrontierSupplyModel → buildSupplyRoutes → createFrontierSupplyOverlay, over createOwnershipOverlay."
      }
    }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["snake", "corridor", "branching", "reroute"] },
    cameraDistance: { control: { type: "range", min: 8, max: 40, step: 1 } },
    reroutePhaseMs: { control: { type: "range", min: 1000, max: 8000, step: 500 } }
  },
  args: { scenario: "snake", cameraDistance: 16, reroutePhaseMs: 3000 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Snake: Story = { parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.snake } } } };
export const Corridor: Story = { args: { scenario: "corridor" }, parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.corridor } } } };
export const Branching: Story = { args: { scenario: "branching" }, parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.branching } } } };
export const Reroute: Story = { args: { scenario: "reroute" }, parameters: { docs: { description: { story: SUPPLY_SCENARIO_DESCRIPTIONS.reroute } } } };
