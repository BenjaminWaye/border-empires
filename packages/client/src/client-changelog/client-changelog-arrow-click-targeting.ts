import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ARROW_CLICK_TARGETING: ClientChangelogEntry[] = [
  {
    createdAt: 1790887894906,
    introducedIn: "2026.09.30.6",
    title: "March-To is back to ordinary clicks, with a live win-chance preview",
    why: "The right-click-drag / long-press-drag attack gesture claimed the same mouse button (and the only touch gesture) panning uses, so a target outside the current view was unreachable while the gesture was held -- strictly worse than the plain click flow for anything off-screen. The win-chance labels were also frozen at the target's base cost the moment you started dragging, never reflecting the manpower you actually chose to commit.",
    changes: [
      "March-To is click-to-target again: click the flag, click \"March To,\" click a target tile -- pan freely in between, on both desktop and mobile, no held button or long-press",
      "Clicking the target now opens a confirm sheet (manpower slider + Normal/Extra/Double presets + Go) instead of sending immediately, with the attack arrow and win-chance labels shown from the moment you click",
      "The win-chance labels along the arrow now update live as you move the slider or tap a preset, instead of being frozen at the target's base cost"
    ]
  }
];
