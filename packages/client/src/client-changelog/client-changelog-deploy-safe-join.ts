import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DEPLOY_SAFE_JOIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Joining during a server update now waits and reconnects",
  why: "Signing in or tapping Enter the map while the server was updating showed a raw error with the server address and asked you to reload, and the reload could lose your chosen name.",
  changes: [
    "Sign-in and Enter the map show \"Server updating\" and reconnect by themselves",
    "Your chosen name and colour are kept and your empire is founded once the server is back",
    "A Retry button appears if the update takes longer than a minute"
  ]
};
