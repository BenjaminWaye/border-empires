import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TWITCH_SIGN_IN: ClientChangelogEntry[] = [
  {
    createdAt: 1791469129568, // frozen at authoring time
    introducedIn: "2026.10.08.2",
    title: "Sign in with Twitch",
    why: "Google and email were the only account sign-ins, which is a hurdle for players arriving from Twitch.",
    changes: [
      "The login screen has a new Continue with Twitch button under Continue with Google",
      "A Twitch login is its own account. It only joins an existing account when Twitch has verified that it uses the same email",
      "Loading messages after sign-in now name the service you signed in with instead of always saying Google"
    ]
  }
];
