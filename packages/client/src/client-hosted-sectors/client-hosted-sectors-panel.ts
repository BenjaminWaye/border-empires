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
  stashHostedSectorSession,
  type StorageLike
} from "./client-hosted-sector-session.js";
import { fundingRowHtml, readChipInCents } from "./client-hosted-sector-funding.js";
import { CHECKOUT_CONSENT, hostSectorFormHtml, isAllowedCheckoutUrl, readHostSectorForm } from "./client-hosted-sector-order.js";
import type { HostedSectorSummary, HostingApi } from "./client-hosted-sectors-api.js";

export type HostedSectorsPanelDeps = {
  api: Pick<HostingApi, "listSectors" | "issueTicket" | "acceptInvite" | "createOrder" | "createInvite" | "openFundingBar" | "contribute">;
  /** Where invite links point, for example https://play.borderempires.com. */
  shareOrigin: string;
  /** How often the list is refreshed while a sector is being prepared. 0 turns it off. */
  refreshMs?: number;
  isSignedIn: () => boolean;
  /** Loads the given path; injected so tests do not navigate. */
  navigate: (path: string) => void;
  storage: StorageLike | undefined;
  pageIsLocal: boolean;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const STATE_LABELS: Record<HostedSectorSummary["state"], string> = {
  awaiting_payment: "Waiting for payment",
  funding: "Being funded",
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
  const invitable = sector.role === "host" && (sector.state === "awaiting_payment" || sector.state === "funding" || sector.state === "creating" || sector.state === "open");
  const hostActions = `${sector.role === "host" && sector.state === "awaiting_payment" && sector.checkoutUrl ? `<button type="button" class="panel-btn" data-hosted-sector-pay="${escapeHtml(sector.sectorId)}">Pay</button>` : ""}${invitable ? `<button type="button" class="panel-btn" data-hosted-sector-invite="${escapeHtml(sector.sectorId)}">Invite</button>` : ""}`;
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
        ${fundingRowHtml(sector, Date.now())}
      </div>
      <div class="hosted-sector-actions">${hostActions}${action}</div>
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
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  /** Payment pages by sector, from the last list; never taken from the page's own markup. */
  const checkoutUrls = new Map<string, string>();
  const stopRefresh = (): void => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = undefined; };

  const setBody = (html: string): void => {
    const body = panel?.querySelector<HTMLElement>("[data-hosted-sectors-body]");
    if (body) body.innerHTML = html;
  };

  const close = (): void => {
    stopRefresh();
    panel?.remove();
    panel = undefined;
    if (hostedInviteCodeFromPath(window.location.pathname)) window.history.replaceState(null, "", "/");
  };

  const publicSectorRowHtml = (): string => activeHostedSectorId()
    ? `<li class="hosted-sector-row"><div><strong>The public sector</strong><span class="hosted-sector-meta">Free, always running</span></div><button type="button" class="panel-btn" data-hosted-sector-leave>Go there</button></li>`
    : `<li class="hosted-sector-row"><div><strong>The public sector</strong><span class="hosted-sector-meta">Free, always running</span></div><span class="hosted-sector-here">You are here</span></li>`;

  const scheduleRefresh = (): void => {
    const refreshMs = deps.refreshMs ?? 5_000;
    if (refreshMs <= 0) return;
    stopRefresh();
    refreshTimer = setTimeout(() => {
      if (!panel) return;
      if (listIsBusy()) scheduleRefresh();
      else void showList("", { quiet: true });
    }, refreshMs);
  };

  /** Only the newest request may draw: a slow reply must not replace a form the player has opened since. */
  let listRequest = 0;

  /** The automatic refresh leaves the list alone while the player is using it. */
  const listIsBusy = (): boolean =>
    Boolean(panel?.querySelector("[data-hosted-sector-invite-output]:not([hidden]), [data-hosted-sectors-error]:not([hidden])")) ||
    // Someone typing an amount to chip in.
    (document.activeElement instanceof HTMLInputElement && document.activeElement.matches("[data-hosted-sector-amount]"));

  const CONSENT_BOXES = ["data-hosted-sector-consent-terms", "data-hosted-sector-consent-early-start"] as const;

  /** Which consent boxes are ticked, so a redraw (the automatic refresh) keeps them ticked. */
  const tickedConsentBoxes = (): string[] =>
    CONSENT_BOXES.flatMap((attribute) =>
      Array.from(panel?.querySelectorAll<HTMLInputElement>(`[${attribute}]:checked`) ?? [], (box) => `${attribute}=${box.getAttribute(attribute) ?? ""}`));

  const retickConsentBoxes = (ticked: readonly string[]): void => {
    for (const entry of ticked) {
      const [attribute, sectorId] = entry.split("=") as [string, string];
      const box = panel?.querySelector<HTMLInputElement>(`[${attribute}="${CSS.escape(sectorId)}"]`);
      if (box) box.checked = true;
    }
  };

  const showList = async (notice = "", options: { quiet?: boolean } = {}): Promise<void> => {
    if (!deps.isSignedIn()) {
      setBody(`<p>Sign in to see your sectors.</p>`);
      return;
    }
    const request = (listRequest += 1);
    if (!options.quiet) setBody(`<p>Loading…</p>`);
    const listed = await deps.api.listSectors();
    if (request !== listRequest || !panel) return;
    if (!listed.ok) {
      if (options.quiet) {
        scheduleRefresh();
        return;
      }
      setBody(`<p role="alert">${escapeHtml(listed.message)}</p>`);
      return;
    }
    const rows = listed.sectors.map((sector) => hostedSectorRowHtml(sector, activeHostedSectorId())).join("");
    checkoutUrls.clear();
    for (const sector of listed.sectors) {
      if (sector.checkoutUrl) checkoutUrls.set(sector.sectorId, sector.checkoutUrl);
      if (sector.funding?.yourCheckoutUrl) checkoutUrls.set(`share:${sector.sectorId}`, sector.funding.yourCheckoutUrl);
    }
    const hostsLiveSector = listed.sectors.some((sector) => sector.role === "host" && (sector.state === "awaiting_payment" || sector.state === "funding" || sector.state === "creating" || sector.state === "open"));
    // While a sector is being prepared the list keeps itself current, so the host can just wait.
    stopRefresh();
    // A bar being funded changes as friends chip in, so it refreshes too.
    if (listed.sectors.some((sector) => sector.state === "creating" || sector.state === "funding")) scheduleRefresh();
    const ticked = tickedConsentBoxes();
    setBody(`
      ${notice ? `<p class="hosted-sector-notice">${escapeHtml(notice)}</p>` : ""}
      <ul class="hosted-sector-list">${publicSectorRowHtml()}${rows}</ul>
      ${listed.sectors.length === 0 ? `<p class="hosted-sector-note">You are not a member of any hosted sector. A host can send you an invite link.</p>` : ""}
      <div data-hosted-sector-invite-output hidden><input data-hosted-sector-invite-url readonly aria-label="Invite link" /></div>
      ${hostsLiveSector ? "" : `<button type="button" class="panel-btn" data-hosted-sector-host>Host a sector</button>`}
      <p class="hosted-sector-error" data-hosted-sectors-error role="alert" hidden></p>`);
    retickConsentBoxes(ticked);
  };

  const showError = (message: string): void => {
    const error = panel?.querySelector<HTMLElement>("[data-hosted-sectors-error]");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  };

  const pay = (checkoutUrl: string | undefined): void => {
    if (!checkoutUrl || !isAllowedCheckoutUrl(checkoutUrl, deps.pageIsLocal)) {
      showError("The payment page's address was not recognised, so it was not opened.");
      return;
    }
    deps.navigate(checkoutUrl);
  };

  const invite = async (sectorId: string): Promise<void> => {
    const made = await deps.api.createInvite(sectorId);
    if (!made.ok) {
      showError(made.message);
      return;
    }
    const output = panel?.querySelector<HTMLElement>("[data-hosted-sector-invite-output]");
    const input = panel?.querySelector<HTMLInputElement>("[data-hosted-sector-invite-url]");
    if (!output || !input) return;
    input.value = `${deps.shareOrigin}/h/${made.code}`;
    output.hidden = false;
    input.select();
  };

  const submitOrder = async (form: HTMLFormElement): Promise<void> => {
    const error = form.querySelector<HTMLElement>("[data-hosted-sector-form-error]");
    const fail = (message: string): void => { if (error) { error.textContent = message; error.hidden = false; } };
    const options = readHostSectorForm(form);
    if (!options) {
      fail("Choose a map and tick both boxes to continue.");
      return;
    }
    if (options.split) {
      const opened = await deps.api.openFundingBar({ mapStyle: options.mapStyle, mapSize: options.mapSize });
      if (!opened.ok) {
        fail(opened.message);
        return;
      }
      await showList("Your funding bar is open for 72 hours. Press Invite to get the link for your friends; everyone chips in here.");
      return;
    }
    const ordered = await deps.api.createOrder({ mapStyle: options.mapStyle, mapSize: options.mapSize }, CHECKOUT_CONSENT);
    if (!ordered.ok) {
      fail(ordered.message);
      return;
    }
    if (!ordered.sector.checkoutUrl || !isAllowedCheckoutUrl(ordered.sector.checkoutUrl, deps.pageIsLocal)) {
      fail("The payment page's address was not recognised, so it was not opened. Nothing was charged.");
      return;
    }
    deps.navigate(ordered.sector.checkoutUrl);
  };

  /** A share of a funding bar: the payment page only holds the card. */
  const pledge = async (sectorId: string, amountCents: number | undefined): Promise<void> => {
    if (amountCents === undefined || !Number.isInteger(amountCents)) {
      showError("Type an amount in US dollars.");
      return;
    }
    const ticked = (attribute: string): boolean => panel?.querySelector<HTMLInputElement>(`[${attribute}="${CSS.escape(sectorId)}"]`)?.checked === true;
    if (!ticked("data-hosted-sector-consent-terms") || !ticked("data-hosted-sector-consent-early-start")) {
      showError("Tick both boxes above the buttons to chip in.");
      return;
    }
    const pledged = await deps.api.contribute(sectorId, amountCents, CHECKOUT_CONSENT);
    if (!pledged.ok) {
      showError(pledged.message);
      return;
    }
    pay(pledged.checkoutUrl);
  };

  const enter = async (sectorId: string): Promise<void> => {
    const issued = await deps.api.issueTicket(sectorId);
    if (!issued.ok) {
      showError(issued.message);
      return;
    }
    if (!isAllowedHostedSectorWsUrl(issued.wsUrl, deps.pageIsLocal, sectorId)) {
      showError("This sector's address was not recognised, so it was not opened.");
      return;
    }
    if (!stashHostedSectorSession({ sectorId, wsUrl: issued.wsUrl, ticket: issued.ticket, expiresAt: issued.expiresAt }, deps.storage)) {
      showError("This browser is blocking the storage a hosted sector needs. Allow site data for Border Empires and try again.");
      return;
    }
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
      const chipIn = target.closest<HTMLElement>("[data-hosted-sector-chip-in]")?.dataset.hostedSectorChipIn;
      if (chipIn) {
        const input = panel?.querySelector<HTMLInputElement>(`[data-hosted-sector-amount="${CSS.escape(chipIn)}"]`);
        void pledge(chipIn, readChipInCents(input?.value ?? ""));
      }
      const payRest = target.closest<HTMLElement>("[data-hosted-sector-pay-rest]");
      if (payRest?.dataset.hostedSectorPayRest) void pledge(payRest.dataset.hostedSectorPayRest, Number(payRest.dataset.hostedSectorRest));
      const resume = target.closest<HTMLElement>("[data-hosted-sector-resume]")?.dataset.hostedSectorResume;
      if (resume) pay(checkoutUrls.get(`share:${resume}`));
      const payButton = target.closest<HTMLElement>("[data-hosted-sector-pay]");
      if (payButton?.dataset.hostedSectorPay) pay(checkoutUrls.get(payButton.dataset.hostedSectorPay));
      const inviteButton = target.closest<HTMLElement>("[data-hosted-sector-invite]");
      if (inviteButton?.dataset.hostedSectorInvite) void invite(inviteButton.dataset.hostedSectorInvite);
      if (target.closest("[data-hosted-sector-host]")) { stopRefresh(); listRequest += 1; setBody(hostSectorFormHtml()); }
      if (target.closest("[data-hosted-sector-form-cancel]")) void showList();
      if (target.closest("[data-hosted-sector-leave]")) {
        clearHostedSectorSession(deps.storage);
        deps.navigate("/");
      }
    });
    panel.addEventListener("submit", (event) => {
      if (!(event.target instanceof HTMLFormElement) || !event.target.matches("[data-hosted-sector-form]")) return;
      event.preventDefault();
      void submitOrder(event.target);
    });
    // Inside #hud so it stacks with the other panels (see client-rally-links.ts).
    (document.getElementById("hud") ?? document.body).append(panel);
    return panel;
  };

  return {
    async openList(notice = ""): Promise<void> {
      open();
      await showList(notice);
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

/**
 * Mounts the panel's two ways in: the settings card button and an invite link.
 * The sign-in is restored after page load, so an invite link waits for
 * `whenAuthReady` before deciding whether the player is signed in.
 */
export const mountHostedSectorsPanel = (deps: HostedSectorsPanelDeps & { whenAuthReady: () => Promise<void> }): void => {
  const panel = createHostedSectorsPanel(deps);
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-hosted-sectors-open]")) void panel.openList();
  });
  const inviteCode = hostedInviteCodeFromPath(window.location.pathname);
  if (inviteCode) void deps.whenAuthReady().catch(() => undefined).then(() => panel.openInvite(inviteCode));
  // Back from Stripe Checkout: show the list, where the new sector appears as it is prepared.
  const notice = checkoutReturnNotice(window.location.search);
  if (notice !== undefined) {
    window.history.replaceState(null, "", "/");
    void deps.whenAuthReady().catch(() => undefined).then(() => panel.openList(notice));
  }
};

/** The notice for a return from Stripe Checkout (`?hosted=paid|cancelled`), or undefined for any other page. */
export const checkoutReturnNotice = (search: string): string | undefined => {
  const returned = new URLSearchParams(search).get("hosted");
  if (returned === "paid") return "Thank you. Your sector is being prepared; it appears here when it is ready, and an email follows.";
  if (returned === "pledged") return "Thank you. Your share is held on your card; you are charged when the bar is full, and the sector starts at once.";
  if (returned === "cancelled") return "Payment was cancelled. Nothing was charged. Your order stays here for 30 minutes if you want to pay after all.";
  return undefined;
};
