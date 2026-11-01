import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_30_31: ClientChangelogEntry[] = [
  {
    createdAt: 1793350568452,
    introducedIn: "2026.10.30",
    title: "Resource icons stay visible when zoomed out",
    why: "Resource circles switched to plain colours before you could get a useful overview of nearby deposits.",
    changes: ["Resource markers keep their icons at every zoom level in both the 2D and 3D maps, with smoothly scaling circles and coloured rims"]
  },
  {
    createdAt: 1793441660132, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31",
    title: "Frontier resource buildings have no upkeep",
    why: "Resin Extractors, Implant Foundries, Catalyst Refineries, Cultivation Estates and Reclamation Works each used up a Food slot.",
    changes: ["These five buildings no longer use a Food slot, and a Food shortage can't shut them down. Ones you've already built free their Food slot."]
  },
  {
    createdAt: 1793392462199,
    introducedIn: "2026.10.30",
    title: "Reveal map keeps reach borders",
    why: "Revealing the map showed every empire's territory but dropped their reach borders, so the hatching that marks ground contested by rival reach disappeared too.",
    changes: [
      "Revealing the map now shows every empire's reach borders, including unowned ground held inside them",
      "Contested tiles stay hatched after a reveal in both the 2D and 3D maps"
    ]
  },
  {
    createdAt: 1793483178441,
    introducedIn: "2026.10.31",
    title: "Island and realm names stay on their land",
    why: "On the 3D map, names could slide off their island and drift as the camera moved.",
    changes: ["Island and player names stay put on the land they label while you pan and zoom"]
  },
  {
    createdAt: 1793470954153,
    introducedIn: "2026.10.31",
    title: "Ongoing battles open their battle screen",
    why: "Pressing a battle in progress sometimes only centred the map, and the side cards never showed either army's strength.",
    changes: ["Pressing a battle in the tracker zooms in on it and opens the battle screen, closing any other screen first", "Both sides show their strength and the locked odds while the battle runs", "Leaving the battle returns to your earlier zoom"]
  },
  {
    createdAt: 1793482286154,
    introducedIn: "2026.10.31",
    title: "Offers wait for the map to load",
    why: "Incoming truce and alliance offers could pop up on top of the loading screen.",
    changes: ["The diplomacy offer dock stays hidden until the map has finished loading"]
  },
  {
    createdAt: 1793485484559,
    introducedIn: "2026.10.31",
    title: "Auto-settle skips out-of-reach land after a reveal",
    why: "With the map revealed, auto-settle could keep retrying frontier tiles outside your reach that can never be settled.",
    changes: ["Auto-settle only queues frontier tiles inside your reach, with or without the map revealed"]
  },
  {
    createdAt: 1793482950000, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31",
    title: "Survey Sweep findings stay in the activity log",
    why: "Survey Sweep pings fade from the map after a few seconds, leaving no way to revisit what the sweep found.",
    changes: ["The activity log now lists the coordinates of every resource site and town a Survey Sweep finds, with a button to jump to the first one"]
  }
];
