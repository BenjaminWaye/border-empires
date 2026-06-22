/**
 * Shared helper for bench files: loads the production snapshot into a
 * SimulationRuntime instance using the same bootstrap path as
 * legacy-snapshot-bootstrap.ts.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadLegacySnapshotBootstrap } from "../legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { SimulationRuntime } from "../runtime/runtime.js";

// Resolve snapshot directory.
// Priority: SNAPSHOT_DIR env var, then walk up from file location looking for
// a directory that contains state.meta.json.
const findSnapshotDir = (): string => {
  if (process.env.SNAPSHOT_DIR) return process.env.SNAPSHOT_DIR;
  // Walk up from the file location to find a snapshots/ dir.
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  // Look for snapshots/ up to 10 levels up.
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "snapshots");
    if (fs.existsSync(path.join(candidate, "state.meta.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Cannot find snapshots/ directory (set SNAPSHOT_DIR env var)");
};

export const loadProdSnapshot = (): {
  runtime: SimulationRuntime;
  playerCount: number;
  tileCount: number;
} => {
  const bootstrap = loadLegacySnapshotBootstrap(findSnapshotDir());
  const runtime = new SimulationRuntime({
    initialPlayers: bootstrap.players,
    seedTiles: bootstrap.seedTiles,
    initialState: bootstrap.initialState
  });
  return {
    runtime,
    playerCount: bootstrap.players.size,
    tileCount: bootstrap.initialState.tiles.length
  };
};
