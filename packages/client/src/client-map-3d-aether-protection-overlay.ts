import type { Scene } from "three";
import {
  aetherProtectionColor,
  aetherProtectionField,
  isAetherProtectionFieldShown,
  tileAetherProtection,
  type AetherProtectionField
} from "./client-aether-tower-protection/client-aether-tower-protection.js";
import { createShieldAreaOverlay } from "./client-map-3d-shield-area-overlay.js";
import type { Tile } from "./client-types.js";

// True-3D renderer half of the Aether Tower protection field (see
// client-aether-tower-protection.ts for the rule and when it's shown; the 2D
// fallback paints the same tiles in client-runtime-loop.ts). A flat tinted
// plane per shielded tile -- blue for your own and allied towers, red for
// enemy towers -- reusing the muster-flag shield wash's instanced-plane
// technique, sized for the full visible-tile budget since one tower alone
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
  const overlay = createShieldAreaOverlay(scene, { maxTiles, opacity: 0.2, tintLighten: 0.15, renderOrder: 20 });
  let field: AetherProtectionField | undefined;

  const begin = (state: AetherProtectionOverlayState, keyFor: (x: number, y: number) => string): void => {
    overlay.clear();
    // Date.now(), not the render loop's performance.now(): cooldownUntil is server epoch ms.
    field = isAetherProtectionFieldShown(state, keyFor) ? aetherProtectionField(state, Date.now()) : undefined;
  };

  const addTile = (tile: Tile | undefined, sceneX: number, sceneZ: number, surfaceY: number): void => {
    if (!field) return;
    const protector = tileAetherProtection(tile, field);
    if (protector) overlay.addTile({ sceneX, sceneZ, surfaceY, ownerColor: aetherProtectionColor(protector.relation) });
  };

  return { begin, addTile, commit: overlay.commit, dispose: overlay.dispose };
};
