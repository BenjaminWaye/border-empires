import { AdditiveBlending, type Scene } from "three";
import {
  aetherProtectionColor,
  aetherProtectionEdges,
  aetherProtectionField,
  isAetherProtectionFieldShown,
  tileAetherProtection,
  type AetherProtectionField
} from "./client-aether-tower-protection/client-aether-tower-protection.js";
import { createShieldAreaOverlay } from "./client-map-3d-shield-area-overlay.js";
import { createAetherProtectionEdgeOverlay } from "./client-map-3d-aether-protection-edges.js";
import type { Tile } from "./client-types.js";

// True-3D renderer half of the Aether Tower protection field (see
// client-aether-tower-protection.ts for the rule and when it's shown; the 2D
// fallback paints the same tiles in client-runtime-loop.ts). An additive glow
// plane per shielded tile -- blue for your own and allied towers, red for
// enemy towers -- plus an outline strip along the field's edge
// (client-map-3d-aether-protection-edges.ts), reusing the muster-flag shield
// wash's instanced-plane technique, sized for the full visible-tile budget since one tower alone
// covers up to a 41x41 block.

export type AetherProtectionOverlay3D = {
  /** Called once per terrain rebuild, before the per-tile pass. */
  readonly begin: (state: AetherProtectionOverlayState, keyFor: (x: number, y: number) => string) => void;
  readonly addTile: (tile: Tile | undefined, sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type AetherProtectionOverlayState = Parameters<typeof isAetherProtectionFieldShown>[0] & Parameters<typeof aetherProtectionField>[0];

export const createAetherProtectionOverlay3D = (scene: Scene, maxTiles: number): AetherProtectionOverlay3D => {
  // Additive: the field glows over the owner's colours instead of shading them.
  const overlay = createShieldAreaOverlay(scene, { maxTiles, opacity: 0.3, tintLighten: 0.25, renderOrder: 20, blending: AdditiveBlending });
  const edges = createAetherProtectionEdgeOverlay(scene, maxTiles);
  let field: AetherProtectionField | undefined;
  let tileAt: (x: number, y: number) => Tile | undefined = () => undefined;

  const begin = (state: AetherProtectionOverlayState, keyFor: (x: number, y: number) => string): void => {
    overlay.clear();
    edges.clear();
    // Date.now(), not the render loop's performance.now(): cooldownUntil is server epoch ms.
    field = isAetherProtectionFieldShown(state, keyFor) ? aetherProtectionField(state, Date.now()) : undefined;
    tileAt = (x, y) => state.tiles.get(keyFor(x, y));
  };

  const addTile = (tile: Tile | undefined, sceneX: number, sceneZ: number, surfaceY: number): void => {
    if (!field || !tile) return;
    const protector = tileAetherProtection(tile, field);
    if (!protector) return;
    const color = aetherProtectionColor(protector.relation);
    overlay.addTile({ sceneX, sceneZ, surfaceY, ownerColor: color });
    edges.addTile(aetherProtectionEdges(tile, protector, field, tileAt), sceneX, sceneZ, surfaceY, color);
  };

  const commit = (): void => {
    overlay.commit();
    edges.commit();
  };

  const dispose = (): void => {
    overlay.dispose();
    edges.dispose();
  };

  return { begin, addTile, commit, dispose };
};
