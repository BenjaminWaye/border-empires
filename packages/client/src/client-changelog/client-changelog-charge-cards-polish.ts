import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Owner 2026-11-21: House Charges cards on desktop were too tall, the Keep bar cut them off, and a long House name broke a card.
export const CHARGE_CARDS_POLISH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "House Charges cards keep their shape",
  why: "On desktop the charge cards had grown taller than cards, the Keep bar pushed them down and cut off their bottoms, a long House name pushed a card's face past its edge, and a guest rival was named by their account id.",
  changes: [
    "Charge cards on desktop keep a card's shape; a long House letter scrolls inside the card",
    "On desktop the Keep bar floats over the cards instead of pushing them down",
    "Long House names wrap inside the card",
    "A Writ of Correction against a guest names them as everyone sees them (House Noname 4), not by their account id, and follows a rename",
    "After keeping your charges, a note says where to find them later, with Show me to open your profile"
  ]
};
