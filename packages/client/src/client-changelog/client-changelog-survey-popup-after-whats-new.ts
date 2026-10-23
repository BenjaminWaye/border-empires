import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SURVEY_POPUP_AFTER_WHATS_NEW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792440623881,
    introducedIn: "2026.10.19.1",
    title: "Town survey popup waits for What's New",
    why: "The Town Survey Completed popup could appear on top of What's New or the Activity dashboard when you logged in.",
    changes: ["The town survey popup now waits until What's New, the Activity dashboard or the season lobby is closed, then appears"]
  }
];
