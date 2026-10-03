import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SETTLE_PROMPT_AFTER_WHATS_NEW: ClientChangelogEntry[] = [
  {
    createdAt: 1791052155804,
    introducedIn: "2026.10.03.2",
    title: "Settle from the tile menu, with auto-settle",
    why: "The \"Settle nearby tiles?\" dialog popped up over the game (and over What's New) before you had seen the map.",
    changes: [
      "The settle dialog is gone. Towns, docks and resource tiles you own now show Settle Land right in their tile menu from the start",
      "Settle Land is listed first and highlighted as recommended on towns, docks, resources and natural wonders",
      "The button says what you gain and what upkeep you take on, for example a town's food-slot upkeep and whether you are short",
      "Under it, tick \"settle automatically from now on\" to auto-settle that kind of tile (towns, farms and fish, or other resources); you can still change it in Settings"
    ]
  }
];
