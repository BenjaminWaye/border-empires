// Sector board: the join screen for a signed-in player while a Sector
// Contest is running. Instead of a single "Let's go!" prompt it shows the
// open Sector as a card (Houses in it out of the cap, open or full) and the
// next Sector with its waitlist, so joining reads as choosing a world on the
// galaxy map. Guests who pressed "Play now" never see it: they are sent
// straight in (client-guest-play.ts). Data comes from GET /sector/board.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { lastContestRecapButtonHtml } from "../client-last-contest-recap/client-last-contest-recap.js";

export type SectorBoardView = { seasonId: string; houses: number; maxHouses: number; full: boolean; waitingCount: number };

export const parseSectorBoard = (body: unknown): SectorBoardView | undefined => {
  if (!body || typeof body !== "object") return undefined;
  const { ok, seasonId, houses, maxHouses, full, waitingCount } = body as Record<string, unknown>;
  if (ok !== true || typeof seasonId !== "string" || typeof houses !== "number" || typeof maxHouses !== "number" || typeof full !== "boolean" || typeof waitingCount !== "number") return undefined;
  return { seasonId, houses, maxHouses, full, waitingCount };
};

const houses = (count: number): string => `${count} ${count === 1 ? "House" : "Houses"}`;

const occupancyLabel = (board: SectorBoardView | undefined): string => {
  if (!board) return "Counting Houses…";
  return board.maxHouses > 0 ? `${board.houses} of ${board.maxHouses} Houses` : `${houses(board.houses)} contesting`;
};

export type SectorBoardHtmlInput = {
  kicker: string;
  board: SectorBoardView | undefined;
  joining: boolean;
  waitHintHtml: string;
  lobbyPanelHtml: string;
};

export const sectorBoardHtml = ({ kicker, board, joining, waitHintHtml, lobbyPanelHtml }: SectorBoardHtmlInput): string => {
  const full = board?.full === true;
  const status = full ? "Full" : "Open";
  const buttonLabel = joining
    ? '<span class="season-lobby-join-spinner" aria-hidden="true"></span>Joining... setting up your empire'
    : full
      ? "Sector looks full — try anyway"
      : "Join this Sector Contest";
  // Never disabled for "full": the count is approximate, and a refused join
  // is what opens the next-Sector waitlist screen (client-season-full-error.ts).
  const disabled = joining ? 'disabled aria-busy="true"' : "";
  const waiting = board ? `${houses(board.waitingCount)} waiting` : "";
  return `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card sector-board" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close join Sector Contest prompt">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">${kicker}</div>
        <h2 id="join-season-title" class="respawn-title">Choose your Sector</h2>
        <p class="respawn-summary">The Emperor has opened a world on the frontier for contestation. No one empire will win alone. Good luck.</p>
        <ul class="sector-board-list">
          <li class="sector-board-card ${full ? "is-full" : "is-open"}" data-sector-card="current">
            <div class="sector-board-head">
              <span class="sector-board-name">Current Sector Contest</span>
              <span class="sector-board-status">${status}</span>
            </div>
            <div class="sector-board-meta">${occupancyLabel(board)}</div>
            ${full ? '<p class="sector-board-note">Every House slot looks taken. If the Sector is full you will be offered the waitlist for the next one.</p>' : ""}
            ${lobbyPanelHtml}
            <section class="respawn-section respawn-actions">
              <button id="join-season-confirm" class="panel-btn season-lobby-lets-go-btn${joining ? " is-joining" : ""}" type="button" ${disabled}>${buttonLabel}</button>
              ${waitHintHtml}
            </section>
          </li>
          <li class="sector-board-card is-next" data-sector-card="next">
            <div class="sector-board-head">
              <span class="sector-board-name">Next Sector</span>
              <span class="sector-board-status">Opens after this contest</span>
            </div>
            ${waiting ? `<div class="sector-board-meta">${waiting}</div>` : ""}
          </li>
        </ul>
        <p class="sector-board-recap">Curious how the last contest ended? ${lastContestRecapButtonHtml()}</p>
      </div>
    </div>
  `;
};

type BoardState = { sectorBoard: SectorBoardView | undefined; joinSeasonId: string };

const RETRY_AFTER_FAILURE_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

// Loads the board once per season id while the board is on screen. A failed
// or stalled load (10s timeout) is retried after 30s: the loader schedules a
// re-render then, so the retry happens even if nothing else redraws the
// screen. The board still works without data (no counts shown).
export const createSectorBoardLoader = (deps: {
  wsUrl: string;
  rerender: () => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  setTimeoutImpl?: (callback: () => void, ms: number) => unknown;
}) => {
  const setTimeoutImpl = deps.setTimeoutImpl ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = deps.now ?? (() => Date.now());
  let loadedFor: string | undefined;
  let inFlight = false;
  let lastFailureAt = -Infinity;

  return (state: BoardState): void => {
    if (inFlight || loadedFor === state.joinSeasonId || now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return;
    inFlight = true;
    const seasonId = state.joinSeasonId;
    void fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/sector/board`, { method: "GET", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then((response) => response.json())
      .then((body) => {
        const board = parseSectorBoard(body);
        if (!board) throw new Error("bad board");
        // A reply for another season (client and gateway mid-rollover) is not
        // this screen's data: retry later instead of showing stale counts.
        if (seasonId && board.seasonId !== seasonId) throw new Error("season mismatch");
        loadedFor = seasonId;
        state.sectorBoard = board;
        deps.rerender();
      })
      .catch(() => {
        lastFailureAt = now();
        setTimeoutImpl(deps.rerender, RETRY_AFTER_FAILURE_MS);
      })
      .finally(() => {
        inFlight = false;
      });
  };
};

// One loader per gateway, so its once-per-season memory survives the HUD's
// re-renders (renderClientHud rebuilds the overlay deps every frame).
const loadersByWsUrl = new Map<string, (state: BoardState) => void>();

export const sectorBoardLoaderFor = (wsUrl: string, rerender: () => void): ((state: BoardState) => void) => {
  let loader = loadersByWsUrl.get(wsUrl);
  if (!loader) {
    loader = createSectorBoardLoader({ wsUrl, rerender });
    loadersByWsUrl.set(wsUrl, loader);
  }
  return loader;
};
