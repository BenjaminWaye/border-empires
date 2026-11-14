import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap: the
// late-October entries that were written inline there.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_117: ClientChangelogEntry[] = [
  {
    createdAt: 1793371350853, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30",
    title: "Land on the beaches beside a linked dock",
    why: "A sea crossing could only land on the far dock itself, so a harbour was defended by watching one tile.",
    changes: [
      "A crossing from your dock can now land on any coastal tile right next to the dock it links to, not just the dock",
      "Your coast is marked in orange wherever an enemy-held dock can land troops on it, so you can see which beaches to watch",
      "Select a dock to see its landing ground highlighted at both ends of its sea routes; the tile panel also names the docks whose crossings can land on a tile",
      "Every tile a crossing can land on (the dock and the beaches beside it) is marked with a glowing waterline and chevrons pointing ashore",
      "A beach landing is supplied through the dock you sailed from: lose that dock and the landing is cut off at once",
      "Supply lines draw the sea leg back to your home dock, with a ring on the dock the landing depends on",
      "Muster flags on Advance or March use beach landings too",
      "Barbarians holding a dock can land on those beaches as well",
      "Docks are redrawn as harbours: a stone quay with a toll house, a steam derrick and a moored paddle steamer, and a landing slipway with a beached landing barge on each beach beside it, so you can see where crossings come ashore without selecting anything",
      "Docks on east and west coasts now face the sea instead of inland"
    ]
  },
  {
    createdAt: 1793219423974, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "AI empires push reach across their own borderlands",
    why: "AI empires holding a wide band of unsettled land outside their reach stopped growing, and they never built beacons toward plain unclaimed land.",
    changes: ["AI empires now build relay beacons that carry reach across their own unsettled borderlands, and toward wide stretches of plain unclaimed land."]
  },
  {
    createdAt: 1792907228760, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.2",
    title: "Lost towns and docks name who took them",
    why: "A lost town only said \"Lost Aurienspire Ring\", with an unrounded population, and a lost Dock had no note of its own. If the town tile's own record was missing, the siege card could still say your Palisade was holding after it had fallen.",
    changes: [
      "Town cards in Yours say who took the town, or whom you took it from",
      "Town populations on those cards are rounded to whole numbers",
      "Losing or capturing a Dock gets its own note in Yours, naming the other player",
      "A siege on a town or Dock you lost now shows as fallen, even when its tile record is missing"
    ]
  },
  {
    createdAt: 1793053147136, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.3",
    title: "Natural coastlines",
    why: "Coasts stepped along the tile grid, and territory colour stopped in square steps short of the water.",
    changes: [
      "Coastlines curve naturally instead of stepping along the tile grid, with surf following the shore",
      "Beaches get a thin damp edge of sand at the waterline",
      "Territory colour runs out across the beach to the waterline and fades softly at the water's edge; where two empires meet on a coast, the beach splits cleanly between them"
    ]
  },
  {
    createdAt: 1793227144948, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.5",
    title: "Win over AI empires with gifts",
    why: "An AI that didn't think well enough of you for an alliance gave no hint how to change its mind, and the only way to win it over was overpaying in a deal.",
    changes: [
      "The deal screen has a new Gift option for AI empires: give coin or Shards and ask nothing back. It works during a truce too.",
      "Before you send it, the screen shows what the gift does, such as \"+20 (Cautious → Pleased)\", and how much more would make them Pleased, which is enough for an alliance. Suggest deal fills in that amount.",
      "Gifts and payments in deals count for up to +25 opinion in all and lose half their effect each day. A gift too small to move their opinion, or coin past that limit, can't be sent."
    ]
  },
];
