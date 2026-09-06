import type { SeasonSummaryStore } from "./season-summary-store.js";

export type ProtoSeasonParticipationRequest = { player_id?: string };
export type ProtoSeasonParticipationResponse = {
  ok: boolean;
  participation_json?: string;
};

// Shared with GetCurrentSeasonSummary/ListSeasonArchives in
// simulation-service.ts (already over the repo's 500-line file-size gate),
// which take/return these same shapes but aren't extracted handlers
// themselves (both close over runtime-local state).
export type ProtoSeasonSummaryRequest = Record<string, never>;
export type ProtoSeasonSummaryResponse = { ok: boolean; summary_json?: string };
export type ProtoSeasonArchivesResponse = { ok: boolean; archives_json?: string };

/**
 * GetSeasonParticipationForPlayer gRPC handler, extracted out of
 * simulation-service.ts (already well over the repo's 500-line file-size
 * gate and may not grow further -- see AGENTS.md's file-and-type-discipline
 * rule), mirroring player-combat-summary-snapshot.ts's handler-extraction
 * pattern. Backs career stats (seasons played, best rank) on the player
 * profile -- see season-summary-store.ts's listParticipationForPlayer.
 */
export const handleGetSeasonParticipationForPlayer = (
  seasonSummaryStore: Pick<SeasonSummaryStore, "listParticipationForPlayer">,
  call: { request: ProtoSeasonParticipationRequest },
  callback: (error: Error | null, response: ProtoSeasonParticipationResponse) => void
): void => {
  const playerId = call.request.player_id;
  if (!playerId) {
    callback(null, { ok: false });
    return;
  }
  void seasonSummaryStore
    .listParticipationForPlayer(playerId)
    .then((rows) => callback(null, { ok: true, participation_json: JSON.stringify(rows) }))
    .catch((error) => callback(error instanceof Error ? error : new Error("failed to load season participation"), { ok: false }));
};
