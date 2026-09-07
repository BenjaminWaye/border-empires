import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_25: ClientChangelogEntry[] = [
  {
    createdAt: 1788587424771, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.01",
    title: "Fixed logins taking 10+ seconds",
    why: "Muster flags stamp their live status (Fighting / Planning next move) onto the tile whenever it changes, and skip the update when nothing changed. But a flag waiting on an attack that had overrun its expected resolve time reported its countdown as \"now\" on every tick, so the value looked different every time and never counted as unchanged. Each of those ticks rewrote the tile and saved a world-update record to disk, and a couple of stuck flags were enough to keep the simulation busy writing them -- which is the same thread that builds your world when you sign in, so \"Preparing your empire...\" sat there for ten seconds or more.",
    changes: [
      "Signing in is back to a couple of seconds instead of stalling on \"Preparing your empire...\"",
      "A muster flag whose attack is running long no longer floods the server with redundant status updates -- its on-map label and HUD entry are unchanged"
    ]
  }
];
