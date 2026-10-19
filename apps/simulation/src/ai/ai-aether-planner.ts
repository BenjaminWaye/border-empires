import { hasInstalledAiBuildModule } from "./ai-build-unlocks.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { AETHER_EMP_RADIUS, playerHasAbilityTech } from "@border-empires/game-domain";
import { isAetherTowerSuppressed, DEVELOPMENT_PROCESS_LIMIT, observatoryCrystalSlotCostForOwnedCount, structureBuildManpowerCostScaled, structureShowsOnTile } from "@border-empires/shared";
import { createAutomationCommand } from "./automation-command-factory.js";
import { createAutomationNoopDiagnostic, type AutomationPlannerInput, type AutomationPlannerResult, type AutomationPlannerTile } from "./automation-command-planner-types.js";
import { actionAdmissionKey } from "./ai-rejection-cooldown.js";
import { at, distance, keyOf, knownShielded, valuable } from "./ai-aether-spatial.js";
import { chooseAetherRoute } from "./ai-aether-routes.js";
import { spendableBuildManpowerForPlanner } from "./automation-command-planner-war-reserve.js";

export type AiAetherAction = { type: CommandEnvelope["type"]; payload: Record<string, string | number | boolean>; value: number };

/** Tactical interrupts precede the territory policy only when they have a
 * concrete useful effect. No selectors run from snapshot builders. */
export function chooseAiAetherCommand<T extends AutomationPlannerTile>(input: AutomationPlannerInput<T>): AutomationPlannerResult | undefined {
  if (input.sessionPrefix !== "ai-runtime" || !input.tacticalView || input.hasActiveLock) return undefined;
  const view = input.tacticalView;
  const techs = input.techIds ?? [];
  const visible: T[] = [];
  const visibleMap = new Map<string, T>();
  for (const key of view.visibleTileKeys) {
    const tile = input.tilesByKey.get(key);
    if (tile) { visible.push(tile); visibleMap.set(key, tile); }
  }
  const hostile = (tile: AutomationPlannerTile): boolean => Boolean(tile.ownerId && tile.ownerId !== input.playerId && !input.nonHostilePlayerIds?.has(tile.ownerId));
  const shields = visible.filter(tile => tile.observatory || tile.economicStructure?.type === "AEGIS_DOME");
  const enemies = visible.filter(tile => tile.terrain === "LAND" && hostile(tile));
  const ownedTowerCount = input.ownedStructureCounts?.OBSERVATORY;
  const towers = ownedTowerCount === 0 ? [] : input.ownedTiles.filter(tile => tile.ownerId === input.playerId && tile.observatory?.ownerId === input.playerId && tile.observatory.status === "active");
  const ready = towers.filter(tile => !tile.observatory?.siphon && !isAetherTowerSuppressed(tile.observatory ?? undefined, input.issuedAt) && (tile.observatory?.cooldownUntil ?? 0) <= input.issuedAt && !view.dormantObservatoryKeys.includes(keyOf(tile)));
  const inRange = (tile: { x: number; y: number }): boolean => ready.some(tower => distance(tower, tile) <= view.castRange);
  const actions: AiAetherAction[] = [];
  const can = (ability: Parameters<typeof playerHasAbilityTech>[1]): boolean => playerHasAbilityTech(techs, ability);
  if (ready.length && !input.decisionCooldowns?.USE_AETHER) {
    const foodDeficit = (input.slotSupplyByResource?.FOOD ?? 0) < (input.slotDemandByResource?.FOOD ?? 0);
    for (const target of enemies) {
      if (!inRange(target)) continue;
      if (input.domainIds?.includes("afc-oracle-4") && target.observatory?.status === "active" && !isAetherTowerSuppressed(target.observatory, input.issuedAt) && !knownShielded(target, shields.filter(tile => tile.economicStructure?.type === "AEGIS_DOME"), input.issuedAt)) actions.push({ type: "SUPPRESS_AETHER_TOWER", payload: { x: target.x, y: target.y }, value: 210 });
      const tower = target.economicStructure;
      if (can("aether_emp") && tower?.type === "AMBARIC_TRANSFORMER" && tower.status === "active" && (tower.disabledUntil ?? 0) <= input.issuedAt && !knownShielded(target, shields, input.issuedAt)) {
        let count = 0;
        // Fixed-radius grid lookups, never all enemies for each transformer.
        for (let dy = -AETHER_EMP_RADIUS; dy <= AETHER_EMP_RADIUS; dy++) {
          for (let dx = -AETHER_EMP_RADIUS; dx <= AETHER_EMP_RADIUS; dx++) {
            const neighbor = at(visibleMap, target.x + dx, target.y + dy);
            if (neighbor && hostile(neighbor) && neighbor.economicStructure?.type === "AMBARIC_TRANSFORMER" &&
              neighbor.economicStructure.status === "active" && (neighbor.economicStructure.disabledUntil ?? 0) <= input.issuedAt) count++;
          }
        }
        actions.push({ type: "AETHER_EMP", payload: { x: target.x, y: target.y }, value: 120 + count * 20 });
      }
      if (can("siphon") && (target.town || target.resource) && (target.sabotage?.endsAt ?? 0) <= input.issuedAt && !knownShielded(target, shields, input.issuedAt, true)) {
        const food = target.resource === "FARM" || target.resource === "FISH";
        actions.push({ type: "SIPHON_TILE", payload: { x: target.x, y: target.y }, value: food && foodDeficit ? 200 : target.town ? 120 : 100 });
      }
      if (can("aether_lance") && (target.ownershipState === "SETTLED" || target.ownershipState === "FRONTIER") && !knownShielded(target, shields, input.issuedAt) && (valuable(target) || target.muster || target.fort || target.siegeBattery || target.economicStructure || target.observatory)) {
        actions.push({ type: "AETHER_LANCE", payload: { x: target.x, y: target.y }, value: 100 + (valuable(target) ? 30 : 0) + Math.min(60, (target.muster?.amount ?? 0) / 10) });
      }
    }
    if (input.domainIds?.includes("afc-oracle-5") && can("aether_lance")) for (const flag of input.afcDetectedFlags ?? []) {
      if (!input.nonHostilePlayerIds?.has(flag.ownerId) && flag.ownerId !== input.playerId && inRange(flag) && !knownShielded(flag, shields, input.issuedAt)) actions.push({ type: "AETHER_LANCE", payload: { x: flag.x, y: flag.y }, value: 190 });
    }
    const route = chooseAetherRoute(input, visibleMap, ready);
    if (route) actions.push(route);
    // A survey is useful only when expansion has no known destination. Its
    // result becomes a real planner objective through the worker message path.
    if (input.canConsumeSurveyResults && actions.length === 0 && can("survey_sweep") && !input.expansionObjective && enemies.length === 0 && input.frontierTiles.length > 0) {
      const tower = ready.find(tile => view.visibleTileKeys.includes(keyOf(tile)));
      if (tower) actions.push({ type: "SURVEY_SWEEP", payload: { x: tower.x, y: tower.y }, value: 60 });
    }
  }
  // Cancel a siphon against a newly friendly owner. The runtime also ends
  // siphons on ownership/shield changes; never cancel merely to churn casts.
  for (const tower of input.decisionCooldowns?.USE_AETHER ? [] : towers) {
    const siphon = tower.observatory?.siphon;
    if (!siphon) continue;
    const target = at(input.tilesByKey, siphon.targetX, siphon.targetY);
    if (target && !hostile(target)) actions.push({ type: "CANCEL_SIPHON", payload: { x: tower.x, y: tower.y }, value: 250 });
  }
  if ((ownedTowerCount ?? towers.length) < 3 && (ownedTowerCount ?? towers.length) === towers.length && !towers.some(tower => enemies.some(enemy => distance(tower, enemy) <= view.castRange)) && enemies.length > 0 && !input.decisionCooldowns?.BUILD_AETHER_TOWER && (input.slotSupplyByResource?.FOOD ?? 0) >= (input.slotDemandByResource?.FOOD ?? 0) && can("aether_lance") && hasInstalledAiBuildModule(input.installedModuleTechIds, "crystal-lattices") && input.activeDevelopmentProcessCount + (input.reservedDevelopmentSlots ?? 0) < DEVELOPMENT_PROCESS_LIMIT &&
    (input.slotSupplyByResource?.CRYSTAL ?? 0) - (input.slotDemandByResource?.CRYSTAL ?? 0) >= observatoryCrystalSlotCostForOwnedCount(ownedTowerCount ?? towers.length) && spendableBuildManpowerForPlanner(input) >= structureBuildManpowerCostScaled("OBSERVATORY", 0)) {
    // The bounded spatial focus is the placement scope; never scan every
    // owned tile per enemy or per candidate.
    for (const tile of visible) {
      if (valuable(tile) || tile.ownerId !== input.playerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND" || tile.fort || tile.observatory || tile.siegeBattery || tile.economicStructure) continue;
      if (!structureShowsOnTile("OBSERVATORY", { ownershipState: tile.ownershipState, resource: tile.resource, dockId: tile.dockId, townPopulationTier: tile.town?.populationTier, supportedTownCount: 0, supportedDockCount: 0 })) continue;
      if (!enemies.some(enemy => distance(enemy, tile) <= view.castRange)) continue;
      actions.push({ type: "BUILD_OBSERVATORY", payload: { x: tile.x, y: tile.y }, value: 80 });
      break;
    }
  }
  actions.sort((a, b) => b.value - a.value);
  for (const action of actions) {
    const command = createAutomationCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, action.type, action.payload);
    if (input.blockedActionKeys?.has(actionAdmissionKey(command))) continue;
    const diagnostic = createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "wait_and_recover");
    delete diagnostic.noCommandReason;
    diagnostic.tacticalAction = action.type;
    diagnostic.tacticalOmittedOriginCount = view.omittedOriginCount;
    diagnostic.tacticalVisibleTileCount = view.visibleTileKeys.length;
    return { command, diagnostic };
  }
  return undefined;
}
