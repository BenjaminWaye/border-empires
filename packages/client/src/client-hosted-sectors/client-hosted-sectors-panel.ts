// "My sectors": the hosted sectors this account belongs to, with a way into
// each, and the page an invite link (/h/<code>) opens. Web only.
//
// Entering a hosted sector loads the page again with ?sector=<id>: the game
// socket is created once at page load, so a different server means a reload
// (see client-hosted-sector-session.ts).
import { HOSTED_SECTOR_MAP_SIZES, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import "./client-hosted-sectors.css";
import {
  activeHostedSectorId,
  clearHostedSectorSession,
  hostedInviteCodeFromPath,
  isAllowedHostedSectorWsUrl,
  stashHostedSectorSession
} from "./client-hosted-sector-session.js";
import type { HostedSectorSummary, HostingApi } from "./client-hosted-sectors-api.js";

export type HostedSectorsPanelDeps = {
  api: Pick<HostingApi, "listSectors" | "issueTicket" | "acceptInvite">;
  isSignedIn: () => boolean;
  /** Loads the given path; injected so tests do not navigate. */
  navigate: (path: string) => void;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  pageIsLocal: boolean;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const STATE_LABELS: Record<HostedSectorSummary["state"], string> = {
  awaiting_payment: "Waiting for payment",
  creating: "Being prepared",
  open: "Open",
  ended: "Ended, open to look around",
  deleted: "Closed",
  cancelled: "Cancelled",
  refunded: "Refunded"
};

/** This build draws one map size; a sector of another size cannot be played in it. */
export const hostedSectorFitsThisBuild = (sector: Pick<HostedSectorSummary, "options">): boolean => {
  const size = HOSTED_SECTOR_MAP_SIZES[sector.options.mapSize];
  return size.worldWidth === WORLD_WIDTH && size.worldHeight === WORLD_HEIGHT;
};

export const hostedSectorRowHtml = (sector: HostedSectorSummary, activeSectorId: string | undefined): string => {
  const title = `${sector.options.mapStyle === "islands" ? "Islands" : "Continents"}, ${sector.options.mapSize} map`;
  const status = sector.state === "creating" && sector.delayed ? "Taking longer than expected" : STATE_LABELS[sector.state];
  const enterable = sector.state === "open" || sector.state === "ended";
  const action = sector.sectorId === activeSectorId
    ? `<span class="hosted-sector-here">You are here</span>`
    : !enterable
      ? ""
      : hostedSectorFitsThisBuild(sector)
        ? `<button type="button" class="panel-btn" data-hosted-sector-enter="${escapeHtml(sector.sectorId)}">Enter</button>`
        : `<span class="hosted-sector-note">This map size can't be played here yet.</span>`;
  return `
    <li class="hosted-sector-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span class="hosted-sector-meta">${escapeHtml(status)} · ${sector.members} of ${sector.humanPlaces} places taken${sector.role === "host" ? " · You host this sector" : ""}</span>
      </div>
      ${action}
    </li>`;
};

const panelHtml = (body: string): string => `
  <div class="hosted-sectors-card sp-panel" role="dialog" aria-label="My sectors">
    <button type="button" class="hosted-sectors-close" data-hosted-sectors-close aria-label="Close">×</button>
    <h2>My sectors</h2>
    <div data-hosted-sectors-body>${body}</div>
  </div>`;

export const createHostedSectorsPanel = (deps: HostedSectorsPanelDeps) => {
  let panel: HTMLElement | undefined;

  const setBody = (html: string): void => {
    const body = panel?.querySelector<HTMLElement>("[data-hosted-sectors-body]");
    if (body) body.innerHTML = html;
  };

  const close = (): void => {
    panel?.remove();
    panel = undefined;
    if (hostedInviteCodeFromPath(window.location.pathname)) window.history.replaceState(null, "", "/");
  };

  const publicSectorRowHtml = (): string => activeHostedSectorId()
    ? `<li class="hosted-sector-row"><div><strong>The public sector</strong><span class="hosted-sector-meta">Free, always running</span></div><button type="button" class="panel-btn" data-hosted-sector-leave>Go there</button></li>`
    : `<li class="hosted-sector-row"><div><strong>The public sector</strong><span class="hosted-sector-meta">Free, always running</span></div><span class="hosted-sector-here">You are here</span></li>`;

  const showList = async (notice = ""): Promise<void> => {
    if (!deps.isSignedIn()) {
      setBody(`<p>Sign in to see your sectors.</p>`);
      return;
    }
    setBody(`<p>Loading…</p>`);
    const listed = await deps.api.listSectors();
    if (!listed.ok) {
      setBody(`<p role="alert">${escapeHtml(listed.message)}</p>`);
      return;
    }
    const rows = listed.sectors.map((sector) => hostedSectorRowHtml(sector, activeHostedSectorId())).join("");
    setBody(`
      ${notice ? `<p class="hosted-sector-notice">${escapeHtml(notice)}</p>` : ""}
      <ul class="hosted-sector-list">${publicSectorRowHtml()}${rows}</ul>
      ${listed.sectors.length === 0 ? `<p class="hosted-sector-note">You are not a member of any hosted sector. A host can send you an invite link.</p>` : ""}
      <p class="hosted-sector-error" data-hosted-sectors-error role="alert" hidden></p>`);
  };

  const showError = (message: string): void => {
    const error = panel?.querySelector<HTMLElement>("[data-hosted-sectors-error]");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  };

  const enter = async (sectorId: string): Promise<void> => {
    const issued = await deps.api.issueTicket(sectorId);
    if (!issued.ok) {
      showError(issued.message);
      return;
    }
    if (!isAllowedHostedSectorWsUrl(issued.wsUrl, deps.pageIsLocal)) {
      showError("This sector's address was not recognised, so it was not opened.");
      return;
    }
    stashHostedSectorSession({ sectorId, wsUrl: issued.wsUrl, ticket: issued.ticket, expiresAt: issued.expiresAt }, deps.storage);
    deps.navigate(`/?sector=${encodeURIComponent(sectorId)}`);
  };

  const open = (): HTMLElement => {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "hosted-sectors-panel";
    panel.innerHTML = panelHtml("");
    panel.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (!target) return;
      if (target.closest("[data-hosted-sectors-close]")) close();
      const enterButton = target.closest<HTMLElement>("[data-hosted-sector-enter]");
      if (enterButton?.dataset.hostedSectorEnter) void enter(enterButton.dataset.hostedSectorEnter);
      if (target.closest("[data-hosted-sector-leave]")) {
        clearHostedSectorSession(deps.storage);
        deps.navigate("/");
      }
    });
    // Inside #hud so it stacks with the other panels (see client-rally-links.ts).
    (document.getElementById("hud") ?? document.body).append(panel);
    return panel;
  };

  return {
    async openList(): Promise<void> {
      open();
      await showList();
    },

    /** The page an invite link opens: join, then show the list with the new sector in it. */
    async openInvite(code: string): Promise<void> {
      open();
      if (!deps.isSignedIn()) {
        setBody(`<p>You have been invited to a private Sector Contest. Sign in, then open the link again to join.</p>`);
        return;
      }
      setBody(`<p>Joining…</p>`);
      const accepted = await deps.api.acceptInvite(code);
      if (!accepted.ok) {
        setBody(`<p role="alert">${escapeHtml(accepted.message)}</p>`);
        return;
      }
      window.history.replaceState(null, "", "/");
      await showList(accepted.sector.state === "open" || accepted.sector.state === "ended" ? "You have joined. Enter when you are ready." : "You have joined. The sector is not open yet; it will appear here when it is.");
    },

    close
  };
};

/** Mounts the panel's two ways in: the settings card button and an invite link. */
export const mountHostedSectorsPanel = (deps: HostedSectorsPanelDeps): void => {
  const panel = createHostedSectorsPanel(deps);
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-hosted-sectors-open]")) void panel.openList();
  });
  const inviteCode = hostedInviteCodeFromPath(window.location.pathname);
  if (inviteCode) void panel.openInvite(inviteCode);
};
