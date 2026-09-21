import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { ProtoSeasonArchivesResponse, ProtoSeasonSummaryRequest, ProtoSeasonSummaryResponse } from "./season-participation-rpc-handler.js";

// GetCurrentSeasonSummary/ListSeasonArchives gRPC handlers, extracted out of
// simulation-service.ts (already well over the file-line gate's 500-line
// budget and may not grow -- see AGENTS.md's file-and-type-discipline rule).
// Both close over runtime-local `readCurrentSummary`/`readSeasonArchives`
// closures (also used elsewhere in simulation-service.ts), so those are
// passed in rather than reimplemented here.
export const handleGetCurrentSeasonSummary = (
  readCurrentSummary: () => Promise<CurrentSeasonSummary>,
  _call: { request: ProtoSeasonSummaryRequest },
  callback: (error: Error | null, response: ProtoSeasonSummaryResponse) => void
): void => {
  void readCurrentSummary()
    .then((summary) => callback(null, { ok: true, summary_json: JSON.stringify(summary) }))
    .catch((error) => callback(error instanceof Error ? error : new Error("failed to load current season summary"), { ok: false }));
};

export const handleListSeasonArchives = (
  readSeasonArchives: () => Promise<SeasonArchiveRow[]>,
  _call: { request: ProtoSeasonSummaryRequest },
  callback: (error: Error | null, response: ProtoSeasonArchivesResponse) => void
): void => {
  void readSeasonArchives()
    .then((archives) => callback(null, { ok: true, archives_json: JSON.stringify(archives) }))
    .catch((error) => callback(error instanceof Error ? error : new Error("failed to load season archives"), { ok: false }));
};
