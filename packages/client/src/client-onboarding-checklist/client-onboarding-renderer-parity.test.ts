// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import type { Tile } from "../client-types.js";
import { createOnboardingChecklistHighlightOverlay } from "../client-map-3d-onboarding-checklist-highlight.js";
import { onboardingChecklistState } from "./client-onboarding-checklist.js";
import { drawOnboardingChecklistHighlights } from "./client-onboarding-checklist-highlight.js";

it("renders the same single next-food tile in 2D and true-3D, then clears both", () => {
  window.localStorage.clear();
  const tiles = new Map<string, Tile>([
    ["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active" } }],
    ["6,5", { x: 6, y: 5, terrain: "LAND" }],
    ["7,5", { x: 7, y: 5, terrain: "LAND", resource: "FISH" }]
  ]);
  const targets = onboardingChecklistState(tiles, "me").highlightTiles;
  expect(targets).toEqual([{ x: 6, y: 5 }]);
  const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), globalAlpha: 1, strokeStyle: "", lineWidth: 1 };
  const projection = vi.fn((x: number, y: number) => ({ sx: x * 10, sy: y * 10 }));
  const deps = { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: projection, size: 20, halfW: 10, halfH: 10, nowMs: 0 };
  drawOnboardingChecklistHighlights(targets, deps);
  expect(projection).toHaveBeenCalledTimes(1);
  expect(projection).toHaveBeenCalledWith(6, 5, 20, 10, 10);
  expect(context.arc).toHaveBeenCalledTimes(1);
  expect(context.arc).toHaveBeenCalledWith(60, 50, 12.4, 0, Math.PI * 2);

  const scene = new Scene();
  const overlay = createOnboardingChecklistHighlightOverlay(scene);
  overlay.sync(targets.map((tile) => ({ sceneX: tile.x, sceneZ: tile.y, surfaceY: 0.2 })), 0);
  const mesh = scene.children[0]!.children[0];
  expect(mesh).toBeInstanceOf(InstancedMesh);
  if (!(mesh instanceof InstancedMesh)) throw new Error("missing onboarding mesh");
  expect(mesh.count).toBe(1);
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBe(6);
  expect(matrix.elements[14]).toBe(5);
  context.arc.mockClear();
  drawOnboardingChecklistHighlights([], deps);
  overlay.sync([], 0);
  expect(context.arc).not.toHaveBeenCalled();
  expect(mesh.count).toBe(0);
  overlay.dispose();
  expect(scene.children).toHaveLength(0);
});
