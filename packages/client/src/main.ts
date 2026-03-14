import "./style.css";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH, terrainAt } from "@border-empires/shared";

type Tile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  resource?: string;
  ownerId?: string;
  clusterId?: string;
  clusterType?: string;
  dockId?: string;
  fort?: { ownerId: string; status: "under_construction" | "active"; completesAt?: number };
};

type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
};
type TechInfo = {
  id: string;
  name: string;
  rootId: string;
  requires?: string;
  description: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  grantsPowerup?: { id: string; charges: number };
};
type LeaderboardEntry = { id: string; name: string; points: number; level: number; rating: number };
type MissionState = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  rewardPoints: number;
  completed: boolean;
  claimed: boolean;
};
type FeedType = "combat" | "mission" | "error" | "info" | "alliance" | "tech";
type FeedSeverity = "info" | "success" | "warn" | "error";
type FeedEntry = {
  text: string;
  type: FeedType;
  severity: FeedSeverity;
  at: number;
};

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (!canvas || !hud) throw new Error("missing DOM roots");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("missing 2d context");

hud.innerHTML = `
  <div id="top-strip">
    <div id="stats-chips"></div>
    <div id="panel-actions">
      <button class="icon-btn" data-panel="missions">Missions</button>
      <button class="icon-btn" data-panel="tech">Tech</button>
      <button class="icon-btn" data-panel="alliance">Allies</button>
      <button class="icon-btn" data-panel="leaderboard">Ranks</button>
      <button class="icon-btn" data-panel="feed">Feed</button>
      <button class="icon-btn" data-panel="settings">Style</button>
    </div>
  </div>

  <div id="floating-info">
    <div id="selected"></div>
    <div id="hover"></div>
    <div class="row">
      <button id="center-me-desktop" class="panel-btn">Center On My Tile</button>
      <button id="refresh-desktop" class="panel-btn">Refresh View</button>
      <button id="build-fort-desktop" class="panel-btn">Build Fort On Selected</button>
    </div>
  </div>

  <div id="capture-overlay">
    <div id="capture-wrap"><div id="capture-bar"></div></div>
  </div>

  <div id="mobile-nav">
    <button data-mobile-panel="core">Core</button>
    <button data-mobile-panel="missions">Missions</button>
    <button data-mobile-panel="tech">Tech</button>
    <button data-mobile-panel="social">Social</button>
    <button data-mobile-panel="intel">Intel</button>
  </div>

  <div id="mobile-core" class="mobile-panel">
    <div class="row">
      <button id="center-me" class="panel-btn">Center On My Tile</button>
      <button id="refresh" class="panel-btn">Refresh View</button>
    </div>
    <div class="row">
      <input id="tile-color" type="color" value="#38b000" />
      <button id="set-color" class="panel-btn">Set My Tile Color</button>
    </div>
    <div class="row">
      <button id="build-fort-mobile" class="panel-btn">Build Fort On Selected</button>
    </div>
  </div>

  <aside id="side-panel">
    <div id="side-panel-head">
      <h3 id="panel-title">Panel</h3>
      <button id="panel-close">Close</button>
    </div>
    <div id="side-panel-body">
      <section id="panel-missions" class="panel-body"></section>
      <section id="panel-tech" class="panel-body">
        <div class="card">
          <div id="tech-points"></div>
          <div class="row">
            <select id="tech-pick"></select>
            <button id="tech-choose" class="panel-btn">Choose</button>
          </div>
          <div id="tech-choice-details"></div>
        </div>
        <div id="tech-owned"></div>
      </section>
      <section id="panel-alliance" class="panel-body">
        <div class="row">
          <input id="alliance-target" placeholder="ally player name" />
          <button id="alliance-send" class="panel-btn">Send</button>
        </div>
        <div class="row">
          <input id="alliance-break-id" placeholder="break by player id" />
          <button id="alliance-break" class="panel-btn">Break</button>
        </div>
        <div id="allies-list"></div>
        <div id="alliance-requests"></div>
      </section>
      <section id="panel-leaderboard" class="panel-body">
        <div id="leaderboard"></div>
      </section>
      <section id="panel-feed" class="panel-body">
        <div id="feed"></div>
      </section>
      <section id="panel-settings" class="panel-body">
        <div class="card">
          <div class="row">
            <input id="panel-color" type="color" value="#38b000" />
            <input id="panel-color-text" type="text" value="#38b000" />
            <button id="set-color-panel" class="panel-btn">Apply</button>
          </div>
        </div>
        <div id="panel-settings-preview"></div>
      </section>
    </div>
  </aside>

  <div id="mobile-sheet">
    <div id="mobile-sheet-head">Panel</div>
    <section id="mobile-panel-missions" class="mobile-panel"></section>
    <section id="mobile-panel-tech" class="mobile-panel">
      <div class="card">
        <div id="mobile-tech-points"></div>
        <div class="row">
          <select id="mobile-tech-pick"></select>
          <button id="mobile-tech-choose" class="panel-btn">Choose</button>
        </div>
        <div id="mobile-tech-choice-details"></div>
      </div>
      <div id="mobile-tech-owned"></div>
    </section>
    <section id="mobile-panel-social" class="mobile-panel">
      <div class="row">
        <input id="mobile-alliance-target" placeholder="ally player name" />
        <button id="mobile-alliance-send" class="panel-btn">Send</button>
      </div>
      <div class="row">
        <input id="mobile-alliance-break-id" placeholder="break by player id" />
        <button id="mobile-alliance-break" class="panel-btn">Break</button>
      </div>
      <div id="mobile-allies-list"></div>
      <div id="mobile-alliance-requests"></div>
    </section>
    <section id="mobile-panel-intel" class="mobile-panel">
      <div id="mobile-leaderboard"></div>
      <div id="mobile-feed"></div>
    </section>
    <section id="mobile-panel-core" class="mobile-panel">
      <div id="mobile-core-help"></div>
    </section>
  </div>

  <div id="legacy-hidden" style="display:none;">
    <div class="row">
      <select id="tech-pick-fallback"></select>
      <button id="tech-choose-fallback">Choose Tech</button>
    </div>
  </div>
`;

const statsChipsEl = document.querySelector<HTMLDivElement>("#stats-chips");
const selectedEl = document.querySelector<HTMLDivElement>("#selected");
const hoverEl = document.querySelector<HTMLDivElement>("#hover");
const mobileCoreHelpEl = document.querySelector<HTMLDivElement>("#mobile-core-help");
const captureWrapEl = document.querySelector<HTMLDivElement>("#capture-wrap");
const captureBarEl = document.querySelector<HTMLDivElement>("#capture-bar");
const sidePanelEl = document.querySelector<HTMLElement>("#side-panel");
const sidePanelBodyEl = document.querySelector<HTMLDivElement>("#side-panel-body");
const panelTitleEl = document.querySelector<HTMLHeadingElement>("#panel-title");
const panelCloseBtn = document.querySelector<HTMLButtonElement>("#panel-close");
const panelActionButtons = document.querySelectorAll<HTMLButtonElement>("#panel-actions button[data-panel]");
const panelMissionsEl = document.querySelector<HTMLDivElement>("#panel-missions");
const panelTechEl = document.querySelector<HTMLDivElement>("#panel-tech");
const panelAllianceEl = document.querySelector<HTMLDivElement>("#panel-alliance");
const panelLeaderboardEl = document.querySelector<HTMLDivElement>("#panel-leaderboard");
const panelFeedEl = document.querySelector<HTMLDivElement>("#panel-feed");
const panelSettingsEl = document.querySelector<HTMLDivElement>("#panel-settings");
const panelSettingsPreviewEl = document.querySelector<HTMLDivElement>("#panel-settings-preview");
const panelColorInput = document.querySelector<HTMLInputElement>("#panel-color");
const panelColorTextInput = document.querySelector<HTMLInputElement>("#panel-color-text");
const setColorPanelBtn = document.querySelector<HTMLButtonElement>("#set-color-panel");
const feedEl = document.querySelector<HTMLDivElement>("#feed");
const techPickEl = document.querySelector<HTMLSelectElement>("#tech-pick");
const techPointsEl = document.querySelector<HTMLDivElement>("#tech-points");
const techOwnedEl = document.querySelector<HTMLDivElement>("#tech-owned");
const techChoiceDetailsEl = document.querySelector<HTMLDivElement>("#tech-choice-details");
const allianceTargetEl = document.querySelector<HTMLInputElement>("#alliance-target");
const allianceBreakIdEl = document.querySelector<HTMLInputElement>("#alliance-break-id");
const alliesListEl = document.querySelector<HTMLDivElement>("#allies-list");
const allianceRequestsEl = document.querySelector<HTMLDivElement>("#alliance-requests");
const missionsEl = document.querySelector<HTMLDivElement>("#panel-missions");
const leaderboardEl = document.querySelector<HTMLDivElement>("#leaderboard");
const allianceSendBtn = document.querySelector<HTMLButtonElement>("#alliance-send");
const allianceBreakBtn = document.querySelector<HTMLButtonElement>("#alliance-break");
const techChooseBtn = document.querySelector<HTMLButtonElement>("#tech-choose");
const mobileSheetEl = document.querySelector<HTMLDivElement>("#mobile-sheet");
const mobileSheetHeadEl = document.querySelector<HTMLDivElement>("#mobile-sheet-head");
const mobileCoreEl = document.querySelector<HTMLDivElement>("#mobile-core");
const mobilePanelCoreEl = document.querySelector<HTMLDivElement>("#mobile-panel-core");
const mobilePanelMissionsEl = document.querySelector<HTMLDivElement>("#mobile-panel-missions");
const mobilePanelTechEl = document.querySelector<HTMLDivElement>("#mobile-panel-tech");
const mobilePanelSocialEl = document.querySelector<HTMLDivElement>("#mobile-panel-social");
const mobilePanelIntelEl = document.querySelector<HTMLDivElement>("#mobile-panel-intel");
const mobileFeedEl = document.querySelector<HTMLDivElement>("#mobile-feed");
const mobileLeaderboardEl = document.querySelector<HTMLDivElement>("#mobile-leaderboard");
const mobileTechPickEl = document.querySelector<HTMLSelectElement>("#mobile-tech-pick");
const mobileTechChooseBtn = document.querySelector<HTMLButtonElement>("#mobile-tech-choose");
const mobileTechPointsEl = document.querySelector<HTMLDivElement>("#mobile-tech-points");
const mobileTechOwnedEl = document.querySelector<HTMLDivElement>("#mobile-tech-owned");
const mobileTechChoiceDetailsEl = document.querySelector<HTMLDivElement>("#mobile-tech-choice-details");
const mobileAllianceTargetEl = document.querySelector<HTMLInputElement>("#mobile-alliance-target");
const mobileAllianceBreakIdEl = document.querySelector<HTMLInputElement>("#mobile-alliance-break-id");
const mobileAllianceSendBtn = document.querySelector<HTMLButtonElement>("#mobile-alliance-send");
const mobileAllianceBreakBtn = document.querySelector<HTMLButtonElement>("#mobile-alliance-break");
const mobileAllianceRequestsEl = document.querySelector<HTMLDivElement>("#mobile-alliance-requests");
const mobileAlliesListEl = document.querySelector<HTMLDivElement>("#mobile-allies-list");
const centerMeBtn = document.querySelector<HTMLButtonElement>("#center-me");
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh");
const centerMeDesktopBtn = document.querySelector<HTMLButtonElement>("#center-me-desktop");
const refreshDesktopBtn = document.querySelector<HTMLButtonElement>("#refresh-desktop");
const buildFortDesktopBtn = document.querySelector<HTMLButtonElement>("#build-fort-desktop");
const buildFortMobileBtn = document.querySelector<HTMLButtonElement>("#build-fort-mobile");
const tileColorInput = document.querySelector<HTMLInputElement>("#tile-color");
const setColorBtn = document.querySelector<HTMLButtonElement>("#set-color");
if (
  !statsChipsEl ||
  !selectedEl ||
  !hoverEl ||
  !mobileCoreHelpEl ||
  !captureWrapEl ||
  !captureBarEl ||
  !sidePanelEl ||
  !sidePanelBodyEl ||
  !panelTitleEl ||
  !panelCloseBtn ||
  !panelMissionsEl ||
  !panelTechEl ||
  !panelAllianceEl ||
  !panelLeaderboardEl ||
  !panelFeedEl ||
  !panelSettingsEl ||
  !panelSettingsPreviewEl ||
  !panelColorInput ||
  !panelColorTextInput ||
  !setColorPanelBtn ||
  !feedEl ||
  !techPickEl ||
  !techPointsEl ||
  !techOwnedEl ||
  !techChoiceDetailsEl ||
  !allianceTargetEl ||
  !allianceBreakIdEl ||
  !alliesListEl ||
  !allianceRequestsEl ||
  !missionsEl ||
  !leaderboardEl ||
  !allianceSendBtn ||
  !allianceBreakBtn ||
  !techChooseBtn ||
  !mobileSheetEl ||
  !mobileSheetHeadEl ||
  !mobileCoreEl ||
  !mobilePanelCoreEl ||
  !mobilePanelMissionsEl ||
  !mobilePanelTechEl ||
  !mobilePanelSocialEl ||
  !mobilePanelIntelEl ||
  !mobileFeedEl ||
  !mobileLeaderboardEl ||
  !mobileTechPickEl ||
  !mobileTechChooseBtn ||
  !mobileTechPointsEl ||
  !mobileTechOwnedEl ||
  !mobileTechChoiceDetailsEl ||
  !mobileAllianceTargetEl ||
  !mobileAllianceBreakIdEl ||
  !mobileAllianceSendBtn ||
  !mobileAllianceBreakBtn ||
  !mobileAllianceRequestsEl ||
  !mobileAlliesListEl ||
  !centerMeBtn ||
  !refreshBtn ||
  !centerMeDesktopBtn ||
  !refreshDesktopBtn ||
  !buildFortDesktopBtn ||
  !buildFortMobileBtn ||
  !tileColorInput ||
  !setColorBtn
) {
  throw new Error("hud elements missing");
}

const state = {
  me: "",
  meName: "",
  connection: "connecting" as "connecting" | "connected" | "initialized" | "disconnected",
  points: 0,
  level: 0,
  stamina: 0,
  availableTechPicks: 0,
  selected: undefined as { x: number; y: number } | undefined,
  hover: undefined as { x: number; y: number } | undefined,
  homeTile: undefined as { x: number; y: number } | undefined,
  tiles: new Map<string, Tile>(),
  camX: 0,
  camY: 0,
  zoom: 22,
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  allies: [] as string[],
  playerColors: new Map<string, string>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  feed: [] as FeedEntry[],
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number } } | undefined,
  leaderboard: { top: [] as LeaderboardEntry[], rivals: [] as LeaderboardEntry[] },
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "missions" | "tech" | "social" | "intel",
  activePanel: null as "missions" | "tech" | "alliance" | "leaderboard" | "feed" | "settings" | null
};

const key = (x: number, y: number): string => `${x},${y}`;
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const ownerColor = (ownerId: string): string => {
  const h = hashString(ownerId) % 360;
  return `hsl(${h} 70% 48%)`;
};
const effectiveColor = (ownerId: string): string => state.playerColors.get(ownerId) ?? ownerColor(ownerId);
const isCoastalLand = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("SEA");
};
const isCoastalSea = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "SEA") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("LAND");
};
const tileNoise = (x: number, y: number, seed: number): number => {
  const h = hashString(`${wrapX(x)}:${wrapY(y)}:${seed}`);
  return (h % 10_000) / 10_000;
};
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const groupedNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = tileNoise(gx, gy, seed);
  const n10 = tileNoise(gx + 1, gy, seed);
  const n01 = tileNoise(gx, gy + 1, seed);
  const n11 = tileNoise(gx + 1, gy + 1, seed);
  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
};
const landTone = (x: number, y: number): string => {
  if (isCoastalLand(x, y)) return "#c8b27c";
  const biome = groupedNoise(x, y, 42, 303);
  const v = groupedNoise(x, y, 28, 99);
  if (biome > 0.62) return "#bfa36e";
  if (v < 0.33) return "#3f8a5c";
  if (v < 0.66) return "#468f63";
  return "#4d976a";
};
const terrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "#1f6ea0" : "#0b3d91";
  if (terrain === "MOUNTAIN") return "#8b8d92";
  return landTone(x, y);
};
const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "WOOD") return "#7b4f2c";
  if (resource === "IRON") return "#c7ced8";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};

const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  state.feed.unshift({ text: msg, type, severity, at: Date.now() });
  state.feed = state.feed.slice(0, 18);
};

const centerOnOwnedTile = (): void => {
  const own = [...state.tiles.values()].find((t) => t.ownerId === state.me);
  if (own) {
    state.camX = own.x;
    state.camY = own.y;
    return;
  }
  if (state.homeTile) {
    state.camX = state.homeTile.x;
    state.camY = state.homeTile.y;
  }
};

const requestViewRefresh = (): void => {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "SUBSCRIBE_CHUNKS",
      cx: Math.floor(state.camX / CHUNK_SIZE),
      cy: Math.floor(state.camY / CHUNK_SIZE),
      radius: 2
    })
  );
};

const isMobile = (): boolean => window.matchMedia("(max-width: 900px)").matches;

const panelTitle = (panel: NonNullable<typeof state.activePanel>): string => {
  if (panel === "missions") return "Missions";
  if (panel === "tech") return "Technology Tree";
  if (panel === "alliance") return "Alliances";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Activity Feed";
  return "Player Identity";
};

const panelToMobile = (panel: NonNullable<typeof state.activePanel>): typeof state.mobilePanel => {
  if (panel === "missions") return "missions";
  if (panel === "tech") return "tech";
  if (panel === "alliance") return "social";
  return "intel";
};

const setActivePanel = (panel: typeof state.activePanel): void => {
  if (state.activePanel === panel) {
    state.activePanel = null;
    renderMobilePanels();
    return;
  }
  state.activePanel = panel;
  if (isMobile() && panel) {
    state.mobilePanel = panelToMobile(panel);
  }
  renderMobilePanels();
};

const renderMobilePanels = (): void => {
  const nav = hud.querySelector<HTMLDivElement>("#mobile-nav");
  if (!nav) return;

  panelActionButtons.forEach((btn) => {
    const panel = btn.dataset.panel as typeof state.activePanel;
    btn.classList.toggle("active", panel === state.activePanel);
  });

  const sideSections = sidePanelBodyEl.querySelectorAll<HTMLElement>(".panel-body");
  sideSections.forEach((s) => {
    s.style.display = s.id === `panel-${state.activePanel}` ? "grid" : "none";
  });

  if (!isMobile()) {
    nav.style.display = "none";
    mobileSheetEl.style.display = "none";
    mobileCoreEl.style.display = "none";
    sidePanelEl.style.display = state.activePanel ? "grid" : "none";
    if (state.activePanel) panelTitleEl.textContent = panelTitle(state.activePanel);
    return;
  }

  sidePanelEl.style.display = "none";
  nav.style.display = "grid";
  mobileCoreEl.style.display = state.mobilePanel === "core" ? "grid" : "none";
  mobileSheetEl.style.display = state.mobilePanel === "core" ? "none" : "grid";

  const mobileSections: Array<[HTMLElement, typeof state.mobilePanel]> = [
    [mobilePanelCoreEl, "core"],
    [mobilePanelMissionsEl, "missions"],
    [mobilePanelTechEl, "tech"],
    [mobilePanelSocialEl, "social"],
    [mobilePanelIntelEl, "intel"]
  ];
  for (const [el, panel] of mobileSections) {
    el.style.display = panel === state.mobilePanel ? "grid" : "none";
  }

  if (state.mobilePanel === "missions") mobileSheetHeadEl.textContent = "Missions";
  else if (state.mobilePanel === "tech") mobileSheetHeadEl.textContent = "Technology Tree";
  else if (state.mobilePanel === "social") mobileSheetHeadEl.textContent = "Alliances";
  else if (state.mobilePanel === "intel") mobileSheetHeadEl.textContent = "Intel";
  else mobileSheetHeadEl.textContent = "Core";

  const buttons = nav.querySelectorAll<HTMLButtonElement>("button[data-mobile-panel]");
  buttons.forEach((b) => {
    b.classList.toggle("active", b.dataset.mobilePanel === state.mobilePanel);
  });
};

const selectedTile = (): Tile | undefined => {
  if (!state.selected) return undefined;
  return state.tiles.get(key(state.selected.x, state.selected.y));
};
const hoverTile = (): Tile | undefined => {
  if (!state.hover) return undefined;
  return state.tiles.get(key(state.hover.x, state.hover.y));
};

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  if (dx + dy === 1) return true;
  if (dx === WORLD_WIDTH - 1 && ay === by) return true;
  if (dy === WORLD_HEIGHT - 1 && ax === bx) return true;
  return false;
};

const pickOriginForTarget = (tx: number, ty: number): Tile | undefined => {
  const candidates = [
    state.tiles.get(key(wrapX(tx), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty)))
  ].filter((t): t is Tile => Boolean(t));
  return candidates.find((t) => t.ownerId === state.me);
};

const renderCaptureProgress = (): void => {
  if (state.capture) {
    const total = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    const elapsed = Date.now() - state.capture.startAt;
    const pct = Math.max(0, Math.min(1, elapsed / total));
    const remaining = Math.max(0, Math.ceil((state.capture.resolvesAt - Date.now()) / 100) / 10);
    captureWrapEl.style.display = "block";
    captureBarEl.style.width = `${Math.floor(pct * 100)}%`;
    captureBarEl.textContent = `Capturing (${state.capture.target.x}, ${state.capture.target.y}) ${remaining.toFixed(1)}s`;
  } else {
    captureWrapEl.style.display = "none";
    captureBarEl.style.width = "0%";
    captureBarEl.textContent = "";
  }
};

const missionCardsHtml = (): string =>
  state.missions
    .map((m) => {
      const pct = Math.min(100, Math.floor((m.progress / Math.max(1, m.target)) * 100));
      const status = m.claimed ? "Claimed" : m.completed ? "Completed" : `${m.progress}/${m.target}`;
      return `<article class="card mission-card">
        <div class="mission-top"><strong>${m.name}</strong><span class="chip">${status}</span></div>
        <p>${m.description}</p>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div class="mission-reward">Reward +${m.rewardPoints}</div>
      </article>`;
    })
    .join("");

const techOwnedHtml = (): string => {
  if (state.techIds.length === 0) return `<article class="card"><p>No techs selected yet.</p></article>`;
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  return state.techIds
    .map((id) => {
      const t = catalogById.get(id);
      const mods = t
        ? Object.entries(t.mods ?? {})
            .map(([k, v]) => `${k} x${Number(v).toFixed(3)}`)
            .join(" | ")
        : "";
      const power = t?.grantsPowerup ? ` | powerup ${t.grantsPowerup.id} +${t.grantsPowerup.charges}` : "";
      return `<article class="card"><strong>${t?.name ?? id}</strong><p>${t?.description ?? id}</p><p>${mods || "No modifiers"}${power}</p></article>`;
    })
    .join("");
};

const renderTechChoiceDetails = (): string => {
  const selectedId = techPickEl.value || mobileTechPickEl.value;
  const t = state.techCatalog.find((x) => x.id === selectedId);
  if (!t) return `<p class="muted">No tech selected.</p>`;
  const mods = Object.entries(t.mods ?? {})
    .map(([k, v]) => `${k} x${Number(v).toFixed(3)}`)
    .join(" | ");
  return `<article class="card">
    <strong>${t.name}</strong>
    <p>${t.description}</p>
    <p><strong>Root:</strong> ${t.rootId}${t.requires ? ` | <strong>Requires:</strong> ${t.requires}` : ""}</p>
    <p><strong>Modifiers:</strong> ${mods || "None"}</p>
    ${t.grantsPowerup ? `<p><strong>Powerup:</strong> ${t.grantsPowerup.id} (+${t.grantsPowerup.charges})</p>` : ""}
  </article>`;
};

const leaderboardHtml = (): string => {
  const line = (e: LeaderboardEntry): string => `${e.name} L${e.level} (${Math.round(e.rating)})`;
  return `
    <article class="card">
      <strong>Top Empires</strong>
      ${state.leaderboard.top.map((e, i) => `<div class="lb-row">${i + 1}. ${line(e)}</div>`).join("")}
    </article>
    <article class="card">
      <strong>Rivals Near You</strong>
      ${state.leaderboard.rivals.map((e) => `<div class="lb-row">${line(e)}</div>`).join("")}
    </article>
  `;
};

const feedIcon = (type: FeedType): string => {
  if (type === "combat") return "⚔";
  if (type === "mission") return "✓";
  if (type === "alliance") return "🤝";
  if (type === "tech") return "⚡";
  if (type === "error") return "!";
  return "i";
};

const feedHtml = (): string => {
  if (state.feed.length === 0) return `<article class="card"><p>No activity yet.</p></article>`;
  return state.feed
    .map((f) => {
      const ageSec = Math.floor((Date.now() - f.at) / 1000);
      const age = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
      return `<article class="card feed-card severity-${f.severity}">
        <div class="feed-icon">${feedIcon(f.type)}</div>
        <div><div>${f.text}</div><span>${age} ago</span></div>
      </article>`;
    })
    .join("");
};

const allianceRequestsHtml = (): string => {
  if (state.incomingAllianceRequests.length === 0) return `<article class="card"><p>No incoming requests.</p></article>`;
  return state.incomingAllianceRequests
    .map(
      (request) => `<article class="card alliance-row">
      <div>
        <strong>${request.fromPlayerId.slice(0, 8)}</strong>
        <p>Request ${request.id.slice(0, 8)}</p>
      </div>
      <button class="panel-btn accept-request" data-request-id="${request.id}">Accept</button>
    </article>`
    )
    .join("");
};

const alliesHtml = (): string => {
  if (state.allies.length === 0) return `<article class="card"><p>No allies.</p></article>`;
  return state.allies
    .map(
      (id) => `<article class="card alliance-row">
      <div><strong>${id.slice(0, 8)}</strong><p>Allied</p></div>
      <button class="panel-btn break-ally" data-ally-id="${id}">Break</button>
    </article>`
    )
    .join("");
};

const renderHud = (): void => {
  const connClass = state.connection === "disconnected" ? "warning" : "normal";
  statsChipsEl.innerHTML = `
    <div class="stat-chip ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>
    <div class="stat-chip"><span>Points</span><strong>${state.points.toFixed(1)}</strong></div>
    <div class="stat-chip"><span>Level</span><strong>${state.level}</strong></div>
    <div class="stat-chip"><span>Stamina</span><strong>${state.stamina}</strong></div>
    <div class="stat-chip"><span>Tech Picks</span><strong>${state.availableTechPicks}</strong></div>
    <div class="stat-chip"><span>Allies</span><strong>${state.allies.length}</strong></div>
  `;

  const selected = selectedTile();
  if (!selected) {
    selectedEl.textContent = "Click any target tile; if it borders your territory, origin is auto-selected.";
  } else {
    selectedEl.textContent = `Selected (${selected.x}, ${selected.y}) ${
      selected.ownerId === state.me ? "[YOURS]" : selected.ownerId ? `[ENEMY ${selected.ownerId.slice(0, 8)}]` : "[NEUTRAL]"
    }`;
  }
  const hovered = hoverTile();
  if (!state.hover) {
    hoverEl.textContent = "Hover tiles to inspect terrain, resource and owner.";
  } else if (!hovered) {
    hoverEl.textContent = `Hover (${state.hover.x}, ${state.hover.y})`;
  } else {
    const ownerLabel = hovered.ownerId ? (hovered.ownerId === state.me ? "you" : hovered.ownerId.slice(0, 8)) : "neutral";
    const flags = [
      hovered.clusterType ? `cluster:${hovered.clusterType}` : "",
      hovered.dockId ? "dock" : "",
      hovered.fort ? `fort:${hovered.fort.status}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    hoverEl.textContent = `Hover (${hovered.x}, ${hovered.y}) | ${hovered.terrain}${hovered.resource ? ` ${hovered.resource}` : ""} | owner: ${ownerLabel}${flags ? ` | ${flags}` : ""}`;
  }

  renderCaptureProgress();

  mobileCoreHelpEl.textContent = `Connection ${state.connection.toUpperCase()} | Use one finger to pan and pinch to zoom.`;

  techPickEl.innerHTML = "";
  mobileTechPickEl.innerHTML = "";
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  for (const choice of state.techChoices) {
    const opt = document.createElement("option");
    opt.value = choice;
    const info = catalogById.get(choice);
    opt.textContent = info ? `${info.name} (${info.id})` : choice;
    techPickEl.append(opt);
    mobileTechPickEl.append(opt.cloneNode(true));
  }
  if (state.techChoices.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = state.availableTechPicks <= 0 ? "No picks left (level up for more)" : "No available tech choices";
    techPickEl.append(opt);
    mobileTechPickEl.append(opt.cloneNode(true));
  }
  techPointsEl.textContent = `Available Tech Picks: ${state.availableTechPicks}`;
  mobileTechPointsEl.textContent = `Available Tech Picks: ${state.availableTechPicks}`;
  techOwnedEl.innerHTML = techOwnedHtml();
  mobileTechOwnedEl.innerHTML = techOwnedHtml();
  techChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  mobileTechChoiceDetailsEl.innerHTML = renderTechChoiceDetails();

  alliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml()}`;
  mobileAlliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml()}`;
  allianceRequestsEl.innerHTML = `<h4>Incoming Requests</h4>${allianceRequestsHtml()}`;
  mobileAllianceRequestsEl.innerHTML = `<h4>Incoming Requests</h4>${allianceRequestsHtml()}`;

  missionsEl.innerHTML = missionCardsHtml();
  mobilePanelMissionsEl.innerHTML = missionCardsHtml();
  leaderboardEl.innerHTML = leaderboardHtml();
  mobileLeaderboardEl.innerHTML = leaderboardHtml();
  feedEl.innerHTML = feedHtml();
  mobileFeedEl.innerHTML = feedHtml();

  panelColorInput.value = tileColorInput.value;
  panelColorTextInput.value = tileColorInput.value;
  panelSettingsPreviewEl.innerHTML = `
    <div class="card">
      <p>Pick your civilization tile color.</p>
      <div class="color-preview">
        <div class="swatch" style="background:${tileColorInput.value}"></div>
        <span>${tileColorInput.value}</span>
      </div>
    </div>
  `;

  const acceptButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-request");
  acceptButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      ws.send(JSON.stringify({ type: "ALLIANCE_ACCEPT", requestId: id }));
    };
  });
  const breakButtons = hud.querySelectorAll<HTMLButtonElement>(".break-ally");
  breakButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.allyId;
      if (!id) return;
      ws.send(JSON.stringify({ type: "ALLIANCE_BREAK", targetPlayerId: id }));
    };
  });

  renderMobilePanels();
};

const resize = (): void => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
resize();

const token = localStorage.getItem("be_token") ?? prompt("Enter login as name:password") ?? "player:pass";
localStorage.setItem("be_token", token);

const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;
const ws = new WebSocket(wsUrl);

const sendAllianceRequest = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  ws.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: t }));
};
const breakAlliance = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  ws.send(JSON.stringify({ type: "ALLIANCE_BREAK", targetPlayerId: t }));
};
const chooseTech = (techId: string): void => {
  if (!techId) return;
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
};
const buildFortOnSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select an owned border/dock tile first.", "error", "warn");
    renderHud();
    return;
  }
  ws.send(JSON.stringify({ type: "BUILD_FORT", x: sel.x, y: sel.y }));
};
const applyTileColor = (value: string): void => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  tileColorInput.value = value;
  panelColorInput.value = value;
  panelColorTextInput.value = value;
  ws.send(JSON.stringify({ type: "SET_TILE_COLOR", color: value }));
};

allianceSendBtn.onclick = () => {
  sendAllianceRequest(allianceTargetEl.value);
};
mobileAllianceSendBtn.onclick = () => {
  sendAllianceRequest(mobileAllianceTargetEl.value);
};
allianceBreakBtn.onclick = () => {
  breakAlliance(allianceBreakIdEl.value);
};
mobileAllianceBreakBtn.onclick = () => {
  breakAlliance(mobileAllianceBreakIdEl.value);
};
techChooseBtn.onclick = () => {
  chooseTech(techPickEl.value);
};
mobileTechChooseBtn.onclick = () => {
  chooseTech(mobileTechPickEl.value);
};
techPickEl.onchange = () => renderHud();
mobileTechPickEl.onchange = () => renderHud();
setColorBtn.onclick = () => {
  applyTileColor(tileColorInput.value);
};
setColorPanelBtn.onclick = () => {
  applyTileColor(panelColorInput.value);
};
panelColorInput.oninput = () => {
  panelColorTextInput.value = panelColorInput.value;
};
panelColorTextInput.onchange = () => {
  if (/^#[0-9a-fA-F]{6}$/.test(panelColorTextInput.value)) panelColorInput.value = panelColorTextInput.value;
};
tileColorInput.oninput = () => {
  panelColorInput.value = tileColorInput.value;
  panelColorTextInput.value = tileColorInput.value;
};

centerMeBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh();
};
centerMeDesktopBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh();
};

refreshBtn.onclick = () => requestViewRefresh();
refreshDesktopBtn.onclick = () => requestViewRefresh();
buildFortDesktopBtn.onclick = () => buildFortOnSelected();
buildFortMobileBtn.onclick = () => buildFortOnSelected();

panelCloseBtn.onclick = () => {
  state.activePanel = null;
  renderHud();
};

panelActionButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.panel as typeof state.activePanel;
    if (!p) return;
    setActivePanel(p);
  };
});

const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
mobileNavButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
    if (!p) return;
    state.mobilePanel = p;
    renderHud();
  };
});

ws.addEventListener("open", () => {
  state.connection = "connected";
  renderHud();
  ws.send(JSON.stringify({ type: "AUTH", token }));
});
ws.addEventListener("close", () => {
  state.connection = "disconnected";
  pushFeed("Disconnected from server.", "error", "error");
  renderHud();
});
ws.addEventListener("error", () => {
  state.connection = "disconnected";
  pushFeed("WebSocket error: cannot reach game server on :3001.", "error", "error");
  renderHud();
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
  if (msg.type === "INIT") {
    state.connection = "initialized";
    const p = msg.player as Record<string, unknown>;
    state.me = p.id as string;
    state.meName = p.name as string;
    state.points = p.points as number;
    state.level = p.level as number;
    state.stamina = p.stamina as number;
    state.availableTechPicks = (p.availableTechPicks as number) ?? 0;
    state.techRootId = p.techRootId as string | undefined;
    state.techIds = (p.techIds as string[]) ?? [];
    state.allies = (p.allies as string[]) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      tileColorInput.value = myTileColor;
    }
    for (const s of ((msg.playerStyles as Array<{ id: string; tileColor?: string }>) ?? [])) {
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
    }
    const homeTile = p.homeTile as { x: number; y: number } | undefined;
    if (homeTile) {
      state.homeTile = homeTile;
      state.camX = homeTile.x;
      state.camY = homeTile.y;
      state.selected = homeTile;
    }
    state.techChoices = (msg.techChoices as string[]) ?? [];
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? [];
    state.missions = (msg.missions as MissionState[]) ?? [];
    state.leaderboard = (msg.leaderboard as { top: LeaderboardEntry[]; rivals: LeaderboardEntry[] }) ?? state.leaderboard;
    state.incomingAllianceRequests = (msg.allianceRequests as AllianceRequest[]) ?? [];
    const season = (msg.config as { season?: { seasonId: string } })?.season;
    pushFeed(`Spawned. ${season?.seasonId ? `Season ${season.seasonId}.` : ""} Your tile is centered.`, "info", "success");
    requestViewRefresh();
    renderHud();
  }
  if (msg.type === "CHUNK_FULL") {
    const tiles = msg.tilesMaskedByFog as Tile[];
    for (const t of tiles) state.tiles.set(key(t.x, t.y), t);
    if (![...state.tiles.values()].some((t) => t.ownerId === state.me)) {
      centerOnOwnedTile();
    }
  }
  if (msg.type === "PLAYER_UPDATE") {
    state.points = msg.points as number;
    state.level = msg.level as number;
    state.stamina = msg.stamina as number;
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.leaderboard = (msg.leaderboard as { top: LeaderboardEntry[]; rivals: LeaderboardEntry[] }) ?? state.leaderboard;
    renderHud();
  }
  if (msg.type === "COMBAT_RESULT") {
    const changes = msg.changes as Array<{ x: number; y: number; ownerId?: string }>;
    for (const c of changes) {
      const existing = state.tiles.get(key(c.x, c.y));
      if (existing) {
        if (c.ownerId) existing.ownerId = c.ownerId;
        else delete existing.ownerId;
      }
    }
    pushFeed(`Combat winner: ${(msg.winnerId as string).slice(0, 8)}`, "combat", "success");
    state.capture = undefined;
    renderHud();
  }
  if (msg.type === "COMBAT_START") {
    const target = msg.target as { x: number; y: number };
    const resolvesAt = msg.resolvesAt as number;
    state.capture = { startAt: Date.now(), resolvesAt, target };
    renderHud();
  }
  if (msg.type === "TILE_DELTA") {
    const updates = (msg.updates as Array<Tile>) ?? [];
    for (const update of updates) {
      const existing = state.tiles.get(key(update.x, update.y));
      const merged: Tile = existing ?? { x: update.x, y: update.y, terrain: update.terrain ?? "LAND" };
      if (update.terrain) merged.terrain = update.terrain;
      if (update.resource !== undefined) merged.resource = update.resource;
      if (update.ownerId) merged.ownerId = update.ownerId;
      else delete merged.ownerId;
      if (update.clusterId !== undefined) merged.clusterId = update.clusterId;
      if (update.clusterType !== undefined) merged.clusterType = update.clusterType;
      if (update.dockId !== undefined) merged.dockId = update.dockId;
      if (update.fort !== undefined) merged.fort = update.fort;
      if (!update.fort) delete merged.fort;
      state.tiles.set(key(update.x, update.y), merged);
    }
  }
  if (msg.type === "TECH_UPDATE") {
    state.techRootId = msg.techRootId as string | undefined;
    state.techIds = (msg.techIds as string[]) ?? [];
    state.techChoices = (msg.nextChoices as string[]) ?? [];
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    pushFeed(`Tech chosen: ${state.techIds[state.techIds.length - 1] ?? "unknown"}`, "tech", "success");
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
    state.incomingAllianceRequests.push(msg.request as AllianceRequest);
    pushFeed(`Incoming alliance request`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    pushFeed(`Alliance request sent`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    state.allies = (msg.allies as string[]) ?? [];
    pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "ERROR") {
    pushFeed(`Error ${msg.code as string}: ${msg.message as string}`, "error", "error");
    state.capture = undefined;
    renderHud();
  }
  if (msg.type === "PLAYER_STYLE") {
    const pid = msg.playerId as string;
    const color = msg.tileColor as string | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) tileColorInput.value = color;
    }
  }
  if (msg.type === "SEASON_ROLLOVER") {
    state.tiles.clear();
    pushFeed("Season rolled over. World and progression reset.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
});

let lastDrawAt = 0;
const draw = (): void => {
  const nowMs = performance.now();
  const minFrameGap = isMobile() ? 40 : 24;
  if (nowMs - lastDrawAt < minFrameGap) {
    requestAnimationFrame(draw);
    return;
  }
  lastDrawAt = nowMs;

  ctx.fillStyle = "#0b1320";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);

  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      const wx = wrapX(state.camX + x);
      const wy = wrapY(state.camY + y);
      const t = state.tiles.get(key(wx, wy));
      const px = (x + halfW) * size;
      const py = (y + halfH) * size;

      if (!t) {
        const tt = terrainAt(wx, wy);
        ctx.fillStyle = terrainColorAt(wx, wy, tt);
      } else if (t.terrain === "SEA" || t.terrain === "MOUNTAIN") {
        ctx.fillStyle = terrainColorAt(wx, wy, t.terrain);
      } else if (t.ownerId) {
        ctx.fillStyle = effectiveColor(t.ownerId);
      } else {
        ctx.fillStyle = terrainColorAt(wx, wy, "LAND");
      }

      ctx.fillRect(px, py, size - 1, size - 1);

      if (t?.dockId) {
        ctx.strokeStyle = "rgba(255, 208, 102, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, size - 7, size - 7);
        ctx.lineWidth = 1;
      }

      if (t?.resource && t.terrain === "LAND") {
        const rc = resourceColor(t.resource);
        if (rc) {
          const marker = Math.max(3, Math.floor(size * 0.22));
          const mx = px + Math.floor((size - marker) / 2);
          const my = py + Math.floor((size - marker) / 2);
          ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
          ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
          ctx.fillStyle = rc;
          ctx.fillRect(mx, my, marker, marker);
        }
      }

      if (t?.fort) {
        ctx.fillStyle = t.fort.status === "active" ? "rgba(239,71,111,0.8)" : "rgba(255,209,102,0.75)";
        const dot = Math.max(3, Math.floor(size * 0.25));
        ctx.fillRect(px + size - dot - 2, py + 2, dot, dot);
      }

      if (t?.ownerId === state.me) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
      }

      if (state.selected && state.selected.x === wx && state.selected.y === wy) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        ctx.lineWidth = 1;
      }
      if (state.hover && state.hover.x === wx && state.hover.y === wy) {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
      }
      if (state.capture && state.capture.target.x === wx && state.capture.target.y === wy) {
        const phase = (Date.now() % 600) / 600;
        const alpha = 0.25 + 0.55 * Math.sin(phase * Math.PI);
        ctx.fillStyle = `rgba(255, 209, 102, ${alpha.toFixed(3)})`;
        ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
      }
    }
  }

  requestAnimationFrame(draw);
};

draw();
renderHud();
setInterval(renderCaptureProgress, 100);

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  state.zoom = Math.min(40, Math.max(10, state.zoom + (ev.deltaY > 0 ? -1 : 1)));
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowUp") state.camY = wrapY(state.camY - 1);
  if (ev.key === "ArrowDown") state.camY = wrapY(state.camY + 1);
  if (ev.key === "ArrowLeft") state.camX = wrapX(state.camX - 1);
  if (ev.key === "ArrowRight") state.camX = wrapX(state.camX + 1);

  if (ev.key.toLowerCase() === "r") requestViewRefresh();
});
window.addEventListener("resize", () => renderMobilePanels());

setInterval(() => {
  requestViewRefresh();
}, isMobile() ? 4_000 : 2_500);

canvas.addEventListener("click", (ev) => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  const gx = Math.floor(ev.offsetX / size) - halfW + state.camX;
  const gy = Math.floor(ev.offsetY / size) - halfH + state.camY;
  const wx = wrapX(gx);
  const wy = wrapY(gy);

  const clicked = state.tiles.get(key(wx, wy));
  if (!clicked) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  const to = clicked;
  if (to.ownerId === state.me) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  // Primary UX: click target first, auto-select any adjacent owned origin tile.
  let from = pickOriginForTarget(to.x, to.y);
  // Optional fallback: if player manually selected an owned adjacent origin, honor it.
  const selectedFrom = state.selected ? state.tiles.get(key(state.selected.x, state.selected.y)) : undefined;
  if (!from && selectedFrom && selectedFrom.ownerId === state.me && isAdjacent(selectedFrom.x, selectedFrom.y, to.x, to.y)) {
    from = selectedFrom;
  }
  if (!from) {
    pushFeed("Target must be adjacent to your territory.", "error", "warn");
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  if (!to.ownerId) {
    ws.send(JSON.stringify({ type: "EXPAND", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
    pushFeed(`Expand attempt (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
  } else {
    ws.send(JSON.stringify({ type: "ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
    pushFeed(`Attack attempt (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
  }

  state.selected = { x: wx, y: wy };
  renderHud();
});

let touchPanStart: { x: number; y: number; camX: number; camY: number } | undefined;
let pinchStart: { distance: number; zoom: number } | undefined;

canvas.addEventListener(
  "touchstart",
  (ev) => {
    if (ev.touches.length === 1) {
      const t = ev.touches[0];
      if (!t) return;
      touchPanStart = { x: t.clientX, y: t.clientY, camX: state.camX, camY: state.camY };
      pinchStart = undefined;
    } else if (ev.touches.length === 2) {
      const a = ev.touches[0];
      const b = ev.touches[1];
      if (!a || !b) return;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStart = { distance: d, zoom: state.zoom };
      touchPanStart = undefined;
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchmove",
  (ev) => {
    if (ev.touches.length === 1 && touchPanStart) {
      const t = ev.touches[0];
      if (!t) return;
      const dx = t.clientX - touchPanStart.x;
      const dy = t.clientY - touchPanStart.y;
      state.camX = wrapX(Math.round(touchPanStart.camX - dx / state.zoom));
      state.camY = wrapY(Math.round(touchPanStart.camY - dy / state.zoom));
      return;
    }
    if (ev.touches.length === 2 && pinchStart) {
      const a = ev.touches[0];
      const b = ev.touches[1];
      if (!a || !b) return;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = d / Math.max(1, pinchStart.distance);
      state.zoom = Math.max(12, Math.min(48, Math.round(pinchStart.zoom * factor)));
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchend",
  () => {
    touchPanStart = undefined;
    pinchStart = undefined;
  },
  { passive: true }
);

canvas.addEventListener("mousemove", (ev) => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  const gx = Math.floor(ev.offsetX / size) - halfW + state.camX;
  const gy = Math.floor(ev.offsetY / size) - halfH + state.camY;
  state.hover = { x: wrapX(gx), y: wrapY(gy) };
});
