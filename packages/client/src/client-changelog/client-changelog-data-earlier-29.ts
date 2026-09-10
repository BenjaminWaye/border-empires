// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_29: ClientChangelogEntry[] = [
  {
    createdAt: 1788515318987, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Fixed a repeating \"tile already has structure\" error while queued buildings drain",
    why: "The server-side dev-queue auto-drain (which exists so queued builds/settles keep progressing while a player is offline) fired on every freed development slot regardless of whether the player's own client was connected and already draining the same queue -- so an online player's client and the server could both dispatch the same queued build. The loser hit a real BUILD_INVALID \"tile already has structure\" rejection once the winner's structure landed. The waypoint/expand queue already stands down while its owning client is online; the build/settle queue never got the equivalent guard.",
    changes: [
      "The server no longer auto-drains a player's build/settle queue while that player is online -- their own client now owns dispatch exclusively, the same as it already did for the waypoint/expand queue",
      "Queued builds no longer occasionally throw a spurious \"tile already has structure\" error toast"
    ]
  }
];
