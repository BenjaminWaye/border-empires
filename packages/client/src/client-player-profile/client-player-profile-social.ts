// Active Alliances / Active Truces section of the player profile, split out
// of client-player-profile.ts to keep that file focused, mirroring
// client-player-profile-galaxy.ts's structure. Fetches from the public
// GET /hq/social/by-player/:playerId route (social-routes.ts) -- current
// season only, sourced from the gateway's live SocialState, unlike Career
// Stats/Galactic Holdings which persist across seasons.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";
import type { SocialPublicView } from "./client-player-profile-types.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);

export const fetchPlayerSocialView = async (playerId: string, wsUrl: string): Promise<SocialPublicView | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/social/by-player/${encodeURIComponent(playerId)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as Partial<SocialPublicView> | undefined;
    if (!body) return undefined;
    return { allies: body.allies ?? [], activeTruces: body.activeTruces ?? [] };
  } catch {
    return undefined;
  }
};

export const playerSocialHtml = (
  view: SocialPublicView | "loading" | undefined,
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  nowMs: number
): string => {
  if (view === "loading" || view === undefined) return "";
  if (view.allies.length === 0 && view.activeTruces.length === 0) return "";
  const alliesHtml = view.allies.length > 0
    ? `<div class="intel-stockpile">
        <div class="intel-section-label">Active Alliances</div>
        <ul class="intel-simple-list">
          ${view.allies.map((id) => `<li>${escapeHtml(playerNameForOwner(id) ?? `ID: ${id.slice(0, 8)}`)}</li>`).join("")}
        </ul>
      </div>`
    : "";
  const trucesHtml = view.activeTruces.length > 0
    ? `<div class="intel-stockpile">
        <div class="intel-section-label">Active Truces</div>
        <ul class="intel-simple-list">
          ${view.activeTruces
            .map(
              (truce) =>
                `<li>${escapeHtml(truce.otherPlayerName)} — ${socialRemainingLabel(truce.endsAt, nowMs)} remaining</li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";
  return `${alliesHtml}${trucesHtml}`;
};
