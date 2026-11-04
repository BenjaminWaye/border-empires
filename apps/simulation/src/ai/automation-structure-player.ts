import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { spendableBuildManpowerForPlanner } from "./automation-command-planner-war-reserve.js";
import type { StructurePlannerPlayer } from "./structure-command-planner.js";

/** The player view every structure chooser (economic, fort, siege battery,
 *  relay beacon) scores against, built once per planAutomationCommand tick. */
export const structurePlayerFromPlannerInput = <TTile extends AutomationPlannerTile>(
  input: AutomationPlannerInput<TTile>,
  totals: { settledTileCount: number; townCount: number; incomePerMinute: number }
): StructurePlannerPlayer => ({
  id: input.playerId,
  points: input.points,
  // War reserve applies to structure builds too — not raw input.manpower — except for the pool floor the muster tick leaves for builds (see spendableBuildManpowerForPlanner).
  manpower: spendableBuildManpowerForPlanner(input),
  ...(input.techIds ? { techIds: input.techIds } : {}),
  ...(input.domainIds ? { domainIds: input.domainIds } : {}),
  ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
  ...(input.installedModuleTechIds ? { installedModuleTechIds: input.installedModuleTechIds } : {}),
  ...(input.blockedActionKeys ? { blockedActionKeys: input.blockedActionKeys } : {}),
  ...(input.ownedStructureCounts ? { ownedStructureCounts: input.ownedStructureCounts } : {}),
  ...(input.slotSupplyByResource ? { slotSupplyByResource: input.slotSupplyByResource } : {}),
  ...(input.slotDemandByResource ? { slotDemandByResource: input.slotDemandByResource } : {}),
  ...(input.townEconomy ? { townEconomy: input.townEconomy } : {}),
  ...totals
});
