// Galactic Holdings section of the player profile (Planets/Outposts owned,
// cross-season -- docs/galactic-campaign-design.md §3), split out of
// client-player-profile.ts to keep that file focused. Fetches from the
// public GET /hq/galaxy/by-player/:playerId route (galaxy-routes.ts), which
// resolves a season playerId to its durable authUid and returns that
// account's public holdings -- no auth needed, unlike /hq/galaxy/me.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { GalaxyHoldingsView, GalaxyHoldingsOutpostView, GalaxyHoldingsPlanetView } from "./client-player-profile-types.js";
import { sectorNumberLabel } from "../client-galaxy-view/galaxy-sector-label.js";

// Falls back to the raw seasonSequence label only when the gateway hasn't
// been redeployed with sector numbering yet (sectorNumber absent) -- same
// reasoning as client-galaxy-view's sectorOrSeasonLabel.
export const sectorOrSeasonLabel = (holding: GalaxyHoldingsPlanetView | GalaxyHoldingsOutpostView): string =>
  holding.sectorNumber !== undefined ? sectorNumberLabel(holding.sectorNumber) : `Sector Contest ${holding.seasonSequence}`;


export const specializationLabel = (specialization: string): string => {
  const label = specialization.charAt(0) + specialization.slice(1).toLowerCase();
  return label.replace(/_/g, " ");
};

// One icon per victory condition (docs/galactic-campaign-design.md / README),
// so a trophy case reads as a specialization pattern at a glance rather than
// a flat count.
// Trophies use the simple SVG icon set (public/icons/simple), not emoji, so
// they match the rest of the HUD. Unknown objectives fall back to the cup.
const TROPHY_ICON_FILE_BY_OBJECTIVE_ID: Record<string, string> = {
  TOWN_CONTROL: "town-support",
  ECONOMIC_HEGEMONY: "gold",
  RESOURCE_MONOPOLY: "resource",
  MARITIME_SUPREMACY: "dock",
  DIPLOMATIC_DOMINANCE: "alliance"
};

// The trophy's name is always written next to the icon, so the image is decorative.
export const trophyIconHtml = (objectiveId: string): string =>
  `<img class="trophy-icon" src="/icons/simple/${Object.hasOwn(TROPHY_ICON_FILE_BY_OBJECTIVE_ID, objectiveId) ? TROPHY_ICON_FILE_BY_OBJECTIVE_ID[objectiveId] : "leaderboard"}.svg" alt="" aria-hidden="true" draggable="false">`;

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

