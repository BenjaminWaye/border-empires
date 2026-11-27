import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { ProtoSeasonArchivesResponse, ProtoSeasonSummaryRequest, ProtoSeasonSummaryResponse } from "./season-participation-rpc-handler.js";
import { landingSiteAvailable, type LandingSiteProbeRuntime } from "./landing-site-probe/landing-site-probe.js";

// GetCurrentSeasonSummary/ListSeasonArchives gRPC handlers, extracted out of
// simulation-service.ts (already well over the file-line gate's 500-line
// budget and may not grow -- see AGENTS.md's file-and-type-discipline rule).
// Both close over runtime-local `readCurrentSummary`/`readSeasonArchives`
// closures (also used elsewhere in simulation-service.ts), so those are
// passed in rather than reimplemented here.
// The landing-site probe (landing-site-probe.ts) is asked only while the
// season is active; it adds the Sector board's "no landing site" signal. A
// failing probe leaves the field out rather than failing the whole summary.
const probeLandingSite = (runtime: LandingSiteProbeRuntime): boolean | undefined => {
  try {
    return landingSiteAvailable(runtime);
  } catch {
    return undefined;
  }
};

export const handleGetCurrentSeasonSummary = (
  readCurrentSummary: () => Promise<CurrentSeasonSummary>,
  _call: { request: ProtoSeasonSummaryRequest },
  callback: (error: Error | null, response: ProtoSeasonSummaryResponse) => void,
  landingSiteRuntime?: LandingSiteProbeRuntime
): void => {
  void readCurrentSummary()
    .then((summary) => {
      const available = summary.status === "active" && landingSiteRuntime ? probeLandingSite(landingSiteRuntime) : undefined;
      const withLanding = available === undefined ? summary : { ...summary, landingSiteAvailable: available };
      callback(null, { ok: true, summary_json: JSON.stringify(withLanding) });
    })
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
