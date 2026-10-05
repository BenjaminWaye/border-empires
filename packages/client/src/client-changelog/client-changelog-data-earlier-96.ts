import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Historical entries aged out of the client bundle; deliberately unreferenced.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_96: ClientChangelogEntry[] = [
  { createdAt: 1790702571173, introducedIn: "2026.09.29.1", title: "Aether Towers now reliably shield your land -- even from attackers who can't see them", why: "Aether protections did not consistently block hostile abilities.", changes: ["Aether Tower protection was made consistent across abilities"] },
  { createdAt: 1790702571174, introducedIn: "2026.09.28.1", title: "Login now shows each step of building your map", why: "Map construction looked stalled after download.", changes: ["Login shows map-building progress"] },
  { createdAt: 1790702571173, introducedIn: "2026.09.22.2", title: "Seed Granary removed", why: "The upgrade overlapped the plain Granary.", changes: ["Seed Granary was retired"] },
  { createdAt: 1790702571173, introducedIn: "2026.09.27.2", title: "Attacking into a defending flag's shield is no longer an unexplained bad result", why: "Shielded attacks lacked clear feedback.", changes: ["Shielding flags are revealed when they affect a battle"] }
];
