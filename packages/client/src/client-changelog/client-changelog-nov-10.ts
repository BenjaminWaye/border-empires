import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where these are listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const NATIVE_SOCIAL_SIGN_IN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Google, Twitch and Discord sign-in in the mobile apps",
  why: "The iOS and Android apps only offered email and password, so players who used Google, Twitch or Discord on the web couldn't reach their empire on mobile.",
  changes: [
    "Continue with Google, Twitch or Discord in the iOS and Android apps, using the same account as the web",
    "Sign in with Apple in the iOS app",
    "Guests in the apps can save their empire with Google, or Apple on iOS",
    "Delete a Google, Apple, Twitch or Discord account from inside the app"
  ]
};
