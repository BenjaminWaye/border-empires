// True-3D capture aftermath (see client-capture-aftermath.ts) and battle
// scars (shared war-scars.ts), modelled from the structures' own parts by
// client-wreck-models/ and drawn by client-map-3d-wreck-overlay.ts:
//   - a razed Relay Beacon, Siege Battery, Siege Tower or Dread Tower lies
//     wrecked where it stood, smoking, until the capturing troops' hold ends;
//   - a captured fort is breached (the fort overlay knocks down its own wall
//     and tower, client-map-3d-fort-breach.ts) over scorched, smoking ground;
//   - a captured resource site burns;
//   - ground where garrisons were overrun keeps battle scars for 24h, worse
//     with every battle.
// The 2D counterparts are client-map-2d-capture-aftermath.ts and
// client-map-2d-war-scars.ts. Also owns the captured-town smoke and "-N pop"
// text, extracted from client-map-3d.ts so it stays under its line budget.
//
// Rebuilt with the terrain (clear/add*/commit). boundaryPassed() asks for one
// more rebuild when the earliest aftermath or scar on screen ends, so it
// clears on time on a still camera.
import type { Scene, Texture } from "three";
import { liveWarScarLevel } from "@border-empires/shared";
import { captureAftermathForTile } from "./client-capture-aftermath/client-capture-aftermath.js";
import { forestLayoutAt } from "./client-forest-war/forest-war.js";
import { harbourFacingAt, rotationForFacing } from "./client-harbour-slipways/client-harbour-slipways.js";
import { QUAY_DECK_Y } from "./client-wreck-models/dock-fire-model.js";
import type { VillageEffects } from "./client-map-3d-village-fx.js";
import { createWreckOverlay3D } from "./client-map-3d-wreck-overlay.js";
import type { Tile } from "./client-types.js";

// Ground details sit just clear of the terrain so slopes don't swallow them.
const GROUND_LIFT = 0.008;

export type CaptureAftermathFx3D = {
  readonly clear: () => void;
  /** Wrecks, resource fires and battle scars for one visible land tile; `forest` when trees stand on it. */
  readonly addTile: (tile: Tile, tileKey: string, x: number, z: number, surfaceY: number, worldX: number, worldZ: number, forest?: "TEMPERATE" | "TROPICAL") => void;
  /** Scorched, smoking ground under a breached fort; `facing` turns local +x toward the smashed wall. */
  readonly addFortBreachGround: (x: number, z: number, surfaceY: number, facing: number, seed: number) => void;
  /** Captured-town smoke plus a one-off "-N pop" when a new capture shock is first seen. */
  readonly addTownCaptureShock: (tile: Tile | undefined, tileKey: string, x: number, z: number, surfaceY: number, seed: number, spawnText: (text: string) => void) => void;
  readonly boundaryPassed: () => boolean;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createCaptureAftermathFx3D = (
  scene: Scene,
  villageEffects: Pick<VillageEffects, "addCapturedTownSmoke">,
  envMap?: Texture,
  /** World terrain, to turn a burning dock's fire with its quay toward the water. */
  terrainAt: (x: number, y: number) => Tile["terrain"] = () => "LAND"
): CaptureAftermathFx3D => {
  const wrecks = createWreckOverlay3D(scene, envMap);
  const lastSeenCaptureShockByTile = new Map<string, number>();
  let nextBoundary = Number.POSITIVE_INFINITY;

  const clear = (): void => {
    wrecks.clear();
    nextBoundary = Number.POSITIVE_INFINITY;
  };

  const addTile = (tile: Tile, tileKey: string, x: number, z: number, surfaceY: number, worldX: number, worldZ: number, forest?: "TEMPERATE" | "TROPICAL"): void => {
    const y = surfaceY + GROUND_LIFT;
    const seed = worldX * 17 + worldZ * 31;
    const scarLevel = liveWarScarLevel(tile, Date.now());
    if (scarLevel > 0) {
      // In a forest the trees themselves take the damage, laid out exactly as the forest draws them.
      if (forest) wrecks.add({ kind: "FOREST_WAR", level: scarLevel, ...forestLayoutAt(worldX, worldZ, forest === "TROPICAL") }, x, y, z, seed, 0);
      else wrecks.add({ kind: "BATTLE_SCARS", level: scarLevel }, x, y, z, seed);
      nextBoundary = Math.min(nextBoundary, tile.warScarUntil!);
    }
    const aftermath = captureAftermathForTile(tile, tileKey);
    if (!aftermath) return;
    nextBoundary = Math.min(nextBoundary, aftermath.until);
    if (aftermath.smoke) wrecks.add({ kind: "RESOURCE_FIRE" }, x, y, z, seed + 1);
    // On the quay, which stands on the land and is turned toward the water (client-map-3d-harbour-placement.ts).
    if (aftermath.burningDock) wrecks.add({ kind: "DOCK_FIRE" }, x, surfaceY + 0.02 + QUAY_DECK_Y, z, seed + 4, rotationForFacing(harbourFacingAt(terrainAt, worldX, worldZ)));
    for (const kind of aftermath.rubble) {
      // A breached fort is drawn by the fort overlay itself (addFortBreachGround below).
      if (kind === "RELAY_BEACON") wrecks.add({ kind: "RELAY_BEACON" }, x, y, z, seed + 2);
      else if (kind !== "FORT") wrecks.add({ kind: "SIEGE", variant: kind }, x, y, z, seed + 3);
    }
  };

  const addFortBreachGround = (x: number, z: number, surfaceY: number, facing: number, seed: number): void =>
    wrecks.add({ kind: "FORT_BREACH" }, x, surfaceY + GROUND_LIFT, z, seed, facing);

  const addTownCaptureShock = (tile: Tile | undefined, tileKey: string, x: number, z: number, surfaceY: number, seed: number, spawnText: (text: string) => void): void => {
    const captureShockUntil = tile?.town?.captureShockUntil;
    if (typeof captureShockUntil === "number" && captureShockUntil > Date.now()) {
      villageEffects.addCapturedTownSmoke(x, z, surfaceY, seed);
      const previousShock = lastSeenCaptureShockByTile.get(tileKey) ?? 0;
      if (captureShockUntil > previousShock) {
        const popBefore = tile?.town?.populationBeforeCapture;
        const popAfter = tile?.town?.population;
        if (typeof popBefore === "number" && typeof popAfter === "number" && popBefore > popAfter) {
          spawnText(`-${Math.max(1, Math.round(popBefore - popAfter))} pop`);
        }
        lastSeenCaptureShockByTile.set(tileKey, captureShockUntil);
      }
    } else if (lastSeenCaptureShockByTile.has(tileKey)) {
      // Shock expired or town cleared: drop the entry so the map can't grow unbounded.
      lastSeenCaptureShockByTile.delete(tileKey);
    }
  };

  return {
    clear,
    addTile,
    addFortBreachGround,
    addTownCaptureShock,
    boundaryPassed: () => Date.now() >= nextBoundary,
    commit: () => wrecks.commit(),
    dispose: () => wrecks.dispose()
  };
};
