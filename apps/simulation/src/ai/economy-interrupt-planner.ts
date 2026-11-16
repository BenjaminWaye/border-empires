// Economy interrupts: free, slot-less commands that run ahead of the utility
// policy (after the aether interrupt). Each planner gates itself on cached
// counts before touching tiles.
import type { AutomationPlannerInput, AutomationPlannerResult, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { planRefineryReassignment } from "./refinery-reassign-planner.js";
import { planSalvageTribute } from "./salvage-tribute-planner.js";

export const planEconomyInterrupt = <T extends AutomationPlannerTile>(input: AutomationPlannerInput<T>): AutomationPlannerResult | undefined =>
  planRefineryReassignment(input) ?? planSalvageTribute(input);
