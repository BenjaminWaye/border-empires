// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_14: ClientChangelogEntry[] = [
  {
    createdAt: 1788466200000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.02",
    title: "Abandoning a tile no longer destroys what you built on it",
    why: "Abandon Territory wiped every structure off the tile -- fort, Aether Tower, economic structure -- with no warning and no refund, even though losing the very same tile to an attacker leaves the buildings standing and simply hands them over. Giving a tile up shouldn't be more destructive than being conquered.",
    changes: [
      "Abandoning a tile now leaves its fort, Aether Tower and economic structure standing on the neutral tile; whoever claims the tile next inherits them, exactly as with a capture",
      "Siege outposts and Relay Beacons are still razed, and half-built structures still don't survive -- the same things a capture razes",
      "A structure sitting on neutral land is inert: no vision, no income, no reach, no crystal casting, and it occupies no resource slots for anyone",
      "The Abandon Territory action now spells out what happens before you use it"
    ]
  },
  {
    createdAt: 1788381842650, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.18",
    title: "The season's deadliest tile now counts the whole season, not just since the last update",
    why: "Each tile's running total of manpower lost to combat -- the number behind the end-of-season \"deadliest tile\" -- was only ever held in the server's memory, so every deploy silently reset it to zero. A season that saw its bloodiest fighting before an update would crown whichever tile happened to be worst since then instead of the real one. Those totals are now saved, so they carry across restarts and the end-of-season stat reflects the full season.",
    changes: [
      "The end-of-season deadliest tile is now measured across the entire season instead of resetting whenever the server restarts"
    ]
  },
  {
    createdAt: 1788382568610, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.19",
    title: "Today's activity numbers no longer reset when the server restarts",
    why: "The wars, territory momentum, biggest swing, frontline hotspots and manpower-lost figures are all presented as a trailing 24 hours, but they were built from logs kept only in the server's memory. Every update wiped them, so \"today\" quietly became \"since the last update\" -- wrong rather than obviously missing. Those feeds are now saved and reloaded on restart, with anything genuinely older than 24h still dropped.",
    changes: [
      "Activity figures covering the last 24 hours now survive a server restart instead of starting over"
    ]
  },
  {
    createdAt: 1788509411185, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.3",
    title: "Daily activity digest: better headlines, and combat losses now credit the right player",
    why: "The digest ranked its headlines by each event's raw number, so a routine manpower-cap tick (naturally in the hundreds-to-thousands) always beat a genuinely bigger tile swing (naturally in the tens-to-low-hundreds) regardless of which actually mattered more that day. It also narrated the same border conflict up to four separate times (once per event type) with no memory of what it had already said. Manpower spent on attacks is now credited to whoever's actually paying for it -- barbarian-origin attacks are excluded from the new headlines below since barbarians never spend manpower on their own attacks.",
    changes: [
      "Every headline type is now scored on a comparable scale, so a big tile swing or war can outrank a routine growth tick instead of always losing to it on raw magnitude",
      "Once a player or pair anchors the day's top headline, a lower-ranked headline that would only re-tell the same story about the same players is now skipped instead of padding the digest",
      "Added \"Fiercest Attacker\": the player who spent the most manpower attacking today",
      "Added \"Toughest Target\": the player attackers spent the most manpower trying to dislodge today, including when they held their ground and lost nothing"
    ]
  },
  {
    createdAt: 1788452000000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed frontier decay pulse still animating on tiles now protected by contested (enemy) reach",
    why: "A frontier tile claimed outside your reach gets a decay timer, but a tile already decaying was only re-checked for reach coverage at the moment it expired -- if an enemy's reach expanded over it mid-countdown (making it contested, no-man's-land-exempt ground), the tile kept visibly pulsing/counting down for the rest of the window even though it was already protected. The tile menu's fallback status text for an out-of-reach FRONTIER tile with no active timer also read as a plain \"Outside reach\", which didn't say why there was no timer.",
    changes: [
      "A frontier tile's decay timer now clears immediately once any player's live reach (including an enemy's) catches up to it, instead of only at expiry -- the 3D map's decay pulse animation stops right away instead of continuing to count down on already-protected ground",
      "The tile menu now shows \"Inside Enemy Reach\" instead of \"Outside reach\" for an owned frontier tile that's outside your own reach but exempt from decay because it's contested by another player's reach"
    ]
  },
  {
    createdAt: 1788459000000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.4",
    title: "Fixed the out-of-reach decay countdown never showing, so an expanded tile could vanish with no warning",
    why: "The gateway's tile normalizer only ever passed a frontier decay kind of \"ENCIRCLEMENT\" through to the client, silently dropping \"OUT_OF_REACH\" -- a leftover from before that second decay kind existed. Expanding onto a tile outside your reach still stamped a real decay deadline, but the client only ever saw the deadline timestamp with no matching kind, so it could never resolve a countdown to show. The tile just silently expired and disappeared with no warning shown anywhere.",
    changes: [
      "Expanding or capturing a tile outside your reach now correctly shows its \"Beyond your reach — decays in Xs\" countdown in the tile menu, instead of showing nothing until the tile vanished"
    ]
  }
];
