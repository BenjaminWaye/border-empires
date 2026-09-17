// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_71: ClientChangelogEntry[] = [
  {
    createdAt: 1789114531477, // frozen, 1s after the muster-flag-reuse entry -- keeps ordering stable
    introducedIn: "2026.09.11.2",
    title: "A monument's unlock tech now shows \"already built\" once it's claimed",
    why: "Each monument (Imperial Exchange/World Engine/Aegis Dome/Astral Dock/Population Bureau/Titanium Levy) can only ever be completed once per season, and the build command already rejected a second attempt -- but the tech tree kept offering the monument's unlock tech to research for free, gold-and-resources spent, with no way to tell it had become pointless the moment someone else's assembly finished.",
    changes: [
      "A monument's unlock tech is removed from research choices for every player who doesn't already have it as soon as that monument is completed by anyone",
      "The tech tree, tech detail panel, and research command now show \"monument already built this season\" instead of a misleading \"ready to unlock\" or generic locked state"
    ]
  }
];
