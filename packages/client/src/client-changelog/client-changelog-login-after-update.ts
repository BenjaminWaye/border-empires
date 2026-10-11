import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_LOGIN_AFTER_UPDATE: ClientChangelogEntry[] = [
  {
    createdAt: 1791666390595, // frozen Date.now() value for this release
    introducedIn: "2026.10.10.2",
    title: "No more long freeze on the first login after an update",
    why: "The first player to log in after a server update could sit on \"Assembling your session data\" for 30 seconds or more while the server froze for everyone, and sometimes restarted.",
    changes: [
      "The server now prepares that data while it starts up, before anyone can log in",
      "Every login also skips copying a large chunk of world data it only needed to read"
    ]
  }
];
