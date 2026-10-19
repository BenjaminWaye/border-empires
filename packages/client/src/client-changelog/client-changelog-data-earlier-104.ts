import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_104: ClientChangelogEntry[] = [
  {
    createdAt: 1791837136490, // Date.now() frozen for this entry
    introducedIn: "2026.10.12.1",
    title: "Soldiers now show when you attack enemy frontier land",
    why: "Launching an attack on an enemy's frontier tile showed the tile changing colour but no soldiers, so it looked like a plain expansion.",
    changes: [
      "Your soldiers now step onto the enemy frontier tile you attack and stand there until it is yours, in the 3D map (the 2D map draws no soldiers for attacks)"
    ]
  },
  {
    createdAt: 1791832192120,
    introducedIn: "2026.10.12.2",
    title: "Storm clouds over unexplored land",
    why: "The map beyond what you've explored was a black void, which made the area around your start feel dark and empty.",
    changes: [
      "Unexplored territory is now a bank of warm iron storm clouds, lit by lantern light along the edge of your known world, in both the 3D map and the 2D map",
      "Unexplored tiles bordering your land are mostly shrouded, giving just a glimpse of their terrain up to a brass edge, while every tile you've explored stays completely clear",
      "When you explore new land the clouds roll back off it with a lantern-lit glow instead of vanishing instantly",
      "Land you've explored but can't currently see now looks like a faded survey print, keeping its forests and mountains, instead of turning near-black",
      "Faint tile outlines show through the clouds, and distant terrain fades into them instead of into black"
    ]
  },
  {
    createdAt: 1791832192121,
    introducedIn: "2026.10.12.2",
    title: "No error when pressing Esc with nothing to cancel",
    why: "Pressing Esc to close a menu, with no capture running, popped up an \"Action failed: no active capture to cancel\" warning.",
    changes: ["Pressing Esc or Cancel when nothing is in progress no longer shows an error"]
  },
  {
    createdAt: 1791839075156,
    introducedIn: "2026.10.12.3",
    title: "Smoother clouds rolling back as you explore",
    why: "When you explored new land the storm clouds snapped and restarted as the newly seen tiles arrived, and trees and hills popped up through clouds that were still parting.",
    changes: [
      "The clouds now roll back off newly explored land in one smooth, slower motion, even when the land comes into view a bit at a time or you move the camera",
      "Trees, mountains and hills appear as the clouds part over them, instead of popping up through the cloud"
    ]
  },
  {
    createdAt: 1791831898352, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "The Ancillary Depot is now a dormant-body storehouse",
    why: "The Ancillary Depot was still borrowing the Logistics Guild's civic-hall art, so it didn't read as the AI Hive's body storehouse either on the 3D map or on the 2D map.",
    changes: [
      "Ancillary Depots now show as a circular storage drum of dormant Ancillary bodies, ringed by twelve blackened-iron storage pods with brass collars and small cyan seam lights, on the 3D map",
      "The 2D map's Ancillary Depot icon and its info-card art match the new storage-drum look",
      "The Ancillary Factory keeps its hopper-tower manufactory"
    ]
  },
  {
    createdAt: 1791805200000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "No more floating blue slabs after a long camera jump",
    why: "After jumping the camera from your coast to an area with no explored sea, the edge of your old coastline's water stayed behind as floating blue slabs in the dark.",
    changes: ["Water edges are now cleared properly when the camera moves somewhere without explored sea"]
  }
];
