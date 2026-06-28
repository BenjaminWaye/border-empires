import {
  hasAetherBridgeCapability,
  hasSiphonCapability,
  hasLocalDevAetherWallOverride,
  hasAetherWallCapability,
  validAetherWallDirectionsForTile,
  type TileActionLogicDeps,
} from "./client-tile-action-logic.js";
import type { ClientState } from "../client-state/client-state.js";
import type { CrystalTargetingAbility, Tile } from "../client-types.js";

export const crystalTargetingTitle = (ability: CrystalTargetingAbility): string =>
  ability === "aether_bridge"
    ? "Aether Bridge"
    : ability === "aether_wall"
      ? "Aether Wall"
      : ability === "aether_emp"
        ? "Aether EMP"
        : ability === "world_engine_strike"
          ? "Worldbreaker Shot"
          : ability === "airport_bombard"
            ? "Sky Dock Bombard"
            : "Siphon";

export const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" =>
  ability === "aether_bridge" ? "cyan" : ability === "aether_wall" || ability === "aether_emp" ? "amber" : "red";

export const clearCrystalTargeting = (state: ClientState): void => {
  state.crystalTargeting.active = false;
  state.crystalTargeting.validTargets.clear();
  state.crystalTargeting.originByTarget.clear();
  state.aetherWallTargeting.active = false;
  state.aetherWallTargeting.validOrigins.clear();
};

const collectValidAetherWallOrigins = (
  state: ClientState,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY" | "keyFor" | "terrainAt">
): Set<string> => {
  const out = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (validAetherWallDirectionsForTile(state, tile, deps).length > 0) out.add(deps.keyFor(tile.x, tile.y));
  }
  return out;
};

export const computeCrystalTargets = (
  state: ClientState,
  ability: CrystalTargetingAbility,
  deps: Pick<TileActionLogicDeps, "keyFor" | "terrainAt" | "isTileOwnedByAlly" | "hostileObservatoryProtectingTile" | "selectedTile">
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  const selected = deps.selectedTile();
  const selectedKey = selected ? deps.keyFor(selected.x, selected.y) : "";
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.terrain !== "LAND") continue;
    if (ability === "aether_bridge") {
      const isCoastalLand =
        deps.terrainAt(tile.x, tile.y) === "LAND" &&
        [
          deps.terrainAt(tile.x, tile.y - 1),
          deps.terrainAt(tile.x + 1, tile.y),
          deps.terrainAt(tile.x, tile.y + 1),
          deps.terrainAt(tile.x - 1, tile.y)
        ].some((terrain) => terrain === "SEA" || terrain === "COASTAL_SEA");
      if (!isCoastalLand) continue;
      validTargets.add(deps.keyFor(tile.x, tile.y));
      continue;
    }
    if (ability === "world_engine_strike") {
      if (!selectedKey || selected?.economicStructure?.type !== "WORLD_ENGINE" || selected.economicStructure.ownerId !== state.me) continue;
      if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile) || tile.dockId) continue;
      if (!(tile.ownershipState === "SETTLED" || tile.town || tile.resource || tile.economicStructure || tile.fort || tile.observatory || tile.siegeOutpost)) continue;
      const targetKey = deps.keyFor(tile.x, tile.y);
      validTargets.add(targetKey);
      originByTarget.set(targetKey, selectedKey);
      continue;
    }
    if (ability === "airport_bombard") {
      if (!selectedKey || selected?.economicStructure?.type !== "AIRPORT" || selected.economicStructure.ownerId !== state.me) continue;
      if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile)) continue;
      const targetKey = deps.keyFor(tile.x, tile.y);
      validTargets.add(targetKey);
      originByTarget.set(targetKey, selectedKey);
      continue;
    }
    if (ability === "aether_emp") {
      if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile)) continue;
      if (deps.hostileObservatoryProtectingTile(tile)) continue;
      if (
        tile.economicStructure &&
        (tile.economicStructure.type === "AETHER_TOWER" ||
          tile.economicStructure.type === "AIRPORT" ||
          tile.economicStructure.type === "RADAR_SYSTEM" ||
          tile.economicStructure.type === "IMPERIAL_EXCHANGE" ||
          tile.economicStructure.type === "WORLD_ENGINE" ||
          tile.economicStructure.type === "AEGIS_DOME" ||
          tile.economicStructure.type === "ASTRAL_DOCK") &&
        tile.economicStructure.status === "active"
      ) {
        validTargets.add(deps.keyFor(tile.x, tile.y));
      }
      continue;
    }
    if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile)) continue;
    if (deps.hostileObservatoryProtectingTile(tile)) continue;
    if ((tile.resource || tile.town) && !tile.sabotage) validTargets.add(deps.keyFor(tile.x, tile.y));
  }
  return { validTargets, originByTarget };
};

export const beginCrystalTargeting = (
  state: ClientState,
  ability: CrystalTargetingAbility,
  deps: Pick<
    TileActionLogicDeps,
    | "keyFor"
    | "wrapX"
    | "wrapY"
    | "terrainAt"
    | "isTileOwnedByAlly"
    | "hostileObservatoryProtectingTile"
    | "abilityCooldownRemainingMs"
    | "formatCooldownShort"
    | "pushFeed"
    | "hideTileActionMenu"
    | "selectedTile"
    | "parseKey"
    | "renderHud"
  >
): void => {
  if (ability === "aether_bridge") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_bridge");
    if (!hasAetherBridgeCapability(state)) {
      deps.pushFeed("Aether Bridge requires the Aether Bridge tech.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 30) {
      deps.pushFeed("Aether Bridge needs 30 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Aether Bridge cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "siphon") {
    const cooldown = deps.abilityCooldownRemainingMs("siphon");
    if (!hasSiphonCapability(state)) {
      deps.pushFeed("Siphon requires Logistics.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 15) {
      deps.pushFeed("Siphon needs 15 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Siphon cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "world_engine_strike") {
    const cooldown = deps.abilityCooldownRemainingMs("world_engine_strike");
    const current = deps.selectedTile();
    if (!current?.economicStructure || current.economicStructure.ownerId !== state.me || current.economicStructure.type !== "WORLD_ENGINE") {
      deps.pushFeed("Select your Worldbreaker Cannon first.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 400) {
      deps.pushFeed("Worldbreaker Shot needs 400 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Worldbreaker Cannon cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "airport_bombard") {
    const current = deps.selectedTile();
    if (!current?.economicStructure || current.economicStructure.ownerId !== state.me || current.economicStructure.type !== "AIRPORT") {
      deps.pushFeed("Select your Sky Dock first.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 1) {
      deps.pushFeed("Sky Dock Bombard needs 1 CRYSTAL.", "combat", "warn");
      return;
    }
  }
  if (ability === "aether_emp") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_emp");
    if ((state.strategicResources.CRYSTAL ?? 0) < 160) {
      deps.pushFeed("Aether EMP needs 160 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Aether EMP cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "aether_wall") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_wall");
    const localhostOverride = hasLocalDevAetherWallOverride(state);
    if (!hasAetherWallCapability(state)) {
      deps.pushFeed("Aether Wall requires Aether Moorings.", "combat", "warn");
      return;
    }
    if (!localhostOverride && (state.strategicResources.CRYSTAL ?? 0) < 25) {
      deps.pushFeed("Aether Wall needs 25 CRYSTAL.", "combat", "warn");
      return;
    }
    if (!localhostOverride && cooldown > 0) {
      deps.pushFeed(`Aether Wall cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
    const validOrigins = collectValidAetherWallOrigins(state, deps);
    if (validOrigins.size === 0) {
      deps.pushFeed(`Aether Wall has no valid ${localhostOverride ? "owned" : "settled border"} origins in view.`, "combat", "warn");
      return;
    }
    state.aetherWallTargeting.active = true;
    state.aetherWallTargeting.validOrigins = validOrigins;
    deps.hideTileActionMenu();
    deps.renderHud();
    return;
  }

  const { validTargets, originByTarget } = computeCrystalTargets(state, ability, deps);
  if (validTargets.size === 0) {
    deps.pushFeed(`${crystalTargetingTitle(ability)} has no valid targets in view.`, "combat", "warn");
    return;
  }
  state.crystalTargeting.active = true;
  state.crystalTargeting.ability = ability;
  state.crystalTargeting.validTargets = validTargets;
  state.crystalTargeting.originByTarget = originByTarget;
  deps.hideTileActionMenu();
  const current = deps.selectedTile();
  if (!current || !validTargets.has(deps.keyFor(current.x, current.y))) {
    const first = [...validTargets][0];
    if (first) state.selected = deps.parseKey(first);
  }
  deps.pushFeed(`${crystalTargetingTitle(ability)} armed. Tap a highlighted target tile.`, "combat", "info");
  deps.renderHud();
};

export const executeCrystalTargeting = (
  state: ClientState,
  tile: Tile,
  deps: Pick<TileActionLogicDeps, "keyFor" | "hostileObservatoryProtectingTile" | "pushFeed" | "requireAuthedSession" | "ws" | "hideTileActionMenu">
): boolean => {
  const targetKey = deps.keyFor(tile.x, tile.y);
  if (!state.crystalTargeting.active || !state.crystalTargeting.validTargets.has(targetKey)) return false;
  if (state.crystalTargeting.ability !== "aether_bridge" && state.crystalTargeting.ability !== "world_engine_strike" && state.crystalTargeting.ability !== "airport_bombard" && deps.hostileObservatoryProtectingTile(tile)) {
    deps.pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!deps.requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "aether_bridge") {
    deps.ws.send(JSON.stringify({ type: "CAST_AETHER_BRIDGE", x: tile.x, y: tile.y }));
  } else if (ability === "aether_emp") {
    deps.ws.send(JSON.stringify({ type: "AETHER_EMP", x: tile.x, y: tile.y }));
  } else if (ability === "world_engine_strike") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const [fromX, fromY] = originKey.split(",").map((value) => Number(value));
    deps.ws.send(JSON.stringify({ type: "WORLD_ENGINE_STRIKE", fromX, fromY, toX: tile.x, toY: tile.y }));
  } else if (ability === "airport_bombard") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const [fromX, fromY] = originKey.split(",").map((value) => Number(value));
    deps.ws.send(JSON.stringify({ type: "AIRPORT_BOMBARD", fromX, fromY, toX: tile.x, toY: tile.y }));
    state.bombardFxQueue.push({ x: tile.x, y: tile.y, queuedAt: Date.now() });
  } else {
    deps.ws.send(JSON.stringify({ type: "SIPHON_TILE", x: tile.x, y: tile.y }));
    if (ability === "siphon") state.siphonFxQueue.push({ x: tile.x, y: tile.y, queuedAt: Date.now() });
  }
  clearCrystalTargeting(state);
  deps.hideTileActionMenu();
  return true;
};
