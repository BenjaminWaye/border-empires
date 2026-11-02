import type { DomainInfo } from "../client-types.js";
export { aetherHijackAlertFeedEntry } from "./client-afc-alerts.js";

/** One Resonance Hijack in progress that involves this House (as attacker or victim). */
export interface AfcHijackView { targetX: number; targetY: number; casterX: number; casterY: number; attackerId: string; victimId: string; startedAt: number; endsAt: number }
/** A finished hijack, kept briefly so both renderers can play its ending. */
export interface AfcHijackOutcomeView { targetX: number; targetY: number; casterX?: number; casterY?: number; attackerId: string; victimId: string; status: "succeeded" | "failed"; at: number }
/** Breakthrough Protocol surrender, kept briefly for the map effect. */
export interface AfcBreakthroughView { attackerId: string; fromX: number; fromY: number; tiles: Array<{ x: number; y: number }>; at: number }
export interface AfcClientState {
  afcUpgradeRuleset: "afc-v1" | undefined;
  afcUpgradeInstallAllowed: boolean | undefined;
  afcInstallationOutcome: string;
  afcInstallationPreviews: Record<string, string>;
  forcedTruceCooldownUntil: number;
  hijackReadyAt: number;
  freeFortsUsed: number;
  afcHijacks: AfcHijackView[];
  afcHijackOutcomes: AfcHijackOutcomeView[];
  afcBreakthroughs: AfcBreakthroughView[];
}
export const createInitialAfcState = (): AfcClientState => ({ afcUpgradeRuleset: undefined, afcUpgradeInstallAllowed: undefined, afcInstallationOutcome: "", afcInstallationPreviews: {}, forcedTruceCooldownUntil: 0, hijackReadyAt: 0, freeFortsUsed: 0, afcHijacks: [], afcHijackOutcomes: [], afcBreakthroughs: [] });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function applyAfcStateMessage(state: Partial<AfcClientState>, payload: Record<string, unknown>): void {
  if (payload.afcUpgradeRuleset === "afc-v1") state.afcUpgradeRuleset = payload.afcUpgradeRuleset;
  if (typeof payload.afcUpgradeInstallAllowed === "boolean") state.afcUpgradeInstallAllowed = payload.afcUpgradeInstallAllowed;
  if (typeof payload.forcedTruceCooldownUntil === "number") state.forcedTruceCooldownUntil = payload.forcedTruceCooldownUntil;
  if (object(payload.afcCampaign)) {
    if (typeof payload.afcCampaign.hijackReadyAt === "number") state.hijackReadyAt = payload.afcCampaign.hijackReadyAt;
    if (typeof payload.afcCampaign.freeFortsUsed === "number") state.freeFortsUsed = payload.afcCampaign.freeFortsUsed;
  }
  applyAfcHijackMessage(state, payload);
  if (object(payload.afcInstallationPreviews)) state.afcInstallationPreviews = Object.fromEntries(Object.entries(payload.afcInstallationPreviews).filter((entry): entry is [string, string] => typeof entry[1] === "string").slice(0, 2));
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

const int = (value: unknown): value is number => Number.isInteger(value);
const parseHijack = (value: unknown): AfcHijackView | undefined => {
  if (!object(value) || !int(value.targetX) || !int(value.targetY) || !int(value.casterX) || !int(value.casterY) || typeof value.attackerId !== "string" || typeof value.victimId !== "string" || typeof value.startedAt !== "number" || typeof value.endsAt !== "number") return undefined;
  return { targetX: value.targetX, targetY: value.targetY, casterX: value.casterX, casterY: value.casterY, attackerId: value.attackerId, victimId: value.victimId, startedAt: value.startedAt, endsAt: value.endsAt };
};
/** Effects stay on screen this long after their event; older ones are dropped so the lists stay bounded. */
export const AFC_MAP_EFFECT_TTL_MS = 6_000;
const recent = <T extends { at: number }>(items: T[] | undefined, now: number): T[] => (items ?? []).filter(item => now - item.at < AFC_MAP_EFFECT_TTL_MS).slice(-16);
/** AFC_HIJACKS (full replacement list), AFC_HIJACK_OUTCOME and AFC_BREAKTHROUGH pushes. */
export function applyAfcHijackMessage(state: Partial<AfcClientState>, payload: Record<string, unknown>, now = Date.now()): boolean {
  if (payload.type === "AFC_HIJACKS" && Array.isArray(payload.hijacks)) {
    state.afcHijacks = payload.hijacks.map(parseHijack).filter((view): view is AfcHijackView => Boolean(view)).slice(0, 64);
    return true;
  }
  if (payload.type === "AFC_HIJACK_OUTCOME" && int(payload.targetX) && int(payload.targetY) && typeof payload.attackerId === "string" && typeof payload.victimId === "string" && (payload.status === "succeeded" || payload.status === "failed")) {
    const running = state.afcHijacks?.find(view => view.targetX === payload.targetX && view.targetY === payload.targetY);
    state.afcHijackOutcomes = [...recent(state.afcHijackOutcomes, now), { targetX: payload.targetX, targetY: payload.targetY, attackerId: payload.attackerId, victimId: payload.victimId, status: payload.status, at: now, ...(running ? { casterX: running.casterX, casterY: running.casterY } : {}) }];
    return true;
  }
  if (payload.type === "AFC_BREAKTHROUGH" && typeof payload.attackerId === "string" && int(payload.fromX) && int(payload.fromY) && Array.isArray(payload.tiles)) {
    const tiles = payload.tiles.filter((tile): tile is { x: number; y: number } => object(tile) && int(tile.x) && int(tile.y)).slice(0, 8).map(({ x, y }) => ({ x, y }));
    if (tiles.length) state.afcBreakthroughs = [...recent(state.afcBreakthroughs, now), { attackerId: payload.attackerId, fromX: payload.fromX, fromY: payload.fromY, tiles, at: now }];
    return true;
  }
  return false;
}
