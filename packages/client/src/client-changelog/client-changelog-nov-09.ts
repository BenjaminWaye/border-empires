import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where these are listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const SEASON_SCORES_SAVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "See the season scores that were saved",
  why: "A season with one score sample per empire could look like it had no history.",
  changes: ["The Score Graph shows saved scores even without enough samples for a trend", "Report a bug appears next to the missing season record"]
};

export const NEUTRAL_TOWN_NAMES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Neutral towns show their names",
  why: "Only owned towns had a name banner, so the unclaimed towns worth capturing were the hard ones to pick out.",
  changes: ["Neutral towns get a name banner above them on both the 2D and 3D maps, in plain colours with no owner line"]
};

export const AI_EXPANSION_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "AI empires keep claiming open land",
  why: "Late in a season AI empires stalled with open land next to them: they kept trying attacks they had no mustered troops for, stopped building Relay Beacons as soon as any enemy touched their border, and switched beacons off to make FOOD room for other buildings.",
  changes: [
    "AI attacks only when a muster flag in range can pay for it",
    "AI keeps building Relay Beacons on quiet borders unless its core is under threat",
    "Short of FOOD, AI switches off surplus mines and rigs and fully overlapped beacons first, and keeps beacons that hold land",
    "AI only builds Hydroworks next to Hydrogardens it can actually boost",
    "AI out of FOOD offers to buy FOOD supply from Houses with spare FOOD, paying in surplus resources or coin"
  ]
};

export const ATTACK_ENDS_SUPPLY_TRADES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Attacking a House ends your supply trades with it",
  why: "Supply kept flowing to a House you were at war with until someone remembered to cancel it.",
  changes: [
    "Launching an attack on a House ends every resource supply trade between you, in both directions",
    "Pending resource offers between the two Houses are withdrawn",
    "Attacking a House you trade with asks you to confirm first, and the March To and Advance sheets warn too",
    "AI empires don't buy FOOD from a House they fought in the last 6 hours"
  ]
};

export const FLAG_SUPPLY_TRADE_CONFIRM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Flags confirm before ending supply trades",
  why: "A March or Advance flag could end your supply trades with a House without asking.",
  changes: [
    "March To, or dragging a march, onto a House you trade with asks to confirm that it ends those trades",
    "Set Advance asks too when a House you trade with is within the flag's reach, including across your docks"
  ]
};

export const REPORT_CANCEL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Cancel bug reports and suggestions",
  why: "The Cancel button did nothing in either dialog.",
  changes: ["Tap Cancel to close a bug report or suggestion without submitting it"]
};

export const AFC_CAMPAIGN_LOADOUT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Campaign Loadout is easier to read",
  why: "The AFC panel showed campaign completion below the installed upgrades.",
  changes: ["Campaign Loadout leads the AFC Upgrades panel, with the installed upgrade count directly below"]
};

export const SECTOR_WAITLIST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Join the waitlist when a Sector Contest is full",
  why: "A full Sector only offered a button that didn't record anything, so nobody could tell how many Houses were waiting.",
  changes: [
    "When the current Sector Contest is full, signed-in players can join the waitlist for the next Sector",
    "The full screen shows how many Houses are already waiting",
    "The next Sector's start is announced by the New Sector Contest email (if you have it switched on); guests are asked to sign in first"
  ]
};

export const JOIN_SCREEN_SEASON_END_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Join screen fixes after a season ends",
  why: "Opening the game after a season ended showed the join prompt, and Let's go! spun forever until you closed it.",
  changes: [
    "An ended season goes straight to the Season Concluded screen instead of the join prompt",
    "The Joining... button stops spinning as soon as the join fails",
    "The join screen uses the same look as the in-game HUD, and reads Season 13 instead of Season season-13"
  ]
};

export const HIVE_MIND_II_PREREQ_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Hive Mind Module II follows Thunderplate Induction",
  why: "The second Hive Mind came straight after the first, so extra Muster tiles didn't depend on the rest of the War line.",
  changes: [
    "Hive Mind Module II now requires the Thunderplate Induction Module instead of Hive Mind Module I, and moves to Tier 4",
    "Hive Mind Module I no longer leads to another manifest",
    "Commissioning Hive Mind Module II counts as a Tier 4 manifest, so it opens Tier 4 AFC upgrade choices"
  ]
};

export const SECTOR_CONTEST_NAME_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Seasons are now called Sector Contests",
  why: "Each round is a contest for a Sector world, so \"season\" no longer described it.",
  changes: [
    "Join screens, the end-of-contest summary, profile, rankings, galaxy view and emails say Sector Contest instead of season",
    "The join screen no longer shows the contest's internal id (\"Season season-7\")",
    "Nothing about how a contest plays, ends or resets has changed"
  ]
};

export const VICTORY_RACE_WINNER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Victory race names the season winner",
  why: "After a season was won, the Victory race banner and Ranks still said the winner was holding the path.",
  changes: [
    "Once a season is won, the Victory race banner says who won and by which path, for example \"Astrid won Economic Ascendancy\"",
    "The Ranks banner and the winning path's track say won instead of holding, and show You when you won"
  ]
};

export const MOBILE_PROFILE_SCROLL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Profile scrolls as one page on phones",
  why: "The crest and stats could scroll separately, and the stats heading could overlap profile badges.",
  changes: ["The crest, badges and stats scroll together. The page keeps its place when stats refresh."]
};

export const BRASS_DEAL_SLIDERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Brass sliders for diplomacy deals",
  why: "The bright amount controls stood out against the dark diplomacy panel.",
  changes: ["Coin and supply amounts now use a brass slider and a dark exact-amount field with larger touch targets"]
};

export const SCORE_TIMELINE_KEPT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Score Graph keeps its history",
  why: "Score samples were never reloaded after a server restart, so a crowned season could end with one score per empire and no trend.",
  changes: ["Saved score samples survive server restarts", "The Score Graph ends on each empire's score at the moment the winner is crowned"]
};

export const WAR_TREE_HIVE_MIND_HUB_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "War line converges on Hive Mind Module II",
  why: "Each War dossier hung off a single tier 3 manifest, so you could reach a capstone project without building out the rest of the War line.",
  changes: [
    "Hive Mind Module II now requires both Dread Tower Cadre and the Thunderplate Induction Module",
    "The Sovereign Siege Engine Dossier and the Aegis Dome Dossier both require Hive Mind Module II"
  ]
};
