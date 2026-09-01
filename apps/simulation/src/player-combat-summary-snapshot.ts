import type { SimulationRuntime } from "./runtime/runtime.js";

export type ProtoPlayerCombatSummaryRequest = { player_id: string };
export type ProtoPlayerCombatSummaryResponse = {
  ok: boolean;
  found: boolean;
  tech_ids?: string[];
  domain_ids?: string[];
  titanium_weapons_factory_count?: number;
  umbrite_weapons_factory_count?: number;
};

/**
 * GetPlayerCombatSummary gRPC handler. This is the lightweight, single-player
 * fallback attack-preview.ts falls back to when a player has no live cached
 * subscription snapshot (playerSubscriptions.snapshotForPlayer returns
 * undefined for anyone with no active websocket, e.g. an offline attack
 * target) — see attack-preview.ts's makeGetPlayerTechDomainIds /
 * makeGetPlayerFactoryCounts. Without this RPC, attack-preview.ts used to
 * fall back further to scanning the *requester's* vision-limited tile map,
 * which reproduces the false "+100% missing weapons factory" bug PR #1745
 * fixed for the ex-ally case, just triggered by "target offline" instead.
 */
export const handleGetPlayerCombatSummary = (
  runtime: SimulationRuntime,
  call: { request: ProtoPlayerCombatSummaryRequest },
  callback: (error: Error | null, response: ProtoPlayerCombatSummaryResponse) => void
): void => {
  const summary = runtime.getPlayerCombatSummary(call.request.player_id);
  if (!summary) {
    callback(null, { ok: true, found: false });
    return;
  }
  callback(null, {
    ok: true,
    found: true,
    tech_ids: summary.techIds,
    domain_ids: summary.domainIds,
    titanium_weapons_factory_count: summary.weaponsFactoryCounts.titanium,
    umbrite_weapons_factory_count: summary.weaponsFactoryCounts.umbrite
  });
};
