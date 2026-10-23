import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ADVANCE_EFFORT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792736424348, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Choose an effort level when a muster flag advances, and see win chances on the slider",
    why: "Set Advance always attacked with the bare minimum, and the March To and flag commit sliders didn't show the win chance as you moved them.",
    changes: [
      "Set Advance now asks for an effort level first: Normal, Extra or Double",
      "With Extra or Double, every attack the flag launches on a defended tile commits 1.5× or 2× that tile's manpower floor, for better odds. The flag saves up the full amount before it attacks, and grows to hold it if needed",
      "The March To slider now shows the win chance at your target as you drag it",
      "A flag's commit slider shows an estimated win chance even before you've previewed the target. On an Advance flag it goes up to Double and shows the odds boost",
      "An Advance flag's percentage badge shows how full the flag is"
    ]
  }
];
