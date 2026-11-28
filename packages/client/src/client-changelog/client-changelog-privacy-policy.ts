import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PRIVACY_POLICY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Updated privacy policy",
  why: "The policy should say exactly what the game and its partners do with your data.",
  changes: [
    "The privacy policy now names who runs the game, what is kept and for how long, which services we use, and your rights.",
    "It explains that usage statistics run only if you agree, and how to change your answer.",
    "The game's fonts now come from our own server instead of Google's, so loading the game no longer contacts Google for them."
  ]
};
