import type { AutomationPlannerDiagnostic } from "../ai/automation-command-planner-types.js";

export function mergePreplanDiagnostic(
  base: AutomationPlannerDiagnostic,
  preplanDiagnostic: AutomationPlannerDiagnostic
): AutomationPlannerDiagnostic {
  return {
    ...base,
    ...(preplanDiagnostic.preplanReason !== undefined
      ? { preplanReason: preplanDiagnostic.preplanReason }
      : {}),
    ...(typeof preplanDiagnostic.preplanNeedsEconomy === "boolean"
      ? { preplanNeedsEconomy: preplanDiagnostic.preplanNeedsEconomy }
      : {}),
    ...(typeof preplanDiagnostic.preplanNeedsFood === "boolean"
      ? { preplanNeedsFood: preplanDiagnostic.preplanNeedsFood }
      : {}),
    ...(typeof preplanDiagnostic.preplanTechChoiceAffordable === "boolean"
      ? { preplanTechChoiceAffordable: preplanDiagnostic.preplanTechChoiceAffordable }
      : {}),
    ...(typeof preplanDiagnostic.preplanDomainChoiceAffordable === "boolean"
      ? { preplanDomainChoiceAffordable: preplanDiagnostic.preplanDomainChoiceAffordable }
      : {}),
    ...(preplanDiagnostic.preplanProgressState
      ? { preplanProgressState: preplanDiagnostic.preplanProgressState }
      : {})
  } satisfies AutomationPlannerDiagnostic;
}
