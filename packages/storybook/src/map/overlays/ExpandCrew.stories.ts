import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from "three";
import { createFrontierClaimVisuals } from "@client/client-map-3d-expand-crew/client-map-3d-expand-crew.js";
import type { ClientState } from "@client/client-state/client-state.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

// The expand crew (client-expand-crew.ts): two ancillary soldiers walk out of
// owned ground (left, tinted) onto a neutral tile, idly patrol it while the
// claim plate grows from where they arrived, and kneel as it completes. Top
// row: a manual EXPAND. Bottom row: a muster flag's auto-fired EXPAND.
type Args = {
  durationMs: number;
  ownerColor: string;
  cameraDistance: number;
  reducedMotion: boolean;
};

const CAM = 100;
const keyFor = (x: number, y: number): string => `${x},${y}`;
const flatHeightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#101820", cameraTilt: 0.75 });
  const groundGeometry = new PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardMaterial({ color: "#5d6b4a", roughness: 1 });
  const ownMaterial = new MeshBasicMaterial({ color: args.ownerColor, transparent: true, opacity: 0.3, depthWrite: false });
  const tiles = new Map<string, { x: number; y: number; terrain: string; ownerId?: string; ownershipState?: string }>();
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -1; dy <= 2; dy += 1) {
      const ground = new Mesh(groundGeometry, groundMaterial);
      ground.position.set(dx + 0.5, -0.001, dy + 0.5);
      stage.scene.add(ground);
      const mine = dx < 0;
      if (mine) {
        const tint = new Mesh(groundGeometry, ownMaterial);
        tint.position.set(dx + 0.5, 0.002, dy + 0.5);
        stage.scene.add(tint);
      }
      tiles.set(keyFor(CAM + dx, CAM + dy), { x: CAM + dx, y: CAM + dy, terrain: "LAND", ...(mine ? { ownerId: "me", ownershipState: "SETTLED" } : {}) });
    }
  }

  const state = {
    me: "me",
    playerColors: new Map([["me", args.ownerColor]]),
    tiles,
    incomingAttacksByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
    capture: undefined
  } as unknown as ClientState;

  const spawnWave = (): void => {
    const startAt = Date.now();
    const resolvesAt = startAt + args.durationMs;
    state.capture = { startAt, resolvesAt, target: { x: CAM, y: CAM }, origin: { x: CAM - 1, y: CAM }, actionType: "EXPAND" };
    state.outgoingMusterAttacksByTile = new Map([
      [keyFor(CAM, CAM + 1), { originX: CAM - 1, originY: CAM + 1, targetX: CAM, targetY: CAM + 1, resolvesAt, transitEndsAt: startAt, isExpand: true }]
    ]);
  };
  spawnWave();
  const interval = setInterval(spawnWave, args.durationMs + 800);

  const visuals = createFrontierClaimVisuals(stage.scene, undefined, { recordFrame: () => {}, shouldAnimate: () => !args.reducedMotion, prefersReducedMotion: () => args.reducedMotion });
  stage.scene.add(...visuals.objects);
  let rafId = 0;
  const animate = (): void => {
    visuals.sync(state, keyFor, flatHeightfield, CAM, CAM, 0.004, (x) => x, (y) => y, () => false, args.ownerColor);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => clearInterval(interval),
    () => cancelAnimationFrame(rafId),
    visuals.dispose,
    () => groundGeometry.dispose(),
    () => groundMaterial.dispose(),
    () => ownMaterial.dispose()
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Overlays/ExpandCrew",
  argTypes: {
    durationMs: { control: { type: "range", min: 2000, max: 12000, step: 500 } },
    ownerColor: { control: "color" },
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 1 } },
    reducedMotion: { control: "boolean" }
  },
  args: { durationMs: 7500, ownerColor: "#4a8cff", cameraDistance: 4, reducedMotion: false },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const ReducedMotion: Story = { args: { reducedMotion: true } };
