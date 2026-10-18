import type { DomainInfo } from "../client-types.js";

export interface AfcDetectedFlag { x: number; y: number; ownerId: string }
export interface AfcClientState {
  afcUpgradeRuleset: "afc-v1" | undefined;
  afcUpgradeInstallAllowed: boolean | undefined;
  afcDetectedFlags: AfcDetectedFlag[];
  afcInstallationOutcome: string;
  afcInstallationPreviews: Record<string, string>;
  forcedTruceCooldownUntil: number;
}
export const createInitialAfcState = (): AfcClientState => ({ afcUpgradeRuleset: undefined, afcUpgradeInstallAllowed: undefined, afcDetectedFlags: [], afcInstallationOutcome: "", afcInstallationPreviews: {}, forcedTruceCooldownUntil: 0 });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function applyAfcStateMessage(state: Partial<AfcClientState>, payload: Record<string, unknown>): void {
  if (payload.afcUpgradeRuleset === "afc-v1") state.afcUpgradeRuleset = payload.afcUpgradeRuleset;
  if (typeof payload.afcUpgradeInstallAllowed === "boolean") state.afcUpgradeInstallAllowed = payload.afcUpgradeInstallAllowed;
  if (typeof payload.forcedTruceCooldownUntil === "number") state.forcedTruceCooldownUntil = payload.forcedTruceCooldownUntil;
  if (object(payload.afcInstallationPreviews)) state.afcInstallationPreviews = Object.fromEntries(Object.entries(payload.afcInstallationPreviews).filter((entry): entry is [string, string] => typeof entry[1] === "string").slice(0, 2));
  if (payload.type === "AFC_FLAG_DETECTIONS" && Array.isArray(payload.flags)) {
    state.afcDetectedFlags = payload.flags.filter((flag): flag is AfcDetectedFlag => object(flag) && Number.isInteger(flag.x) && Number.isInteger(flag.y) && typeof flag.ownerId === "string").slice(0, 1024).map(({ x, y, ownerId }) => ({ x, y, ownerId }));
  }
  const outcome = payload.afcInstallationOutcome;
  if (object(outcome)) {
    state.afcInstallationOutcome = typeof outcome.deliveredPopulation === "number" ? `${outcome.deliveredPopulation} population delivered to your core towns.`
      : outcome.fallbackFoodSlots === 1 ? "No eligible deposit: orbital supplies provide 1 additional FOOD slot."
      : typeof outcome.deliveredBuildings === "number" ? `${outcome.deliveredBuildings} ${String(outcome.resource ?? "resource")} boosting buildings delivered.` : "";
  }
}
/** Validate the catalogue boundary once rather than introducing another untyped dependency. */
export function parseDomainCatalog(value: unknown): DomainInfo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is DomainInfo => object(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.description === "string" && typeof item.tier === "number" && typeof item.requiresTechId === "string" && object(item.mods) && object(item.requirements) && typeof item.requirements.gold === "number" && object(item.requirements.resources));
}
