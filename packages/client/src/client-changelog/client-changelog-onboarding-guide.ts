import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ONBOARDING_GUIDE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793655195560, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "A guide that doesn't block the map",
    why: "New players asked for a tutorial again after the old intro slides were removed, but those slides covered the map.",
    changes: [
      "New accounts get a small guide card in the bottom-left corner that walks through the basics one step at a time: looking around, your first town and food, manpower, commissioning a Manifest, building, muster flags and the Activity dashboard",
      "Each step ticks off when you actually do it, in any order. The map stays free to pan and zoom the whole time",
      "Map targets are ringed on the map and Show me centres the camera on them; buttons you need to press get a glowing outline",
      "Skip any step, minimise the card, or hide the guide. Settings > Restart guide brings it back",
      "Existing accounts keep the New empire checklist"
    ]
  }
];
