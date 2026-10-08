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
  },
  {
    createdAt: 1791469646000, // frozen at authoring time
    introducedIn: "2026.10.08.3",
    title: "Save your guest empire with Twitch",
    why: "Guests could save their empire only with Google or email, even after Twitch sign-in arrived on the login screen.",
    changes: ["The Save your empire panel has a Continue with Twitch button that keeps your guest empire and signs you in with Twitch from then on"]
  }
];
