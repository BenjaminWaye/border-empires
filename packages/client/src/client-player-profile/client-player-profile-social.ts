// Active Alliances / Active Truces section of the player profile, split out
// of client-player-profile.ts to keep that file focused, mirroring
// client-player-profile-galaxy.ts's structure. Fetches from the public
// GET /hq/social/by-player/:playerId route (social-routes.ts) -- current
// season only, sourced from the gateway's live SocialState, unlike Career
// Stats/Galactic Holdings which persist across seasons.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { SocialPublicView } from "./client-player-profile-types.js";


export const fetchPlayerSocialView = async (playerId: string, wsUrl: string): Promise<SocialPublicView | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/social/by-player/${encodeURIComponent(playerId)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as Partial<SocialPublicView> | undefined;
    if (!body) return undefined;
    return { allies: body.allies ?? [], activeTruces: body.activeTruces ?? [], truceBreaksThisSeason: body.truceBreaksThisSeason ?? [] };
  } catch {
    return undefined;
  }
};

