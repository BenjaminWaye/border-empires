// Entry for /house.html: fetches one public House profile and renders it.
// No Firebase, telemetry, socket or game client is loaded on this page.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { PUBLIC_HOUSE_NOT_FOUND_HTML, parsePublicHouseProfile, publicHouseHtml, publicHouseMessageHtml } from "./client-public-house-view.js";
import "./client-public-house.css";
import "../client-account-title/client-account-title.css";

const wsUrl = (import.meta.env.VITE_GATEWAY_WS_URL as string | undefined) ??
  (location.hostname === "staging.borderempires.com" ? "wss://api-staging.borderempires.com/ws" : "wss://api.borderempires.com/ws");
const root = document.querySelector<HTMLElement>("#public-house")!;
const publicId = new URLSearchParams(location.search).get("h") ?? "";

const load = async (): Promise<void> => {
  if (!/^[A-Za-z0-9_-]{16}$/.test(publicId)) {
    root.innerHTML = PUBLIC_HOUSE_NOT_FOUND_HTML;
    return;
  }
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/public/house/${encodeURIComponent(publicId)}`, { headers: { Accept: "application/json" } });
    if (response.status === 404) {
      root.innerHTML = PUBLIC_HOUSE_NOT_FOUND_HTML;
      return;
    }
    const profile = response.ok ? parsePublicHouseProfile(await response.json().catch(() => undefined)) : undefined;
    if (!profile) throw new Error("unavailable");
    document.title = `${profile.name} · Border Empires`;
    root.innerHTML = publicHouseHtml(profile);
  } catch {
    root.innerHTML = publicHouseMessageHtml("Profile unavailable", "The profile could not be loaded right now. Try again in a minute.");
  }
};

void load();
