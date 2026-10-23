import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RECONNECT_NO_AUTH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792613911857, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.4",
    title: "No false \"Action failed\" after reconnecting",
    why: "Reconnecting after a server update could pop an \"Action failed — Error NO_AUTH: auth first\" warning even though you hadn't done anything.",
    changes: [
      "After a reconnect the game waits until your session is signed back in before asking for map data or sending queued actions",
      "A sign-in hiccup is handled by the sign-in screen instead of showing up as a failed action"
    ]
  }
];
