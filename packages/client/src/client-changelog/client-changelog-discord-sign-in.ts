import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_DISCORD_SIGN_IN: ClientChangelogEntry[] = [
  {
    createdAt: 1791470478159, // frozen at authoring time
    introducedIn: "2026.10.08.5",
    title: "Sign in with Discord",
    why: "Google, Twitch and email were the only account sign-ins, which is a hurdle for players arriving from Discord communities.",
    changes: [
      "The login screen has a new Continue with Discord button under Continue with Twitch",
      "Guests can save their empire with Discord from the Save your empire panel",
      "A Discord login is its own account. It only joins an existing account when Discord has verified that it uses the same email"
    ]
  }
];
