// True-3D capture aftermath (see client-capture-aftermath.ts): rubble chunks
// for a razed Relay Beacon / Siege Battery or a wrecked captured fort, and
// burning smoke over a captured resource. The 2D counterpart is
// client-map-2d-capture-aftermath.ts. Also draws battle scars (24h, see
// client-map-3d-war-scars.ts), and owns the captured-town smoke and
// "-N pop" text, extracted from client-map-3d.ts so it stays under its line
// budget.
//
// Rebuilt with the terrain (clear/add*/commit, like the village smoke it
// reuses). boundaryPassed() asks for one more rebuild when the earliest
// aftermath on screen ends, so the wreckage clears on time on a still camera.
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import { liveWarScarLevel } from "@border-empires/shared";
import { captureAftermathForTile, type CaptureRubbleKind } from "./client-capture-aftermath/client-capture-aftermath.js";
import { createWarScarLayer3D } from "./client-map-3d-war-scars.js";
import type { VillageEffects } from "./client-map-3d-village-fx.js";
import type { Tile } from "./client-types.js";

const MAX_RUBBLE_TILES = 256;
const PIECES_PER_KIND = 9;
const MAX_PIECES = MAX_RUBBLE_TILES * PIECES_PER_KIND * 2;

// Stone for a fort, dark alloy with a few cyan cores for a beacon, scorched
// timber and iron for a siege battery.
const RUBBLE_PALETTE: Record<CaptureRubbleKind, readonly string[]> = {
  FORT: ["#8d8a82", "#6f6c66", "#a39f95", "#5b5852"],
  RELAY_BEACON: ["#4a5058", "#363b42", "#5f6670", "#4fd6e0"],
  SIEGE_BATTERY: ["#5a4330", "#3e2f22", "#55585c", "#2d2b29"]
};
// Wreckage lies in a ring around the tile centre: inside a fort's own walls
// would be hidden by the standing model, while a razed structure leaves its
// pile right where it stood.
const RING: Record<CaptureRubbleKind, { inner: number; outer: number }> = {
  FORT: { inner: 0.3, outer: 0.46 },
  RELAY_BEACON: { inner: 0, outer: 0.3 },
  SIEGE_BATTERY: { inner: 0, outer: 0.32 }
};

export type CaptureAftermathFx3D = {
  readonly clear: () => void;
  /** Rubble, resource smoke and battle scars for one visible land tile. */
  readonly addTile: (tile: Tile, tileKey: string, x: number, z: number, surfaceY: number, seed: number) => void;
  /** Captured-town smoke plus a one-off "-N pop" when a new capture shock is first seen. */
  readonly addTownCaptureShock: (tile: Tile | undefined, tileKey: string, x: number, z: number, surfaceY: number, seed: number, spawnText: (text: string) => void) => void;
  readonly boundaryPassed: () => boolean;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// Small deterministic PRNG so a tile's rubble doesn't reshuffle every rebuild.
const seededRandom = (seed: number): (() => number) => {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export const createCaptureAftermathFx3D = (scene: Scene, villageEffects: Pick<VillageEffects, "addCapturedTownSmoke">): CaptureAftermathFx3D => {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0.1 });
  const mesh = new InstancedMesh(geometry, material, MAX_PIECES);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const lastSeenCaptureShockByTile = new Map<string, number>();
  const warScars = createWarScarLayer3D(scene);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const color = new Color();
  const euler = new Vector3();
  let pieces = 0;
  let rubbleTiles = 0;
  let nextBoundary = Number.POSITIVE_INFINITY;

  const addRubble = (kind: CaptureRubbleKind, x: number, z: number, surfaceY: number, seed: number): void => {
    const random = seededRandom(seed * 31 + kind.length * 977);
    const palette = RUBBLE_PALETTE[kind];
    const ring = RING[kind];
    for (let i = 0; i < PIECES_PER_KIND && pieces < MAX_PIECES; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = ring.inner + random() * (ring.outer - ring.inner);
      const size = 0.05 + random() * 0.09;
      scale.set(size * (0.8 + random() * 0.8), size * (0.5 + random() * 0.6), size * (0.8 + random() * 0.8));
      position.set(x + Math.cos(angle) * radius, surfaceY + scale.y * 0.4, z + Math.sin(angle) * radius);
      euler.set(random() * 0.9, random() * Math.PI, random() * 0.9);
      rotation.setFromAxisAngle(euler.clone().normalize(), euler.length());
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(pieces, matrix);
      mesh.setColorAt(pieces, color.set(palette[Math.floor(random() * palette.length)] ?? palette[0]!));
      pieces += 1;
    }
  };

  const clear = (): void => {
    pieces = 0;
    rubbleTiles = 0;
    nextBoundary = Number.POSITIVE_INFINITY;
    warScars.clear();
  };

  const addTile = (tile: Tile, tileKey: string, x: number, z: number, surfaceY: number, seed: number): void => {
    const scarLevel = liveWarScarLevel(tile, Date.now());
    if (scarLevel > 0) {
      warScars.addTile(scarLevel, x, z, surfaceY, seed);
      nextBoundary = Math.min(nextBoundary, tile.warScarUntil!);
    }
    const aftermath = captureAftermathForTile(tile, tileKey);
    if (!aftermath) return;
    nextBoundary = Math.min(nextBoundary, aftermath.until);
    if (aftermath.smoke) villageEffects.addCapturedTownSmoke(x, z, surfaceY, seed);
    if (aftermath.rubble.length === 0 || rubbleTiles >= MAX_RUBBLE_TILES) return;
    rubbleTiles += 1;
    for (const kind of aftermath.rubble) addRubble(kind, x, z, surfaceY, seed);
  };

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

  const commit = (): void => {
    mesh.count = pieces;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    warScars.commit();
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    mesh.dispose();
    warScars.dispose();
  };

  return { clear, addTile, addTownCaptureShock, boundaryPassed: () => Date.now() >= nextBoundary, commit, dispose };
};
