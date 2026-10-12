import type { ClientChangelogEntry } from "./client-changelog-data.js";

// AFC orbital-landing entries, split out of client-changelog-data.ts to keep
// it under the 500-line cap.
export const CLIENT_CHANGELOG_ENTRIES_AFC_LANDING: ClientChangelogEntry[] = [
  {
    createdAt: 1791434436666,
    introducedIn: "2026.10.08.1",
    title: "Your AFC's landing has sound",
    why: "The orbital landing of your Automated Fabrication Complex played in silence.",
    changes: [
      "A rocket roar now plays as your AFC starts its landing from orbit, in both the 3D map and the 2D fallback",
      "The landing now follows the sound: thrusters at full burn as it comes in, winding down as it slows, cutting out just above the ground, then touchdown on the impact",
      "It follows your music mute and volume settings and plays over the soundtrack without interrupting it"
    ]
  },
  {
    createdAt: 1791437889049,
    introducedIn: "2026.10.08.2",
    title: "AFC landing stays put when you pan",
    why: "Panning the 3D map while your AFC was landing from orbit made the landing slide along with your view instead of staying on its tile.",
    changes: ["Your AFC's orbital landing now stays on its tile in the 3D map while you pan the camera"]
  },
  {
    createdAt: 1791450095409,
    introducedIn: "2026.10.08.3",
    title: "Tips wait for your AFC to land",
    why: "The \"First Town Discovered!\" tooltip and the New empire checklist popped up on top of the tutorial and over your AFC's landing from orbit.",
    changes: [
      "Discovery tooltips and the New empire checklist now stay hidden while the tutorial or another dialog covers the map",
      "When you join a season they appear only once your AFC has finished landing, and nothing discovered in the meantime is lost"
    ]
  },
  {
    createdAt: 1791469348919,
    introducedIn: "2026.10.08.6",
    title: "Quieter AFC landing",
    why: "The rocket roar of your AFC's landing from orbit played about three times louder than the music.",
    changes: ["The landing rocket now plays at the same loudness as the soundtrack and still follows your music volume and mute settings"]
  }
];
