import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_90: ClientChangelogEntry[] = [
  {
    createdAt: 1789926100453, // frozen, 1ms after the "Frontier tiles outside your reach..." entry (the previous newest at the time this was written)
    introducedIn: "2026.09.21.1",
    title: "New Activity dashboard shows your real combat and territory history from the last 24 hours",
    why: "The old Activity Feed only ever showed whatever happened while you had the client open, plus a lossy backfill of a handful of recent notices -- it couldn't tell you what actually happened to your empire while you were away: how much territory you gained or lost, how much gold was plundered from you or that you plundered, or how much manpower you spent attacking. The new Yours dashboard is sourced from the same durable 24h logs the server itself uses, so it's accurate even after a long time away.",
    changes: [
      "New Activity button in the HUD (next to Alerts) opens the Yours dashboard: a summary line of tiles claimed/lost, gold plundered/raided, and other counts, followed by a chronological timeline of your combat and territory events with a Center button to jump the map to each one",
      "Opens automatically, once per session, when you return to a game with new activity since you last checked",
      "If you were away more than 24 hours, the dashboard says so explicitly instead of implying the timeline covers your whole time away",
      "The existing Alerts panel (formerly \"Activity Feed\") is unchanged -- it still backfills your last 24 hours of history on login, since the new dashboard only covers combat and territory so far"
    ]
  }
];
