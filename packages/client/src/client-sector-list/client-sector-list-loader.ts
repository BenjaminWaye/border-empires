import "./client-sector-list.css";

// Loads the join card's sector list (client-sector-list.ts) at most once a
// minute per contest while the card is drawn, so a failed load is retried and
// a sector that frees up shows open again; and at once after a
// NO_LANDING_SITE refusal (which clears sectorListLoadedFor). The hosting panel registers where the player's hosted
// sectors come from (web only); without it there is no funding offer.
import type { ClientState } from "../client-state/client-state.js";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { activeHostedSectorId, activeHostedSectorWsUrl } from "../client-hosted-sectors/client-hosted-sector-session.js";
import { buildSectorListRows, httpOriginOfWsUrl, parseSectorBoard, type HostedSectorListItem, type SectorBoard } from "./client-sector-list.js";

type HostedSectorListSource = () => Promise<HostedSectorListItem[]>;
// One slot, set once by mountHostedSectorsPanel.
let hostedSource: HostedSectorListSource | undefined;

export const registerHostedSectorListSource = (source: HostedSectorListSource | undefined): void => {
  hostedSource = source;
};

/** Funding a sector is offered only where the hosting panel is mounted (web, hosted sectors enabled). */
export const canFundSectors = (): boolean => hostedSource !== undefined;

type SectorListState = Pick<ClientState, "joinSeasonId" | "sectorListRows" | "sectorListLoadedFor">;

export type SectorListLoaderDeps = {
  state: SectorListState;
  /** The main gateway's WebSocket URL (the public Sector Contest). */
  wsUrl: string;
  renderHud: () => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export const SECTOR_LIST_REFRESH_MS = 60_000;

const fetchBoard = async (origin: string | undefined, fetchImpl: typeof fetch): Promise<SectorBoard | undefined> => {
  if (!origin) return undefined;
  try {
    const response = await fetchImpl(`${origin}/sector/board`);
    return parseSectorBoard(await response.json());
  } catch {
    return undefined;
  }
};

export const loadSectorList = async (deps: Omit<SectorListLoaderDeps, "state" | "renderHud">) => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const hostedId = activeHostedSectorId();
  const hostedWsUrl = activeHostedSectorWsUrl();
  const [publicBoard, hereBoard, hostedSectors] = await Promise.all([
    fetchBoard(rallyApiOrigin(deps.wsUrl), fetchImpl),
    hostedId && hostedWsUrl ? fetchBoard(httpOriginOfWsUrl(hostedWsUrl), fetchImpl) : Promise.resolve(undefined),
    hostedSource ? hostedSource().catch(() => [] as HostedSectorListItem[]) : Promise.resolve([] as HostedSectorListItem[])
  ]);
  const hostedTitle = hostedSectors.find((sector) => sector.sectorId === hostedId)?.title ?? "Your hosted sector";
  return buildSectorListRows({
    publicBoard,
    ...(hostedId ? { hosted: { sectorId: hostedId, title: hostedTitle, board: hereBoard } } : {}),
    hostedSectors
  });
};

export const refreshSectorListIfNeeded = (deps: SectorListLoaderDeps): void => {
  const key = `${deps.state.joinSeasonId || "current"}:${Math.floor((deps.now ?? Date.now)() / SECTOR_LIST_REFRESH_MS)}`;
  if (deps.state.sectorListLoadedFor === key) return;
  deps.state.sectorListLoadedFor = key;
  void loadSectorList(deps).then((rows) => {
    deps.state.sectorListRows = rows;
    deps.renderHud();
  }, () => undefined);
};
