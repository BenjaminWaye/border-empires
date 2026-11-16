import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FASTER_LOGIN_MAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Logging in is much faster",
  why: "After the server had sent your empire, the game froze for about 20 seconds (longer on phones) working out lake shapes before it could show the map.",
  changes: ["The map now appears about 20 seconds sooner after login on desktop, and more on slower phones. The world itself is unchanged."]
};
