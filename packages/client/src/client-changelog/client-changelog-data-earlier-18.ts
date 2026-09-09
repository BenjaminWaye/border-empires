// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_18: ClientChangelogEntry[] = [
  {
    createdAt: 1788466496585, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.1",
    title: "Galactic Senate v1 (backend only -- not reachable from the UI yet)",
    why: "The galactic meta-layer's Cycle economy engine (Influence/Production trickle, Stability drain/recovery) has been running live since Space View shipped, but the doc's other half -- the Senate -- didn't exist at all: no way for empires to act on each other politically, only the passive economy tick. This ships a first slice: EMBARGO and CONTEST proposals, Dominion-weighted voting, and quorum resolution on a shared galaxy-wide Cycle clock. There is no client UI for any of this yet -- it's reachable only via the new HTTP endpoints -- so no real player can trigger it today; this entry exists only because the changelog gate covers server behavior changes too.",
    changes: [
      "New endpoints: POST /hq/galaxy/senate/propose (raise an EMBARGO or CONTEST proposal against a held territory, costing Influence), POST /hq/galaxy/senate/vote (cast your Dominion-weighted vote), GET /hq/galaxy/senate (recent proposals)",
      "Proposals resolve automatically once the galaxy's shared weekly Cycle clock advances past the Cycle they were raised in, requiring both a quorum percentage of total galaxy voting weight and at least 3 distinct voters to pass",
      "A passed EMBARGO halves the target empire's Influence/Production trickle for 2 Cycles; a passed CONTEST forces the named territory's Stability to 0 immediately -- though nothing yet turns that into an actual Defense Campaign season, since no season-creation hook for it exists yet",
      "Each target has a per-action cooldown after a proposal against it resolves (1 Cycle for EMBARGO, 2 for CONTEST) before the same action can be raised against them again",
      "Weapons Inspection, Blockade, Travel Ban, War Reparations, and the Terrain vote are deliberately not included in this pass -- the first four act on Fleets, which don't exist yet"
    ]
  },
  {
    createdAt: 1788469164663, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "AI empires now truce when their manpower runs low",
    why: "An AI player's truce auto-responder judged whether to accept a truce from a stale, seed-time snapshot of its economy and territory that never reflected real battle losses, so an AI could be fighting on fumes and still keep rejecting every truce offer. The decision now reads the AI's actual current manpower straight from the simulation, and manpower -- its real remaining capacity to keep fighting -- is the only thing it weighs.",
    changes: [
      "AI players now accept a truce once their manpower runs low relative to their own cap, based on their true current strength instead of a stale snapshot"
    ]
  }
];
