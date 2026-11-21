import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REPORT_BUG_BUTTONS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Report Bug replaces Download Diagnostics",
  why: "A downloaded diagnostics file still had to be found and sent to us by hand, so most never arrived.",
  changes: [
    "Every Download diagnostics button (loading screen, sign-in screen, the slow-3D prompt and Settings) is now a Report bug button.",
    "Describe what went wrong and the same diagnostics are sent with your report automatically. There is no file to save."
  ]
};
