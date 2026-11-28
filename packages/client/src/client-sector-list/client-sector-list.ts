// The sector list on the join card (GDD §6, owner decision 2026-11-27): the
// Sector Contests running now that this player can play in, each greyed out
// when full (every House place taken, or no viable landing site left), and,
// when none has room, the offer to fund a new sector.
//
// Rows: the public Sector Contest (its board on the main gateway), the hosted
// sector this page plays on (its own server's board) and the player's other
// open hosted sectors (from the hosting service). A hosted sector the player
// belongs to already holds their place; whether it is full is known only for
// the sector this page is on (its own board).
// Hosted sectors are web-only; the apps list the public sector alone and
// never offer funding (docs/app-store-purchase-rules.md).

/** `houses` and `maxHouses` count player Houses (the join cap); `aiHouses` the AI Houses beside them, when the server reports it. */
export type SectorBoard = { status: string; houses: number; maxHouses: number; full: boolean; noLandingSite: boolean; aiHouses?: number };

export type HostedSectorListItem = { sectorId: string; state: string; title: string };

export type SectorListAction = "land" | "public" | "enter-hosted" | "none";
export type SectorListRow = {
  key: string;
  title: string;
  detail: string;
  here: boolean;
  full: boolean;
  /** Full because no viable landing site is left. Only this blocks Land now: a sector at its
   * House cap still takes a player with a reserved place, and refuses others with the waitlist. */
  noLandingSite: boolean;
  fullReason: string;
  action: SectorListAction;
  sectorId?: string;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const parseSectorBoard = (body: unknown): SectorBoard | undefined => {
  if (!body || typeof body !== "object") return undefined;
  const { ok, status, houses, maxHouses, full, noLandingSite, aiHouses } = body as Record<string, unknown>;
  if (ok !== true || typeof status !== "string" || typeof houses !== "number" || typeof maxHouses !== "number" || typeof full !== "boolean") return undefined;
  return { status, houses, maxHouses, full, noLandingSite: noLandingSite === true, ...(typeof aiHouses === "number" ? { aiHouses } : {}) };
};

/** The http(s) origin of a game server's WebSocket URL. */
export const httpOriginOfWsUrl = (wsUrl: string): string | undefined => {
  try {
    const url = new URL(wsUrl);
    const protocol = url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
    return `${protocol}//${url.host}`;
  } catch {
    return undefined;
  }
};

export const boardFullReason = (board: SectorBoard): string =>
  !board.full ? "" : board.noLandingSite ? "Full: no landing site left" : "Full: every House place is taken";

// The cap counts player Houses only; Diplomacy lists the AI Houses too. Saying "player" and adding the AI
// count keeps the two screens from contradicting (first-15 playtest 2026-11-28: "3 of 50 Houses" beside
// "Not met yet · 23").
const housesDetail = (board: SectorBoard): string => {
  const players = board.maxHouses > 0 ? `${board.houses} of ${board.maxHouses} player Houses` : `${board.houses} player Houses`;
  return board.aiHouses ? `${players} + ${board.aiHouses} AI` : players;
};

const boardRow = (key: string, title: string, board: SectorBoard, here: boolean, action: SectorListAction, sectorId?: string): SectorListRow => ({
  key,
  title,
  detail: housesDetail(board),
  here,
  full: board.full,
  noLandingSite: board.noLandingSite,
  fullReason: boardFullReason(board),
  action: board.full ? "none" : action,
  ...(sectorId ? { sectorId } : {})
});

export type SectorListInput = {
  publicBoard?: SectorBoard | undefined;
  /** This page's hosted sector, when it plays on one. */
  hosted?: { sectorId: string; title: string; board?: SectorBoard | undefined } | undefined;
  /** The player's hosted sectors from the hosting service. */
  hostedSectors?: readonly HostedSectorListItem[];
};

export const buildSectorListRows = ({ publicBoard, hosted, hostedSectors = [] }: SectorListInput): SectorListRow[] => {
  const rows: SectorListRow[] = [];
  if (hosted?.board) rows.push(boardRow(`hosted:${hosted.sectorId}`, hosted.title, hosted.board, true, "land", hosted.sectorId));
  if (publicBoard && publicBoard.status === "active") rows.push(boardRow("public", "Public Sector Contest", publicBoard, !hosted, hosted ? "public" : "land"));
  for (const sector of hostedSectors) {
    if (sector.state !== "open" || sector.sectorId === hosted?.sectorId) continue;
    rows.push({ key: `hosted:${sector.sectorId}`, title: sector.title, detail: "Your hosted sector", here: false, full: false, noLandingSite: false, fullReason: "", action: "enter-hosted", sectorId: sector.sectorId });
  }
  return rows;
};

export const anySectorOpen = (rows: readonly SectorListRow[]): boolean => rows.some((row) => !row.full);

const rowButtonHtml = (row: SectorListRow): string => {
  if (row.full) return `<button type="button" class="panel-btn" disabled>Full</button>`;
  if (row.action === "public") return `<button type="button" class="panel-btn" data-hosted-sectors-leave>Go there</button>`;
  if (row.action === "enter-hosted" && row.sectorId) return `<button type="button" class="panel-btn" data-hosted-sectors-enter="${escapeHtml(row.sectorId)}">Enter</button>`;
  return "";
};

/** The list, plus "Fund a new sector" when funding is offered here and either no listed sector has
 * room or the player chose to wait for the next contest (alwaysOfferFunding, the waiting view). */
export const sectorListHtml = (rows: readonly SectorListRow[], canFund: boolean, alwaysOfferFunding = false): string => {
  if (rows.length === 0 && !(canFund && alwaysOfferFunding)) return "";
  const allFull = rows.length > 0 && !anySectorOpen(rows);
  const items = rows.map((row) => `
      <li class="sector-list-row${row.full ? " is-full" : ""}${row.here ? " is-here" : ""}" data-sector-row="${escapeHtml(row.key)}"${row.full ? ' aria-disabled="true"' : ""}>
        <div><strong>${escapeHtml(row.title)}</strong>${row.here ? ' <span class="sector-list-here">You are here</span>' : ""}
          <span class="sector-list-meta">${escapeHtml(row.full ? `${row.detail} · ${row.fullReason}` : row.detail)}</span></div>
        <div class="sector-list-action">${row.here ? "" : rowButtonHtml(row)}</div>
      </li>`).join("");
  const fund = canFund && (allFull || alwaysOfferFunding)
    ? `${allFull ? '<p class="respawn-summary">Every Sector Contest is full right now.</p>' : ""}<button type="button" class="panel-btn" data-hosted-sectors-open="host">Fund a new sector</button>`
    : "";
  return `<section class="respawn-section sector-list" aria-label="Sector Contests"><h3 class="sector-list-title">Sector Contests now</h3>${items ? `<ul class="sector-list-rows">${items}</ul>` : ""}${fund}</section>`;
};
