import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AETHER_TOWER_SHOTS_CHANGELOG } from "./client-changelog-aether-tower-shots.js";
import { LEGAL_PAGES_CHANGELOG } from "./client-changelog-legal-pages.js";
import { CAPTURE_AFTERMATH_CHANGELOG } from "./client-changelog-capture-aftermath.js";
import { SHARDS_REMOVED_CHANGELOG } from "./client-changelog-shards-removed.js";
import { AFC_V3_CHANGELOG } from "./client-changelog-afc-v3.js";
import { AI_STACKED_INDUSTRY_CHANGELOG } from "./client-changelog-ai-stacked-industry.js";
import { HUD_V2_MOBILE_CHANGELOG } from "./client-changelog-hud-v2-mobile.js";
import { FLAG_STALL_LABEL_CHANGELOG } from "./client-changelog-flag-stall-label.js";
import { AI_JUNIOR_ALLIANCES_CHANGELOG } from "./client-changelog-ai-junior-alliances.js";
import { PHONE_MAP_OVERVIEW_CHANGELOG } from "./client-changelog-phone-map-overview.js";
import { TOWN_SCREEN_SUPPORT_STRUCTURE_CHANGELOG } from "./client-changelog-town-screen-support-structure.js";
import { OWNERSHIP_HELP_CHANGELOG } from "./client-changelog-ownership-help.js";
import { PROSPECT_MANIFEST_LINK_CHANGELOG } from "./client-changelog-prospect-manifest-link.js";
import { TOWN_GROWTH_PERSIST_CHANGELOG } from "./client-changelog-town-growth-persist.js";
import { TRUCE_MINUTES_CHANGELOG } from "./client-changelog-truce-minutes.js";
import { HILL_FISHING_FARM_BUILDINGS_CHANGELOG } from "./client-changelog-hill-fishing-farm-buildings.js";
import { AI_TRUCE_REASONING_CHANGELOG } from "./client-changelog-ai-truce-reasoning.js";
import { TRUCE_OFFERS_WAIT_CHANGELOG } from "./client-changelog-truce-offers-wait.js";
import { TUTORIAL_GUIDE_SCREENS_CHANGELOG } from "./client-changelog-tutorial-guide-screens.js";
import { TUTORIAL_GUIDE_TOWN_FIRST_CHANGELOG } from "./client-changelog-tutorial-guide-town-first.js";
import { COMMISSION_ON_PHONES_CHANGELOG } from "./client-changelog-commission-on-phones.js";
import { SHARPER_MINIMAP_CHANGELOG } from "./client-changelog-sharper-minimap.js";

// November 2026 topic files, grouped so client-changelog-data.ts stays under
// the 500-line limit. Add new per-topic imports here, not there.
export const NOVEMBER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793991860190, // Date.now() captured once for this entry.
    introducedIn: "2026.11.06",
    title: "Depleted salvage fields clear correctly",
    why: "The map could restore an empty salvage field after removing its Reclamation Works.",
    changes: ["Shipping the final salvage load removes both the field and its Works in the 2D and 3D maps"]
  },
  {
    createdAt: 1793991666851, // Date.now() captured once for this entry.
    introducedIn: "2026.11.06",
    title: "Resource improvements at your fingertips",
    why: "Resource improvements were buried behind other tile actions and building categories.",
    changes: [
      "Available Hydrogardens, Mines and Umbrite Rigs take the yellow primary action ahead of Relay Beacons.",
      "Build opens the Resource category first when resource improvements are listed on the selected tile."
    ]
  },

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
  ...COMMISSION_ON_PHONES_CHANGELOG,
  ...SHARPER_MINIMAP_CHANGELOG,
  ...TUTORIAL_GUIDE_TOWN_FIRST_CHANGELOG,
  ...PROSPECT_MANIFEST_LINK_CHANGELOG,
  ...FLAG_STALL_LABEL_CHANGELOG
];
