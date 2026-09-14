// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_57: ClientChangelogEntry[] = [
  {
    createdAt: 1789221331768, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.04",
    title: "Reverted Great City/Metropolis's second support ring (again) after a live server slowdown",
    why: "Restoring the second support ring gated its extra cost on \"does this player own a Great City/Metropolis anywhere\" -- but once true, that made every support-tile check for that player scan the wider ring, including ones nowhere near the actual Great City. On a large, expansionist empire this ballooned into thousands of oversized scans per check, which stacked into multi-second server stalls and dropped connections for everyone.",
    changes: [
      "Great City and Metropolis towns are back to the standard 8-tile support ring, same as every other tier, until this can be reintroduced with a cost bound scoped to actual proximity to the wide-ring town instead of \"the player owns one somewhere\"",
      "The \"Upgrade City to Great City\" tile action no longer mentions a second ring of build tiles"
    ]
  }
];
