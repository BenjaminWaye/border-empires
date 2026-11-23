/**
 * Client mirror of the simulation's module build gate
 * (apps/simulation/src/afc-module-build-access/afc-module-build-access.ts):
 * an AFC_MODULE tech counts for builds once a copy sits on an active AFC the
 * player owns on SETTLED ground -- researched or captured with the AFC.
 * Abilities and other tech effects still need research.
 */
import type { ClientState } from "../client-state/client-state.js";

type ModuleAccessState = Pick<ClientState, "tiles" | "me"> & Partial<Pick<ClientState, "tilesRevision">>;

// tilesRevision moves on every tile change; the map identity guards a new session reusing revision numbers.
const cache = new WeakMap<ClientState["tiles"], { key: string; installed: ReadonlySet<string> }>();

const scanInstalledModules = (state: ModuleAccessState): ReadonlySet<string> => {
  const installed = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.ownershipState !== "SETTLED" || tile.afc?.status !== "active") continue;
    for (const techId of tile.afc.modules ?? []) installed.add(techId);
  }
  return installed;
};

/** Module tech ids installed on the player's active, settled AFCs (House or captured copies). */
export const installedAfcModuleIds = (state: ModuleAccessState): ReadonlySet<string> => {
  if (state.tilesRevision === undefined) return scanInstalledModules(state);
  const key = `${state.tilesRevision}:${state.me}`;
  const hit = cache.get(state.tiles);
  if (hit?.key === key) return hit.installed;
  const installed = scanInstalledModules(state);
  cache.set(state.tiles, { key, installed });
  return installed;
};

export const afcModuleInstalled = (state: ModuleAccessState, techId: string): boolean => installedAfcModuleIds(state).has(techId);

/**
 * Whether techId lets the player build: researched, or an installed module
 * (a captured module needs no research). Researched-but-uninstalled modules
 * are greyed out separately by the tech-locked filter.
 */
export const hasBuildTech = (state: ModuleAccessState & Pick<ClientState, "techIds">, techId: string): boolean =>
  state.techIds.includes(techId) || afcModuleInstalled(state, techId);
