import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_WIN_CHANCE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793371022107, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30",
    title: "March win chances on the map now match the tile's real odds",
    why: "The win chance labelled on a march target could read far lower than the same tile's menu, because the map ignored tech, weapons factories and missing war industry.",
    changes: [
      "Both renderers: the march target's win-chance label and the March To sheet now use the server's full combat odds, the same as the tile menu",
      "Tiles the arrow crosses on the way still show an estimate"
    ]
  }
];
