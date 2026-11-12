// Refinery field reassignment (Phase 2 of docs/territory-development-plan.md,
// "AI"): an AI refinery that holds no field (unassigned, field lost, beaten
// to its field by an older refinery) or whose field its town no longer links
// gets ASSIGN_REFINERY_FIELD onto the nearest other eligible field — the
// server's own auto-pick (chooseRefineryField), so the command is valid.
//
// Runs ahead of the utility policy like the aether interrupt: it costs no
// manpower, gold or development slot, and a refinery left idle still holds
// a FOOD slot. Gated on the AI owning a refinery at all (the cached
// structure counts), and bounded by the town list (at most 64 towns, one
// support-ring scan each) — never an owned-territory scan.
import { REFINERY_TYPES, chooseRefineryField, takenRefineryFieldIds, type RefineryTile } from "@border-empires/shared";
import { createAutomationCommand } from "./automation-command-factory.js";
import { createAutomationNoopDiagnostic } from "./automation-command-planner-types.js";
import type { AutomationPlannerInput, AutomationPlannerResult, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { actionAdmissionKey } from "./ai-rejection-cooldown.js";
import { asRefineryTiles, evaluatePlannerRefineries, refineryPlannerTowns, refineryTilesAroundTowns } from "./build/refinery-ai-view.js";

export type RefineryReassignment = { x: number; y: number; fieldX: number; fieldY: number };

/** The first (smallest tile) idle refinery with another eligible field, and that field's anchor. */
export const chooseRefineryReassignment = <T extends AutomationPlannerTile>(
  playerId: string, tilesByKey: ReadonlyMap<string, T>, towns: readonly T[], isBlocked: (target: RefineryReassignment) => boolean = () => false
): RefineryReassignment | undefined => {
  const refineries = refineryTilesAroundTowns(playerId, tilesByKey, towns);
  if (refineries.length === 0) return undefined;
  const tiles = asRefineryTiles(tilesByKey);
  const evaluations = [...evaluatePlannerRefineries(tilesByKey, refineries).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const evaluation of evaluations) {
    if (evaluation.working || evaluation.linked || !evaluation.townKey) continue;
    if (tilesByKey.get(evaluation.key)?.economicStructure?.status === "removing") continue;
    const taken = takenRefineryFieldIds(tiles, playerId, refineries as unknown as RefineryTile[], evaluation.key);
    const choice = chooseRefineryField(tiles, playerId, evaluation.type, evaluation.townKey, taken);
    if (!choice.ok || choice.fieldId === evaluation.field?.id) continue;
    const target = { x: evaluation.x, y: evaluation.y, fieldX: choice.x, fieldY: choice.y };
    if (!isBlocked(target)) return target;
  }
  return undefined;
};

/** The planner-facing wrapper: an ASSIGN_REFINERY_FIELD command, or undefined to fall through to the utility policy. */
export const planRefineryReassignment = <T extends AutomationPlannerTile>(input: AutomationPlannerInput<T>): AutomationPlannerResult | undefined => {
  if (input.sessionPrefix !== "ai-runtime" || input.hasActiveLock) return undefined;
  const counts = input.ownedStructureCounts;
  if (counts && REFINERY_TYPES.every((type) => !counts[type])) return undefined;
  const towns = refineryPlannerTowns(input.playerId, input.tilesByKey, input.townEconomy?.map((entry) => entry.townKey),
    input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles);
  const commandFor = (target: RefineryReassignment) =>
    createAutomationCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, "ASSIGN_REFINERY_FIELD", target);
  const target = chooseRefineryReassignment(input.playerId, input.tilesByKey, towns,
    (candidate) => Boolean(input.blockedActionKeys?.has(actionAdmissionKey(commandFor(candidate)))));
  if (!target) return undefined;
  const diagnostic = createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "wait_and_recover");
  delete diagnostic.noCommandReason;
  return { command: commandFor(target), diagnostic };
};
