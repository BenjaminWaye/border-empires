// Galactic Holdings section of the player profile (Planets/Outposts owned,
// cross-season -- docs/galactic-campaign-design.md §3), split out of
// client-player-profile.ts to keep that file focused. Fetches from the
// public GET /hq/galaxy/by-player/:playerId route (galaxy-routes.ts), which
// resolves a season playerId to its durable authUid and returns that
// account's public holdings -- no auth needed, unlike /hq/galaxy/me.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { GalaxyHoldingsView } from "./client-player-profile-types.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);

const specializationLabel = (specialization: string): string => {
  const label = specialization.charAt(0) + specialization.slice(1).toLowerCase();
  return label.replace(/_/g, " ");
};

// One icon per victory condition (docs/galactic-campaign-design.md / README),
// so a trophy case reads as a specialization pattern at a glance rather than
// a flat count.
const TROPHY_ICON_BY_OBJECTIVE_ID: Record<string, string> = {
  TOWN_CONTROL: "🏰",
  ECONOMIC_HEGEMONY: "💰",
  RESOURCE_MONOPOLY: "🌾",
  MARITIME_SUPREMACY: "⚓",
  DIPLOMATIC_DOMINANCE: "🤝"
};

export const fetchGalaxyHoldings = async (playerId: string, wsUrl: string): Promise<GalaxyHoldingsView | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/galaxy/by-player/${encodeURIComponent(playerId)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as Partial<GalaxyHoldingsView> | undefined;
    return { planets: body?.planets ?? [], outposts: body?.outposts ?? [], trophyCase: body?.trophyCase ?? [] };
  } catch {
    return undefined;
  }
};

export const trophyCaseHtml = (holdings: GalaxyHoldingsView | "loading" | undefined): string => {
  if (holdings === "loading" || holdings === undefined) return "";
  const trophies = holdings.trophyCase ?? [];
  if (trophies.length === 0) return "";
  const items = trophies
    .map(
      (trophy) =>
        `<span class="intel-trophy" title="${escapeHtml(trophy.objectiveName)}">${TROPHY_ICON_BY_OBJECTIVE_ID[trophy.objectiveId] ?? "🏆"} ${escapeHtml(
          trophy.objectiveName
        )} ×${trophy.count}</span>`
    )
    .join("");
  return `<div class="intel-stockpile">
    <div class="intel-section-label">Career Trophy Case</div>
    <div class="intel-trophy-row">${items}</div>
  </div>`;
};

export const galaxyHoldingsHtml = (holdings: GalaxyHoldingsView | "loading" | undefined): string => {
  if (holdings === "loading" || holdings === undefined) {
    return `<div class="intel-stockpile">
      <div class="intel-section-label">Galactic Holdings</div>
      <p class="intel-summary" style="opacity:0.6">Loading…</p>
    </div>`;
  }
  if (holdings.planets.length === 0 && holdings.outposts.length === 0) return "";
  const planetItems = holdings.planets
    .map(
      (planet) =>
        `<li>${planet.planetName ? `<strong>${escapeHtml(planet.planetName)}</strong>` : "Unnamed Planet"} — ${escapeHtml(
          specializationLabel(planet.specialization)
        )} (won ${escapeHtml(planet.objectiveName)}, season ${planet.seasonSequence})</li>`
    )
    .join("");
  const outpostItems = holdings.outposts
    .map((outpost) => `<li>Outpost — ${escapeHtml(specializationLabel(outpost.specialization))} (season ${outpost.seasonSequence})</li>`)
    .join("");
  return `<div class="intel-stockpile">
    <div class="intel-section-label">Galactic Holdings</div>
    <ul class="intel-simple-list">${planetItems}${outpostItems}</ul>
  </div>`;
};
