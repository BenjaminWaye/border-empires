import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NAME_BOX_CONFIRM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Naming your empire on a phone",
  why: "On a phone, typing a name added it to the suggested one and the 24-character limit cut the result off. Edit Name & Colour used a browser pop-up that some in-app browsers block, so Save did nothing.",
  changes: [
    "Tapping the name box selects the suggested name, so what you type replaces it. A count shows how many of the 24 characters you have used.",
    "A name you typed on the founding screen comes back if the page reloads before you enter the map.",
    "Edit Name & Colour now asks with the game's own confirm card, and says so when you cancel."
  ]
};
