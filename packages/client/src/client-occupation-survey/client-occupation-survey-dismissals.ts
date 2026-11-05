import type { OccupationSurveyResource } from "../client-occupation-survey.js";

type DismissedReports = Partial<Record<OccupationSurveyResource, string>>;
type ScopeDismissals = { scope: string; reports: DismissedReports };
const STORAGE_KEY = "be:occupation-survey-dismissals:v1";
const MAX_SCOPES = 16;

const readScopes = (): ScopeDismissals[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const scopes: ScopeDismissals[] = [];
    for (const candidate of stored.slice(-MAX_SCOPES)) {
      const row: unknown = candidate;
      if (!row || typeof row !== "object" || !("scope" in row) || typeof row.scope !== "string" ||
          !("reports" in row) || !row.reports || typeof row.reports !== "object") continue;
      const reports: DismissedReports = {};
      for (const [resource, id] of Object.entries(row.reports)) {
        if ((resource === "TITANIUM" || resource === "UMBRITE" || resource === "GEMS") && typeof id === "string") {
          reports[resource] = id;
        }
      }
      scopes.push({ scope: row.scope, reports });
    }
    return scopes;
  } catch {
    return []; // Disabled storage or malformed data must not prevent playing.
  }
};

export const readSurveyDismissals = (scope: string): DismissedReports =>
  readScopes().find((row) => row.scope === scope)?.reports ?? {};

export const rememberSurveyDismissal = (scope: string, resource: OccupationSurveyResource, id: string): void => {
  const scopes = readScopes();
  const reports = scopes.find((row) => row.scope === scope)?.reports ?? {};
  reports[resource] = id; // Exactly three report IDs per player/season; new clues replace older ones.
  const updated = scopes.filter((row) => row.scope !== scope);
  updated.push({ scope, reports });
  if (updated.length > MAX_SCOPES) console.info("survey_dismissal_scopes_evicted", updated.length - MAX_SCOPES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-MAX_SCOPES)));
  } catch {
    // In-memory deduplication still works when storage is unavailable or full.
  }
};
