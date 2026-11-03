import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LEGAL_PAGES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793623144481, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Finished Terms and Privacy pages",
    why: "The Terms of Service and Privacy Policy still showed draft notes and placeholder sections.",
    changes: ["Removed the draft notices", "Terms now name Swedish governing law", "Both pages list a contact email"]
  }
];
