// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_29: ClientChangelogEntry[] = [
  {
    createdAt: 1788783720884, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.04",
    title: "Fixed: Aether Bridge landing on empty land near another player silently did nothing",
    why: "The instant-claim fix shipped earlier today skipped claiming the landing tile whenever another player's reach happened to cover that spot -- even when the ground itself was genuinely unowned by anyone. Reported live: a bridge cast onto empty land near a rival's town resolved successfully but never claimed anything, with no error shown.",
    changes: [
      "Aether Bridge now claims a genuinely unowned landing tile regardless of whose reach covers it -- it only ever declines to claim a tile another player actually owns"
    ]
  },
  {
    createdAt: 1788792846751, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: dock income display and Fort placement on Harbor Exchange docks",
    why: "Two Harbor Exchange (Customs House) bugs. First, a dock's tile-menu \"Dock income\" line always showed a flat per-dock constant -- it never reflected the connected-dock bonus or the Harbor Exchange bonus that the simulation actually pays out, so owners had no way to see the real payoff of connecting docks or building a Harbor Exchange. Second, Fort (and Palisade) could not be built on a dock tile that already had an active Harbor Exchange -- it was rejected as \"tile already has structure\", even though a Fort is explicitly allowed to share a tile with a Relay Beacon and there's no design reason Harbor Exchange should be treated differently.",
    changes: [
      "The tile menu's Dock income line now reflects the connected-dock bonus and the Harbor Exchange bonus, instead of a flat constant that ignored both",
      "Fort and Palisade can now be built on a dock tile that already has an active Harbor Exchange (Customs House) -- they share the tile, same as Fort already does with a Relay Beacon"
    ]
  },
  {
    createdAt: 1788792989599, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.06",
    title: "Fixed: muster flag ADVANCE/MARCH ignored active Aether Bridges, and battle result popped up before the fight animation finished",
    why: "Reported live: three muster flags next to a connected Aether Bridge fired ADVANCE at enemy tiles 50 tiles away instead of the ones just across the bridge, and a MARCH target on the far side made the flags try to expand around the bridge looking for a land route instead of crossing it. Separately, the battle-result popup could appear -- sometimes declaring a loss to counter-attack -- while the walking-arrow/skirmish animation hadn't finished (or hadn't even started) playing.",
    changes: [
      "ADVANCE and MARCH auto-fire now route through your active Aether Bridges the same way manual attacks and dock crossings already do, instead of only ever searching plain adjacency through owned territory",
      "A MARCH flag's own neutral-tile EXPAND (claiming empty ground on the way to its target) no longer plays the skirmish/clash animation -- claiming empty land isn't a fight, so the marching arrow now just comes to rest on the tile",
      "The battle result banner now waits for the local walking-arrow/skirmish animation to actually finish before revealing a winner, instead of firing as soon as the server's combat timer elapsed"
    ]
  },
  {
    createdAt: 1788817679731, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Fixed: tile borders could show a stale reach owner until you clicked the tile",
    why: "When a town, dock, or outpost activated or deactivated and shifted the underlying reach border, the server only ever pushed the affected player's own updated tile-key list -- it never re-sent the actual tile data (including the new reach owner) to anyone else who could see those tiles. Other players' clients kept whatever reach-owner color they'd last been shown until they happened to click the tile and force a fresh fetch, or reconnected -- so border shifts from a captured/destroyed anchor could look wrong for an indefinite amount of time.",
    changes: [
      "Every tile whose reach owner actually changes (an anchor activating, deactivating, or being contested) now gets a fresh tile update pushed to everyone who can currently see it, not just the player whose own reach changed"
    ]
  }
];
