import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SURVEY_PIN_TAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Town survey pins open again",
  why: "Tapping a town survey's \"!\" pin on the map did nothing: the tap itself made the survey card wait as if it were an unprompted pop-up.",
  changes: ["Tapping a town survey pin opens its card straight away"]
};
