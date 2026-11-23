import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REPORT_BUG_BUTTONS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Report Bug replaces Download Diagnostics",
  why: "A downloaded diagnostics file still had to be found and sent to us by hand, so most never arrived.",
  changes: [
    "The Download diagnostics buttons on the loading screen, sign-in screen and slow-3D prompt are now Report bug buttons. In Settings, use the existing Report Bug button.",
    "Describe what went wrong and your diagnostics are sent with the report automatically. A report needs a short description.",
    "Your description may be posted publicly in our issue tracker, so leave out personal details.",
    "If the report can't be sent (for example the server is down), you can still download the diagnostics file from the report window."
  ]
};
