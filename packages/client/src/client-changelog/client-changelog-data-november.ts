import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AETHER_TOWER_SHOTS_CHANGELOG } from "./client-changelog-aether-tower-shots.js";
import { LEGAL_PAGES_CHANGELOG } from "./client-changelog-legal-pages.js";
import { CAPTURE_AFTERMATH_CHANGELOG } from "./client-changelog-capture-aftermath.js";
import { SHARDS_REMOVED_CHANGELOG } from "./client-changelog-shards-removed.js";
import { AFC_V3_CHANGELOG } from "./client-changelog-afc-v3.js";
import { AI_STACKED_INDUSTRY_CHANGELOG } from "./client-changelog-ai-stacked-industry.js";
import { HUD_V2_MOBILE_CHANGELOG } from "./client-changelog-hud-v2-mobile.js";
import { AI_JUNIOR_ALLIANCES_CHANGELOG } from "./client-changelog-ai-junior-alliances.js";
import { PHONE_MAP_OVERVIEW_CHANGELOG } from "./client-changelog-phone-map-overview.js";
import { TOWN_SCREEN_SUPPORT_STRUCTURE_CHANGELOG } from "./client-changelog-town-screen-support-structure.js";
import { OWNERSHIP_HELP_CHANGELOG } from "./client-changelog-ownership-help.js";
import { TOWN_GROWTH_PERSIST_CHANGELOG } from "./client-changelog-town-growth-persist.js";
import { TRUCE_MINUTES_CHANGELOG } from "./client-changelog-truce-minutes.js";
import { HILL_FISHING_FARM_BUILDINGS_CHANGELOG } from "./client-changelog-hill-fishing-farm-buildings.js";
import { AI_TRUCE_REASONING_CHANGELOG } from "./client-changelog-ai-truce-reasoning.js";
import { TRUCE_OFFERS_WAIT_CHANGELOG } from "./client-changelog-truce-offers-wait.js";
import { TUTORIAL_GUIDE_SCREENS_CHANGELOG } from "./client-changelog-tutorial-guide-screens.js";

// November 2026 topic files, grouped so client-changelog-data.ts stays under
// the 500-line limit. Add new per-topic imports here, not there.
export const NOVEMBER_CHANGELOG: ClientChangelogEntry[] = [
  ...AETHER_TOWER_SHOTS_CHANGELOG,
  ...LEGAL_PAGES_CHANGELOG,
  ...CAPTURE_AFTERMATH_CHANGELOG,
  ...SHARDS_REMOVED_CHANGELOG,
  ...AFC_V3_CHANGELOG,
  ...AI_STACKED_INDUSTRY_CHANGELOG,
  ...HUD_V2_MOBILE_CHANGELOG,
  ...AI_JUNIOR_ALLIANCES_CHANGELOG,
  ...PHONE_MAP_OVERVIEW_CHANGELOG,
  ...TOWN_SCREEN_SUPPORT_STRUCTURE_CHANGELOG,
  ...OWNERSHIP_HELP_CHANGELOG,
  ...TOWN_GROWTH_PERSIST_CHANGELOG,
  ...TRUCE_MINUTES_CHANGELOG,
  ...HILL_FISHING_FARM_BUILDINGS_CHANGELOG,
  ...AI_TRUCE_REASONING_CHANGELOG,
  ...TRUCE_OFFERS_WAIT_CHANGELOG,
  ...TUTORIAL_GUIDE_SCREENS_CHANGELOG,
  {
    createdAt: 1793809444101, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fixed: Commission did nothing on phones",
    why: "On a phone, a discovery tip (such as \"First Contact!\") could sit over the bottom of the Manifest screen and take your taps, so pressing Commission did nothing. Separately, if the server never confirmed a commission, every later Commission press was ignored until you reloaded, and the reason only went to an activity feed the new HUD doesn't show.",
    changes: [
      "Discovery tips step aside while Manifest, Towns, Diplomacy or any other full screen is open, and come back when you return to the map",
      "Commission reads \"Commissioning…\" while the server confirms your order",
      "If no confirmation comes within 10 seconds, or the server turns the order away, you can press Commission again",
      "A press that can't go through now says why in an alert, for example when you are disconnected"
    ]
  }
];
