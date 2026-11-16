// Salvage tribute (docs/product/resource-and-manpower-economy.md, "Precursor
// salvage"): an AI that owns an active Reclamation Works ships one load to
// the Court when its manpower runs low, for an Imperial delivery of
// SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE of the cap.
//
// Runs ahead of the utility policy like the refinery interrupt: it costs no
// manpower, gold or development slot. Shipping ends a site's arms bonus once
// its last load goes, so the AI only ships when short of manpower, never to
// top up. Gated on the cached structure count and the low-manpower check
// before any tile scan, so a healthy empire never walks its territory here.
import { SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE } from "@border-empires/shared";
import { createAutomationCommand } from "./automation-command-factory.js";
import { createAutomationNoopDiagnostic } from "./automation-command-planner-types.js";
import type { AutomationPlannerInput, AutomationPlannerResult, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { actionAdmissionKey } from "./ai-rejection-cooldown.js";

/** Ship a load only below this share of the manpower cap, so the whole delivery lands. */
export const AI_SALVAGE_TRIBUTE_MANPOWER_SHARE = 0.35;

export const aiShouldShipSalvage = (manpower: number, cap: number | undefined): boolean =>
  typeof cap === "number" && cap > 0 && manpower + cap * SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE <= cap &&
  manpower < cap * AI_SALVAGE_TRIBUTE_MANPOWER_SHARE;

const isShippableWorks = (playerId: string, tile: AutomationPlannerTile): boolean =>
  tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.resource === "PRECURSOR_SALVAGE" &&
  tile.economicStructure?.type === "RECLAMATION_WORKS" && tile.economicStructure.ownerId === playerId &&
  tile.economicStructure.status === "active";

/** A SHIP_SALVAGE_TO_COURT command, or undefined to fall through to the utility policy. */
export const planSalvageTribute = <T extends AutomationPlannerTile>(input: AutomationPlannerInput<T>): AutomationPlannerResult | undefined => {
  if (input.sessionPrefix !== "ai-runtime" || input.hasActiveLock) return undefined;
  if (input.ownedStructureCounts && !input.ownedStructureCounts.RECLAMATION_WORKS) return undefined;
  if (!aiShouldShipSalvage(input.manpower, input.manpowerCapacity)) return undefined;
  for (const tile of input.ownedTiles) {
    if (!isShippableWorks(input.playerId, tile)) continue;
    const command = createAutomationCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt,
      "SHIP_SALVAGE_TO_COURT", { x: tile.x, y: tile.y });
    if (input.blockedActionKeys?.has(actionAdmissionKey(command))) continue;
    const diagnostic = createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "wait_and_recover");
    delete diagnostic.noCommandReason;
    return { command, diagnostic };
  }
  return undefined;
};
