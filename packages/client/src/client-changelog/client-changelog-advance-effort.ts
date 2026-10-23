import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ADVANCE_EFFORT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792736424348, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Choose an effort level when a muster flag advances, and see win chances on the slider",
    why: "Set Advance always attacked with the bare minimum, and the March To and flag commit sliders didn't show the win chance as you moved them.",
    changes: [
      "Set Advance now asks for an effort level first: Normal, Extra or Double",
      "With Extra or Double, every attack the flag launches commits 1.5× or 2× that target's manpower floor, for better odds against defended tiles. The flag saves up the full amount before it attacks",
      "The March To slider now shows the win chance at your target as you drag it, and warns you if a tile on the way is harder to take",
      "A flag's commit slider shows an estimated win chance even before you've previewed the target, and shows the odds boost for an Advance flag"
    ]
  }
];
