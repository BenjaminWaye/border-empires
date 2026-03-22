import "./style.css";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import {
  CHUNK_SIZE,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  SETTLE_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_COST,
  SIEGE_OUTPOST_BUILD_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  exposureRatio,
  grassShadeAt,
  landBiomeAt,
  setWorldSeed,
  terrainAt
} from "@border-empires/shared";

const OBSERVATORY_BUILD_COST = 600;
const OBSERVATORY_VISION_BONUS = 5;
const OBSERVATORY_PROTECTION_RADIUS = 10;

type Tile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  fogged?: boolean;
  resource?: string;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  capital?: boolean;
  breachShockUntil?: number;
  clusterId?: string;
  clusterType?: string;
  regionType?: "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";
  dockId?: string;
  town?: {
    type: "MARKET" | "FARMING" | "ANCIENT";
    baseGoldPerMinute: number;
    supportCurrent: number;
    supportMax: number;
    goldPerMinute: number;
    cap: number;
    isFed: boolean;
    population: number;
    maxPopulation: number;
    populationTier: "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    connectedTownCount: number;
    connectedTownBonus: number;
    connectedTownNames?: string[];
    hasMarket: boolean;
    marketActive: boolean;
    hasGranary: boolean;
    granaryActive: boolean;
    foodUpkeepPerMinute?: number;
  };
  fort?: { ownerId: string; status: "under_construction" | "active"; completesAt?: number };
  observatory?: { ownerId: string; status: "active" | "inactive" };
  siegeOutpost?: { ownerId: string; status: "under_construction" | "active"; completesAt?: number };
  economicStructure?: { ownerId: string; type: "FARMSTEAD" | "CAMP" | "MINE" | "MARKET" | "GRANARY"; status: "active" | "inactive" };
  sabotage?: { ownerId: string; endsAt: number; outputMultiplier: number };
  history?: {
    lastOwnerId?: string | null;
    previousOwners: string[];
    captureCount: number;
    lastCapturedAt?: number | null;
    lastStructureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | "FARMSTEAD" | "CAMP" | "MINE" | "MARKET" | "GRANARY" | null;
    structureHistory: Array<"FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | "FARMSTEAD" | "CAMP" | "MINE" | "MARKET" | "GRANARY">;
    wasMountainCreatedByPlayer?: boolean;
    wasMountainRemovedByPlayer?: boolean;
  };
  yield?: { gold?: number; strategic?: Record<string, number> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Record<string, number> };
  yieldCap?: { gold: number; strategicEach: number };
};

type EmpireVisualStyle = {
  primaryOverlay: string;
  secondaryTint: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "BALANCED";
  borderStyle: "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
  structureAccent: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "NEUTRAL";
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
  tier: number;
  rootId?: string;
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
  grantsPowerup?: { id: string; charges: number };
};
type DomainInfo = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
};
type LeaderboardOverallEntry = { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number };
type LeaderboardMetricEntry = { id: string; name: string; value: number };
type VictoryPressureObjectiveView = {
  id: "TOWN_SUPREMACY" | "ECONOMIC_DOMINANCE" | "FORTRESS_BELT" | "FORWARD_PRESSURE" | "FRONTIER_REACH";
  name: string;
  description: string;
  rewardLabel: string;
  leaderPlayerId?: string;
  leaderName: string;
  progressLabel: string;
  thresholdLabel: string;
  holdDurationSeconds: number;
  holdRemainingSeconds?: number;
  statusLabel: string;
  conditionMet: boolean;
};
type MissionState = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardLabel?: string;
  expiresAt?: number;
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
type DockPair = { ax: number; ay: number; bx: number; by: number };
type CrystalTargetingAbility = "deep_strike" | "naval_infiltration" | "sabotage";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (!canvas || !hud) throw new Error("missing DOM roots");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("missing 2d context");

hud.innerHTML = `
  <div id="top-strip">
    <div id="stats-chips"></div>
    <div id="panel-actions">
      <button class="icon-btn icon-only" data-panel="missions" title="Missions" aria-label="Missions"><span class="tab-icon">◎</span></button>
      <button class="icon-btn icon-only" data-panel="tech" title="Tech" aria-label="Tech"><span class="tab-icon">⚡</span></button>
      <button class="icon-btn icon-only" data-panel="alliance" title="Allies" aria-label="Allies"><span class="tab-icon">👥</span></button>
      <button class="icon-btn icon-only" data-panel="leaderboard" title="Ranks" aria-label="Ranks"><span class="tab-icon">🏆</span></button>
      <button class="icon-btn icon-only" data-panel="feed" title="Feed" aria-label="Feed"><span class="tab-icon">🔔</span></button>
      <button class="icon-btn icon-only" data-panel="settings" title="Style" aria-label="Style"><span class="tab-icon">🎨</span></button>
    </div>
  </div>

  <div id="floating-info">
    <div id="selected"></div>
    <div id="hover"></div>
    <div class="row">
      <button id="center-me-desktop" class="panel-btn utility-btn" type="button">
        <span class="utility-btn-icon" aria-hidden="true">◎</span>
        <span class="utility-btn-copy"><strong>Center</strong><small>Jump to your banner</small></span>
      </button>
      <button id="collect-visible-desktop" class="panel-btn utility-btn utility-btn-collect" type="button">
        <span class="utility-btn-icon" aria-hidden="true">✦</span>
        <span class="utility-btn-copy"><strong>Collect</strong><small>Gather visible yield</small></span>
      </button>
    </div>
  </div>

  <div id="mini-map-wrap">
    <canvas id="mini-map" width="220" height="220"></canvas>
    <div id="mini-map-label">Minimap</div>
  </div>

  <div id="capture-overlay">
    <div id="capture-controls">
      <div id="capture-card">
        <div id="capture-head">
          <div id="capture-title">Capturing Territory...</div>
          <div id="capture-time"></div>
        </div>
        <div id="capture-wrap">
          <div id="capture-bar"></div>
        </div>
        <div id="capture-target"></div>
      </div>
      <button id="capture-cancel" class="capture-cancel-btn" title="Cancel capture">Cancel</button>
    </div>
  </div>

  <div id="map-loading-overlay">
    <div id="map-loading-row">
      <div id="map-loading-spinner" aria-hidden="true"></div>
      <div id="map-loading-copy">
        <div id="map-loading-title">Loading world...</div>
        <div id="map-loading-meta">Preparing map data...</div>
      </div>
    </div>
  </div>

  <div id="auth-overlay">
    <div id="auth-card">
      <section class="auth-panel" data-mode="login">
        <div class="auth-minimal-head">
          <div class="auth-brand">
            <span class="auth-brand-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3 19 6v5c0 5.1-2.95 8.68-7 10-4.05-1.32-7-4.9-7-10V6l7-3Z" />
              </svg>
            </span>
            <span class="auth-brand-text">Border Empires</span>
          </div>
          <p id="auth-copy">Sign in to reopen your empire.</p>
        </div>
        <div class="auth-panel-emblem" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline>
            <line x1="13" x2="19" y1="19" y2="13"></line>
            <line x1="16" x2="20" y1="16" y2="20"></line>
            <line x1="19" x2="21" y1="21" y2="19"></line>
            <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline>
            <line x1="5" x2="9" y1="14" y2="18"></line>
            <line x1="7" x2="4" y1="17" y2="20"></line>
            <line x1="3" x2="5" y1="19" y2="21"></line>
          </svg>
        </div>
        <div class="auth-panel-head">
          <div class="auth-panel-title">Sign in to your empire</div>
          <div class="auth-panel-subtitle">Choose your preferred method</div>
        </div>
        <div class="auth-login-state">
          <button id="auth-google" class="panel-btn auth-google-btn auth-primary-sso">
            <span class="auth-google-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.51 5.51 0 0 1-2.4 3.62v3.01h3.89c2.27-2.09 3.56-5.17 3.56-8.66Z"></path>
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.89-3.01c-1.08.73-2.46 1.16-4.06 1.16-3.12 0-5.76-2.11-6.7-4.95H1.28v3.11A12 12 0 0 0 12 24Z"></path>
                <path fill="#FBBC05" d="M5.3 14.29A7.2 7.2 0 0 1 4.93 12c0-.79.14-1.55.37-2.29V6.6H1.28A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.4l4.02-3.11Z"></path>
                <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.02 3.11c.94-2.84 3.58-4.94 6.7-4.94Z"></path>
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>
          <div class="auth-divider"><span>Or</span></div>
          <div class="auth-email-entry">
            <span class="auth-email-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 6h16v12H4z" />
                <path d="m5 7 7 6 7-6" />
              </svg>
            </span>
            <input id="auth-email" type="email" placeholder="your@email.com" autocomplete="email" />
          </div>
          <button id="auth-email-link" class="panel-btn auth-email-cta">Continue with Email</button>
        </div>
        <div class="auth-confirmation-state">
          <div class="auth-confirmation-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 6h16v12H4z" />
              <path d="m5 7 7 6 7-6" />
            </svg>
          </div>
          <div class="auth-confirmation-copy">
            <h3>Check your email</h3>
            <p>We've sent a magic link to <span id="auth-email-sent-address"></span></p>
          </div>
          <button id="auth-email-reset" type="button">Try a different email</button>
        </div>
        <div class="auth-onboarding-state">
          <div class="auth-onboarding-head">
            <div class="auth-panel-title">Found your first standard.</div>
            <div class="auth-panel-subtitle">Choose the name and color other empires will remember.</div>
          </div>
          <input id="auth-profile-name" type="text" placeholder="Display name" autocomplete="nickname" maxlength="24" />
          <div class="auth-color-block">
            <div class="auth-color-label">Nation color</div>
            <div id="auth-color-presets" class="auth-color-presets">
              <button type="button" class="auth-color-swatch" data-color="#38b000" style="--swatch:#38b000"></button>
              <button type="button" class="auth-color-swatch" data-color="#f59e0b" style="--swatch:#f59e0b"></button>
              <button type="button" class="auth-color-swatch" data-color="#3b82f6" style="--swatch:#3b82f6"></button>
              <button type="button" class="auth-color-swatch" data-color="#ef4444" style="--swatch:#ef4444"></button>
              <button type="button" class="auth-color-swatch" data-color="#8b5cf6" style="--swatch:#8b5cf6"></button>
              <button type="button" class="auth-color-swatch" data-color="#ec4899" style="--swatch:#ec4899"></button>
            </div>
            <label class="auth-color-custom">
              <span>Custom</span>
              <input id="auth-profile-color" type="color" value="#38b000" />
            </label>
          </div>
          <button id="auth-profile-save" class="panel-btn auth-email-cta" type="button">Enter the map</button>
        </div>
        <div class="auth-legal">By continuing, you agree to our <a href="/terms.html" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a></div>
        <div id="auth-status"></div>
        <p class="auth-hint">No password needed. We'll send you a secure link.</p>
        <div class="auth-legacy-controls" hidden>
          <input id="auth-display-name" type="text" placeholder="Display name" autocomplete="nickname" />
          <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password" />
          <div class="auth-actions">
            <button id="auth-login" class="panel-btn">Log In</button>
            <button id="auth-register" class="panel-btn">Create Account</button>
          </div>
        </div>
      </section>
    </div>
  </div>

  <div id="hold-build-menu" style="display:none;"></div>
  <div id="tile-action-menu" style="display:none;"></div>
  <div id="targeting-overlay" style="display:none;"></div>

  <div id="mobile-nav">
    <button data-mobile-panel="core">Core</button>
    <button data-mobile-panel="missions">Missions</button>
    <button data-mobile-panel="tech">Tech</button>
    <button data-mobile-panel="social">Social</button>
    <button data-mobile-panel="intel">Intel</button>
  </div>

  <div id="mobile-core" class="mobile-panel">
    <div id="mobile-core-help" class="card mobile-context-card"></div>
    <div class="row mobile-utility-row">
      <button id="center-me" class="panel-btn utility-btn utility-btn-mobile" type="button">
        <span class="utility-btn-icon" aria-hidden="true">◎</span>
        <span class="utility-btn-copy"><strong>Center</strong><small>Own tile</small></span>
      </button>
      <button id="collect-visible-mobile" class="panel-btn utility-btn utility-btn-collect utility-btn-mobile" type="button">
        <span class="utility-btn-icon" aria-hidden="true">✦</span>
        <span class="utility-btn-copy"><strong>Collect</strong><small>Visible yield</small></span>
      </button>
      <button id="refresh" class="panel-btn">Refresh</button>
      <button id="fog-toggle-mobile" class="panel-btn">Fog On</button>
    </div>
    <div class="row mobile-style-row">
      <input id="tile-color" type="color" value="#38b000" />
      <button id="set-color" class="panel-btn">Apply Tint</button>
    </div>
    <div class="row mobile-action-grid">
      <button id="settle-mobile" class="panel-btn">Settle</button>
      <button id="build-fort-mobile" class="panel-btn">Fort</button>
      <button id="build-siege-mobile" class="panel-btn">Siege</button>
      <button id="uncapture-mobile" class="panel-btn">Release</button>
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
        <div class="tech-section-tabs">
          <button class="tech-section-tab active" data-tech-section="research">Research</button>
          <button class="tech-section-tab" data-tech-section="domains">Domains</button>
        </div>
        <div id="tech-research-section" class="tech-section-panel">
          <div id="tech-current-mods"></div>
          <div class="card tech-legacy-controls">
            <div id="tech-points"></div>
            <div class="row">
              <select id="tech-pick"></select>
              <button id="tech-choose" class="panel-btn">Choose</button>
            </div>
            <div id="tech-choice-details"></div>
          </div>
          <div id="tech-choices-grid"></div>
          <div id="tech-detail-card"></div>
          <div id="tech-owned"></div>
        </div>
        <div id="tech-domains-section" class="tech-section-panel" style="display:none">
          <div id="tech-domains"></div>
        </div>
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
      <div class="tech-section-tabs">
        <button class="tech-section-tab active" data-tech-section="research">Research</button>
        <button class="tech-section-tab" data-tech-section="domains">Domains</button>
      </div>
      <div id="mobile-tech-research-section" class="tech-section-panel">
        <div id="mobile-tech-current-mods"></div>
        <div class="card tech-legacy-controls">
          <div id="mobile-tech-points"></div>
          <div class="row">
            <select id="mobile-tech-pick"></select>
            <button id="mobile-tech-choose" class="panel-btn">Choose</button>
          </div>
          <div id="mobile-tech-choice-details"></div>
        </div>
        <div id="mobile-tech-choices-grid"></div>
        <div id="mobile-tech-detail-card"></div>
        <div id="mobile-tech-owned"></div>
      </div>
      <div id="mobile-tech-domains-section" class="tech-section-panel" style="display:none">
        <div id="mobile-tech-domains"></div>
      </div>
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
    <section id="mobile-panel-core" class="mobile-panel"></section>
  </div>

`;

const statsChipsEl = document.querySelector<HTMLDivElement>("#stats-chips");
const selectedEl = document.querySelector<HTMLDivElement>("#selected");
const hoverEl = document.querySelector<HTMLDivElement>("#hover");
const mobileCoreHelpEl = document.querySelector<HTMLDivElement>("#mobile-core-help");
const miniMapWrapEl = document.querySelector<HTMLDivElement>("#mini-map-wrap");
const miniMapEl = document.querySelector<HTMLCanvasElement>("#mini-map");
const miniMapLabelEl = document.querySelector<HTMLDivElement>("#mini-map-label");
const captureCancelBtn = document.querySelector<HTMLButtonElement>("#capture-cancel");
const captureCardEl = document.querySelector<HTMLDivElement>("#capture-card");
const captureWrapEl = document.querySelector<HTMLDivElement>("#capture-wrap");
const captureBarEl = document.querySelector<HTMLDivElement>("#capture-bar");
const captureTitleEl = document.querySelector<HTMLDivElement>("#capture-title");
const captureTimeEl = document.querySelector<HTMLDivElement>("#capture-time");
const captureTargetEl = document.querySelector<HTMLDivElement>("#capture-target");
const mapLoadingOverlayEl = document.querySelector<HTMLDivElement>("#map-loading-overlay");
const mapLoadingRowEl = document.querySelector<HTMLDivElement>("#map-loading-row");
const mapLoadingSpinnerEl = document.querySelector<HTMLDivElement>("#map-loading-spinner");
const mapLoadingTitleEl = document.querySelector<HTMLDivElement>("#map-loading-title");
const mapLoadingMetaEl = document.querySelector<HTMLDivElement>("#map-loading-meta");
const authOverlayEl = document.querySelector<HTMLDivElement>("#auth-overlay");
const authDisplayNameEl = document.querySelector<HTMLInputElement>("#auth-display-name");
const authEmailEl = document.querySelector<HTMLInputElement>("#auth-email");
const authPasswordEl = document.querySelector<HTMLInputElement>("#auth-password");
const authLoginBtn = document.querySelector<HTMLButtonElement>("#auth-login");
const authRegisterBtn = document.querySelector<HTMLButtonElement>("#auth-register");
const authEmailLinkBtn = document.querySelector<HTMLButtonElement>("#auth-email-link");
const authGoogleBtn = document.querySelector<HTMLButtonElement>("#auth-google");
const authStatusEl = document.querySelector<HTMLDivElement>("#auth-status");
const authPanelEl = document.querySelector<HTMLElement>(".auth-panel");
const authEmailSentAddressEl = document.querySelector<HTMLSpanElement>("#auth-email-sent-address");
const authEmailResetBtn = document.querySelector<HTMLButtonElement>("#auth-email-reset");
const authProfileNameEl = document.querySelector<HTMLInputElement>("#auth-profile-name");
const authProfileColorEl = document.querySelector<HTMLInputElement>("#auth-profile-color");
const authProfileSaveBtn = document.querySelector<HTMLButtonElement>("#auth-profile-save");
const authColorPresetButtons = document.querySelectorAll<HTMLButtonElement>("#auth-color-presets .auth-color-swatch");
const holdBuildMenuEl = document.querySelector<HTMLDivElement>("#hold-build-menu");
const tileActionMenuEl = document.querySelector<HTMLDivElement>("#tile-action-menu");
const targetingOverlayEl = document.querySelector<HTMLDivElement>("#targeting-overlay");
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
const techCurrentModsEl = document.querySelector<HTMLDivElement>("#tech-current-mods");
const techChoicesGridEl = document.querySelector<HTMLDivElement>("#tech-choices-grid");
const techDetailCardEl = document.querySelector<HTMLDivElement>("#tech-detail-card");
const techOwnedEl = document.querySelector<HTMLDivElement>("#tech-owned");
const techDomainsEl = document.querySelector<HTMLDivElement>("#tech-domains");
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
const mobileTechCurrentModsEl = document.querySelector<HTMLDivElement>("#mobile-tech-current-mods");
const mobileTechChoicesGridEl = document.querySelector<HTMLDivElement>("#mobile-tech-choices-grid");
const mobileTechDetailCardEl = document.querySelector<HTMLDivElement>("#mobile-tech-detail-card");
const mobileTechOwnedEl = document.querySelector<HTMLDivElement>("#mobile-tech-owned");
const mobileTechDomainsEl = document.querySelector<HTMLDivElement>("#mobile-tech-domains");
const mobileTechChoiceDetailsEl = document.querySelector<HTMLDivElement>("#mobile-tech-choice-details");
const mobileAllianceTargetEl = document.querySelector<HTMLInputElement>("#mobile-alliance-target");
const mobileAllianceBreakIdEl = document.querySelector<HTMLInputElement>("#mobile-alliance-break-id");
const mobileAllianceSendBtn = document.querySelector<HTMLButtonElement>("#mobile-alliance-send");
const mobileAllianceBreakBtn = document.querySelector<HTMLButtonElement>("#mobile-alliance-break");
const mobileAllianceRequestsEl = document.querySelector<HTMLDivElement>("#mobile-alliance-requests");
const mobileAlliesListEl = document.querySelector<HTMLDivElement>("#mobile-allies-list");
const centerMeBtn = document.querySelector<HTMLButtonElement>("#center-me");
const collectVisibleMobileBtn = document.querySelector<HTMLButtonElement>("#collect-visible-mobile");
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh");
const centerMeDesktopBtn = document.querySelector<HTMLButtonElement>("#center-me-desktop");
const collectVisibleDesktopBtn = document.querySelector<HTMLButtonElement>("#collect-visible-desktop");
const fogToggleMobileBtn = document.querySelector<HTMLButtonElement>("#fog-toggle-mobile");
const settleMobileBtn = document.querySelector<HTMLButtonElement>("#settle-mobile");
const buildFortMobileBtn = document.querySelector<HTMLButtonElement>("#build-fort-mobile");
const buildSiegeMobileBtn = document.querySelector<HTMLButtonElement>("#build-siege-mobile");
const uncaptureMobileBtn = document.querySelector<HTMLButtonElement>("#uncapture-mobile");
const tileColorInput = document.querySelector<HTMLInputElement>("#tile-color");
const setColorBtn = document.querySelector<HTMLButtonElement>("#set-color");
if (
  !statsChipsEl ||
  !selectedEl ||
  !hoverEl ||
  !mobileCoreHelpEl ||
  !miniMapWrapEl ||
  !miniMapEl ||
  !miniMapLabelEl ||
  !captureCancelBtn ||
  !captureCardEl ||
  !captureWrapEl ||
  !captureBarEl ||
  !captureTitleEl ||
  !captureTimeEl ||
  !captureTargetEl ||
  !mapLoadingOverlayEl ||
  !mapLoadingRowEl ||
  !mapLoadingSpinnerEl ||
  !mapLoadingTitleEl ||
  !mapLoadingMetaEl ||
  !authOverlayEl ||
  !authDisplayNameEl ||
  !authEmailEl ||
  !authPasswordEl ||
  !authLoginBtn ||
  !authRegisterBtn ||
  !authEmailLinkBtn ||
  !authGoogleBtn ||
  !authStatusEl ||
  !authPanelEl ||
  !authEmailSentAddressEl ||
  !authEmailResetBtn ||
  !authProfileNameEl ||
  !authProfileColorEl ||
  !authProfileSaveBtn ||
  !holdBuildMenuEl ||
  !tileActionMenuEl ||
  !targetingOverlayEl ||
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
  !techCurrentModsEl ||
  !techChoicesGridEl ||
  !techDetailCardEl ||
  !techOwnedEl ||
  !techDomainsEl ||
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
  !mobileTechCurrentModsEl ||
  !mobileTechChoicesGridEl ||
  !mobileTechDetailCardEl ||
  !mobileTechOwnedEl ||
  !mobileTechDomainsEl ||
  !mobileTechChoiceDetailsEl ||
  !mobileAllianceTargetEl ||
  !mobileAllianceBreakIdEl ||
  !mobileAllianceSendBtn ||
  !mobileAllianceBreakBtn ||
  !mobileAllianceRequestsEl ||
  !mobileAlliesListEl ||
  !centerMeBtn ||
  !collectVisibleMobileBtn ||
  !refreshBtn ||
  !centerMeDesktopBtn ||
  !collectVisibleDesktopBtn ||
  !fogToggleMobileBtn ||
  !settleMobileBtn ||
  !buildFortMobileBtn ||
  !buildSiegeMobileBtn ||
  !uncaptureMobileBtn ||
  !tileColorInput ||
  !setColorBtn
) {
  throw new Error("hud elements missing");
}

const state = {
  me: "",
  meName: "",
  connection: "connecting" as "connecting" | "connected" | "initialized" | "disconnected",
  authReady: false,
  authSessionReady: false,
  hasEverInitialized: false,
  authBusy: false,
  authRetrying: false,
  authConfigured: false,
  authUserLabel: "",
  authError: "",
  profileSetupRequired: false,
  gold: 0,
  level: 0,
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  incomePerMinute: 0,
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, gold: 0 },
  upkeepLastTick: {
    food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    foodCoverage: 1
  },
  foodCoverageWarned: false,
  goldAnimUntil: 0,
  goldAnimDir: 0 as -1 | 0 | 1,
  strategicAnim: {
    FOOD: { until: 0, dir: 0 as -1 | 0 | 1 },
    IRON: { until: 0, dir: 0 as -1 | 0 | 1 },
    CRYSTAL: { until: 0, dir: 0 as -1 | 0 | 1 },
    SUPPLY: { until: 0, dir: 0 as -1 | 0 | 1 },
    SHARD: { until: 0, dir: 0 as -1 | 0 | 1 }
  },
  stamina: 0,
  availableTechPicks: 0,
  defensibilityPct: 100,
  territoryT: 1,
  exposureE: 4,
  settledT: 1,
  settledE: 4,
  selected: undefined as { x: number; y: number } | undefined,
  hover: undefined as { x: number; y: number } | undefined,
  homeTile: undefined as { x: number; y: number } | undefined,
  tiles: new Map<string, Tile>(),
  camX: 0,
  camY: 0,
  zoom: 22,
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  domainIds: [] as string[],
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
  revealCapacity: 1,
  activeRevealTargets: [] as string[],
  abilityCooldowns: {} as Partial<Record<"deep_strike" | "naval_infiltration" | "sabotage" | "reveal_empire" | "create_mountain" | "remove_mountain", number>>,
  revealTargetId: "" as string,
  allies: [] as string[],
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  feed: [] as FeedEntry[],
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number } } | undefined,
  captureAlert: undefined as { title: string; detail: string; until: number; tone: "error" | "warn" } | undefined,
  leaderboard: {
    overall: [] as LeaderboardOverallEntry[],
    byTiles: [] as LeaderboardMetricEntry[],
    byIncome: [] as LeaderboardMetricEntry[],
    byTechs: [] as LeaderboardMetricEntry[]
  },
  victoryPressure: [] as VictoryPressureObjectiveView[],
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "missions" | "tech" | "social" | "intel",
  activePanel: null as "missions" | "tech" | "alliance" | "leaderboard" | "feed" | "settings" | null,
  unreadAttackAlerts: 0,
  techSection: "research" as "research" | "domains",
  techUiSelectedId: "" as string,
  techChoicesSig: "" as string,
  actionQueue: [] as Array<{ x: number; y: number; mode?: "normal" | "breakthrough" | "settle"; retries?: number }>,
  queuedTargetKeys: new Set<string>(),
  actionInFlight: false,
  combatStartAck: false,
  actionStartedAt: 0,
  actionTargetKey: "" as string,
  actionCurrent: undefined as { x: number; y: number; mode?: "normal" | "breakthrough" | "settle"; retries: number } | undefined,
  attackPreview: undefined as
    | {
        fromKey: string;
        toKey: string;
        valid: boolean;
        reason?: string;
        winChance?: number;
        breakthroughWinChance?: number;
        atkEff?: number;
        defEff?: number;
        defenseEffPct?: number;
      }
    | undefined,
  attackPreviewPendingKey: "" as string,
  lastAttackPreviewAt: 0,
  dragPreviewKeys: new Set<string>(),
  boxSelectStart: undefined as { gx: number; gy: number } | undefined,
  boxSelectCurrent: undefined as { gx: number; gy: number } | undefined,
  fogDisabled: false,
  lastSubCx: Number.NaN,
  lastSubCy: Number.NaN,
  lastSubRadius: Number.NaN,
  lastSubAt: 0,
  dockPairs: [] as DockPair[],
  dockRouteCache: new Map<string, Array<{ x: number; y: number }>>(),
  discoveredDockTiles: new Set<string>(),
  discoveredTiles: new Set<string>(),
  autoSettleTargets: new Set<string>(),
  hasOwnedTileInCache: false,
  tileActionMenu: {
    visible: false,
    x: 0,
    y: 0,
    mode: "single" as "single" | "bulk",
    bulkKeys: [] as string[]
  },
  crystalTargeting: {
    active: false,
    ability: "deep_strike" as CrystalTargetingAbility,
    validTargets: new Set<string>(),
    originByTarget: new Map<string, string>()
  },
  mapLoadStartedAt: Date.now(),
  firstChunkAt: 0,
  chunkFullCount: 0
};

const miniMapCtx = miniMapEl.getContext("2d");
if (!miniMapCtx) throw new Error("missing minimap context");
const miniMapBase = document.createElement("canvas");

const firebaseConfig = (() => {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "border-empires.firebaseapp.com";
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "border-empires";
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? "1:979056688511:web:d0af9a130d6eabacf36e4a";
  if (!apiKey || !authDomain || !projectId || !appId) return undefined;
  const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "border-empires.firebasestorage.app";
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "979056688511";
  const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-8FH65YL4QD";
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  if (measurementId) config.measurementId = measurementId;
  return config;
})();

const firebaseApp = firebaseConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : undefined;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
const googleProvider = firebaseAuth ? new GoogleAuthProvider() : undefined;
let authToken = "";
let authUid = "";
let authEmailLinkSentTo = "";
let authEmailLinkPending = false;
const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";
miniMapBase.width = miniMapEl.width;
miniMapBase.height = miniMapEl.height;
const miniMapBaseCtx = miniMapBase.getContext("2d");
if (!miniMapBaseCtx) throw new Error("missing minimap base context");
let miniMapBaseReady = false;
let miniMapLastDrawCamX = Number.NaN;
let miniMapLastDrawCamY = Number.NaN;
let miniMapLastDrawZoom = Number.NaN;
let miniMapLastDrawAt = 0;
const TERRAIN_COLOR_CACHE_LIMIT = 120_000;
const terrainColorCache = new Map<string, string>();
const terrainColorCacheOrder: string[] = [];
const clearRenderCaches = (): void => {
  terrainColorCache.clear();
  terrainColorCacheOrder.length = 0;
  state.dockRouteCache.clear();
  miniMapBaseReady = false;
  miniMapLastDrawCamX = Number.NaN;
  miniMapLastDrawCamY = Number.NaN;
  miniMapLastDrawZoom = Number.NaN;
};

const key = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): { x: number; y: number } => {
  const [xs, ys] = k.split(",");
  return { x: Number(xs), y: Number(ys) };
};
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
type TileVisibilityState = "unexplored" | "fogged" | "visible";
const tileVisibilityStateAt = (x: number, y: number, tile?: Tile): TileVisibilityState => {
  if (state.fogDisabled) return "visible";
  const k = key(x, y);
  if (!state.discoveredTiles.has(k)) return "unexplored";
  if (!tile || tile.fogged) return "fogged";
  return "visible";
};
const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const ownerColor = (ownerId: string): string => {
  if (ownerId === "barbarian") return "#2f3842";
  const h = hashString(ownerId) % 360;
  return `hsl(${h} 70% 48%)`;
};
const effectiveColor = (ownerId: string): string => state.playerColors.get(ownerId) ?? ownerColor(ownerId);
const visualStyleForOwner = (ownerId: string): EmpireVisualStyle | undefined => state.playerVisualStyles.get(ownerId);
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};
const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const blendHex = (base: string, target: string, amount: number): string => {
  if (!base.startsWith("#") || !target.startsWith("#")) return base;
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
};
const tintTargetForStyle = (style: EmpireVisualStyle | undefined): string | undefined => {
  if (!style) return undefined;
  if (style.secondaryTint === "IRON") return "#3d4755";
  if (style.secondaryTint === "SUPPLY") return "#6b4f2e";
  if (style.secondaryTint === "FOOD") return "#718b42";
  if (style.secondaryTint === "CRYSTAL") return "#4677b8";
  return undefined;
};
const effectiveOverlayColor = (ownerId: string): string => {
  const base = effectiveColor(ownerId);
  const tint = tintTargetForStyle(visualStyleForOwner(ownerId));
  return tint ? blendHex(base, tint, 0.24) : base;
};
const borderColorForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): string => {
  if (ownerId === "barbarian") return "rgba(95, 108, 122, 0.8)";
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
  if (style.borderStyle === "HEAVY") return "rgba(58, 66, 82, 0.9)";
  if (style.borderStyle === "DASHED") return "rgba(198, 167, 112, 0.82)";
  if (style.borderStyle === "SOFT") return "rgba(176, 221, 133, 0.88)";
  if (style.borderStyle === "GLOW") return "rgba(126, 208, 255, 0.92)";
  return stateName === "FRONTIER" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)";
};
const borderLineWidthForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): number => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return stateName === "SETTLED" ? 2 : 1;
  if (style.borderStyle === "HEAVY") return 3;
  if (style.borderStyle === "GLOW") return 2.5;
  if (style.borderStyle === "SOFT") return 2.25;
  return stateName === "SETTLED" ? 2 : 1.5;
};
const structureAccentColor = (ownerId: string, fallback: string): string => {
  const style = visualStyleForOwner(ownerId);
  if (!style) return fallback;
  if (style.structureAccent === "IRON") return "rgba(160, 176, 196, 0.96)";
  if (style.structureAccent === "SUPPLY") return "rgba(232, 176, 94, 0.95)";
  if (style.structureAccent === "FOOD") return "rgba(176, 233, 122, 0.95)";
  if (style.structureAccent === "CRYSTAL") return "rgba(131, 221, 255, 0.95)";
  return fallback;
};
const shortOwnerHistoryLabel = (ownerId?: string | null): string => {
  if (!ownerId) return "Unknown";
  if (ownerId === state.me) return "you";
  if (ownerId === "barbarian") return "Barbarians";
  return `Empire ${ownerId.slice(0, 8)}`;
};
const tileHistoryLines = (tile: Tile): string[] => {
  const history = tile.history;
  if (!history) return [];
  const lines: string[] = [];
  if (history.captureCount > 0) lines.push(`Captured ${history.captureCount} time${history.captureCount === 1 ? "" : "s"}`);
  if (history.lastOwnerId) lines.push(`Last held by ${shortOwnerHistoryLabel(history.lastOwnerId)}`);
  if (history.wasMountainCreatedByPlayer) lines.push("Artificial mountain");
  if (history.wasMountainRemovedByPlayer) lines.push("Former mountain pass");
  if (history.lastStructureType) {
    const label =
      history.lastStructureType === "FORT"
        ? "Former Fort site"
        : history.lastStructureType === "SIEGE_OUTPOST"
          ? "Former Siege Outpost site"
          : history.lastStructureType === "OBSERVATORY"
            ? "Former Observatory site"
            : history.lastStructureType === "FARMSTEAD"
              ? "Former Farmstead site"
              : history.lastStructureType === "CAMP"
                ? "Former Camp site"
                : history.lastStructureType === "MINE"
                  ? "Former Mine site"
                  : "Former Market site";
    lines.push(label);
  }
  return lines;
};
const economicStructureIcon = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "▥";
  if (type === "CAMP") return "⛺";
  if (type === "MINE") return "⛏";
  if (type === "GRANARY") return "◫";
  return "▣";
};
const economicStructureName = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "Farmstead";
  if (type === "CAMP") return "Camp";
  if (type === "MINE") return "Mine";
  if (type === "GRANARY") return "Granary";
  return "Market";
};

const displayTownGoldPerMinute = (tile: Tile): number => {
  if (!tile.town) return 0;
  return tile.town.goldPerMinute;
};

const storedYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  if (gold > 0.01 || goldCap > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  for (const [resource, value] of Object.entries(tile.yield?.strategic ?? {})) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const inspectionHtmlForTile = (tile: Tile): string => {
  const ownerLabel = tile.ownerId ? (tile.ownerId === state.me ? "you" : tile.ownerId.slice(0, 8)) : "neutral";
  const tags = [
    tile.ownershipState ? prettyToken(tile.ownershipState) : "",
    tile.regionType ? prettyToken(tile.regionType) : "",
    tile.clusterType ? prettyToken(tile.clusterType) : "",
    tile.capital ? "Capital" : "",
    tile.dockId ? "Dock" : "",
    tile.fort ? `Fort ${prettyToken(tile.fort.status)}` : "",
    tile.observatory ? `Observatory ${prettyToken(tile.observatory.status)}` : "",
    tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} ${prettyToken(tile.economicStructure.status)}` : "",
    hostileObservatoryProtectingTile(tile) ? "Protected Field" : "",
    tile.siegeOutpost ? `Siege ${prettyToken(tile.siegeOutpost.status)}` : "",
    tile.sabotage && tile.sabotage.endsAt > Date.now() ? `Sabotaged ${Math.ceil((tile.sabotage.endsAt - Date.now()) / 60000)}m` : "",
    tile.breachShockUntil && tile.breachShockUntil > Date.now() ? "Breach-shocked" : ""
  ].filter(Boolean);
  const townBits: string[] = [];
  if (tile.town) {
    townBits.push(`${prettyToken(tile.town.type)} town`);
    townBits.push(`${resourceIconForKey("GOLD")} ${displayTownGoldPerMinute(tile).toFixed(2)}/m`);
    townBits.push(`Cap ${tile.town.cap.toFixed(0)}`);
    townBits.push(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    townBits.push(`Population ${Math.round(tile.town.population).toLocaleString()} (${prettyToken(tile.town.populationTier)})`);
    townBits.push(`Connected towns ${tile.town.connectedTownCount} (+${Math.round(tile.town.connectedTownBonus * 100)}%)`);
    if (tile.town.marketActive) townBits.push("Market active");
    else if (tile.town.hasMarket) townBits.push("Market inactive");
    if (tile.town.granaryActive) townBits.push("Granary active");
    else if (tile.town.hasGranary) townBits.push("Granary inactive");
    if (!tile.town.isFed) townBits.push("Unfed");
    if (typeof tile.town.foodUpkeepPerMinute === "number") {
      townBits.push(`${resourceIconForKey("FOOD")} ${tile.town.foodUpkeepPerMinute.toFixed(2)}/m`);
    }
  }
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([r, v]) => `${resourceIconForKey(r)} ${Number(v).toFixed(1)}/day`);
  const prodInfo = (() => {
    const gpm = tile.town ? 0 : tile.yieldRate?.goldPerMinute ?? 0;
    const parts: string[] = [];
    if (gpm > 0) parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
    parts.push(...prodStrategic);
    return parts.length > 0 ? parts.join("  ") : "";
  })();
  const historyLines = tileHistoryLines(tile);
  const topLine = [
    `<strong>${tile.x}, ${tile.y}</strong>`,
    prettyToken(terrainLabel(tile.x, tile.y, tile.terrain)),
    tile.resource ? prettyToken(resourceLabel(tile.resource)) : ""
  ]
    .filter(Boolean)
    .join(" · ");
  const metaLine = [`Owner ${ownerLabel}`, ...tags].filter(Boolean).join(" · ");
  const extraLine = townBits.length > 0 ? townBits.join(" · ") : prodInfo;
  const storedYield = storedYieldSummary(tile);
  const sabotageLine =
    tile.sabotage && tile.sabotage.endsAt > Date.now()
      ? `Output ${Math.round(tile.sabotage.outputMultiplier * 100)}% until ${new Date(tile.sabotage.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "";
  const structureLine = tile.economicStructure && tile.economicStructure.status === "inactive" ? `Inactive - upkeep not paid` : "";
  return `
    <div class="hover-line">${topLine}</div>
    <div class="hover-subline">${metaLine}</div>
    ${extraLine ? `<div class="hover-subline">${extraLine}</div>` : ""}
    ${prodInfo && townBits.length > 0 ? `<div class="hover-subline">Production ${prodInfo}</div>` : ""}
    ${storedYield ? `<div class="hover-subline">Stored yield ${storedYield}</div>` : ""}
    ${structureLine ? `<div class="hover-subline">${structureLine}</div>` : ""}
    ${sabotageLine ? `<div class="hover-subline hover-accent">${sabotageLine}</div>` : ""}
    ${historyLines.map((line) => `<div class="hover-subline">${line}</div>`).join("")}
  `;
};

const hasCollectableYield = (t: Tile | undefined): boolean => {
  if (!t?.yield) return false;
  if ((t.yield.gold ?? 0) > 0.01) return true;
  return Object.values(t.yield.strategic ?? {}).some((v) => Number(v) > 0.01);
};
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
  const biome = landBiomeAt(x, y);
  if (biome === "COASTAL_SAND") return "#c8b27c";
  if (biome === "SAND") {
    const v = groupedNoise(x, y, 32, 907);
    return v < 0.5 ? "#bfa36e" : "#c9b07a";
  }
  const shade = grassShadeAt(x, y);
  return shade === "DARK" ? "#3f8a5c" : "#4d976a";
};
const terrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "#1f6ea0" : "#0b3d91";
  if (terrain === "MOUNTAIN") return "#8b8d92";
  return landTone(x, y);
};
const cachedTerrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  const k = `${x},${y},${terrain}`;
  const hit = terrainColorCache.get(k);
  if (hit) return hit;
  const c = terrainColorAt(x, y, terrain);
  terrainColorCache.set(k, c);
  terrainColorCacheOrder.push(k);
  if (terrainColorCacheOrder.length > TERRAIN_COLOR_CACHE_LIMIT) {
    const drop = terrainColorCacheOrder.shift();
    if (drop) terrainColorCache.delete(drop);
  }
  return c;
};

type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_DARK"
  | "MOUNTAIN";

const TERRAIN_TEXTURE_SIZE = 64;
const textureCanvas = (): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = TERRAIN_TEXTURE_SIZE;
  c.height = TERRAIN_TEXTURE_SIZE;
  return c;
};
const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const tint = (r: number, g: number, b: number, d: number): [number, number, number] => [
  clamp255(r + d),
  clamp255(g + d),
  clamp255(b + d)
];
const terrainTextures = new Map<TerrainTextureId, HTMLCanvasElement>();
const makeTerrainTexture = (
  base: [number, number, number],
  opts: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean }
): HTMLCanvasElement => {
  const c = textureCanvas();
  const tctx = c.getContext("2d");
  if (!tctx) return c;
  const img = tctx.createImageData(TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const i = (y * TERRAIN_TEXTURE_SIZE + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (opts.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (opts.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let d = grain * opts.grain + wave * (opts.waveA ? 10 : 0);
      if (opts.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        d -= Math.max(0, crack) * opts.crack;
      }
      if (opts.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        d += blade * 0.25;
      }
      if (opts.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        d += pebble * 14;
      }
      const [r, g, b] = tint(br, bg, bb, d);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);
  return c;
};
const initTerrainTextures = (): void => {
  terrainTextures.set("SEA_DEEP", makeTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 }));
  terrainTextures.set("SEA_COAST", makeTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 }));
  terrainTextures.set("SAND", makeTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 }));
  terrainTextures.set("GRASS_LIGHT", makeTerrainTexture([119, 142, 66], { grain: 10, grass: true }));
  terrainTextures.set("GRASS_DARK", makeTerrainTexture([94, 124, 48], { grain: 10, grass: true }));
  const mountain = makeTerrainTexture([126, 126, 129], { grain: 9, crack: 8, rock: true });
  const mctx = mountain.getContext("2d");
  if (mctx) {
    mctx.fillStyle = "rgba(78, 79, 82, 0.82)";
    mctx.beginPath();
    mctx.moveTo(8, 50);
    mctx.lineTo(28, 20);
    mctx.lineTo(46, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(97, 99, 103, 0.85)";
    mctx.beginPath();
    mctx.moveTo(20, 50);
    mctx.lineTo(41, 26);
    mctx.lineTo(56, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(225, 228, 232, 0.75)";
    mctx.beginPath();
    mctx.moveTo(27, 23);
    mctx.lineTo(32, 31);
    mctx.lineTo(37, 23);
    mctx.closePath();
    mctx.fill();
  }
  terrainTextures.set("MOUNTAIN", mountain);
};
const terrainTextureIdAt = (x: number, y: number, terrain: Tile["terrain"]): TerrainTextureId => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "SEA_COAST" : "SEA_DEEP";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(x, y);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  return grassShadeAt(x, y) === "DARK" ? "GRASS_DARK" : "GRASS_LIGHT";
};
const drawTerrainTile = (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number): void => {
  if (size < 8) {
    ctx.fillStyle = cachedTerrainColorAt(wx, wy, terrain);
    ctx.fillRect(px, py, size - 1, size - 1);
    return;
  }
  const id = terrainTextureIdAt(wx, wy, terrain);
  const tex = terrainTextures.get(id);
  if (!tex) {
    ctx.fillStyle = cachedTerrainColorAt(wx, wy, terrain);
    ctx.fillRect(px, py, size - 1, size - 1);
    return;
  }
  ctx.drawImage(tex, 0, 0, tex.width, tex.height, px, py, size - 1, size - 1);
};
const clusterTint = (clusterType: string | undefined): string | undefined => {
  if (clusterType === "FERTILE_PLAINS") return "rgba(233,242,123,0.28)";
  if (clusterType === "IRON_HILLS") return "rgba(199,206,216,0.26)";
  if (clusterType === "CRYSTAL_BASIN") return "rgba(177,117,255,0.3)";
  if (clusterType === "HORSE_STEPPES") return "rgba(191,163,110,0.26)";
  if (clusterType === "ANCIENT_RUINS") return "rgba(250,173,93,0.28)";
  if (clusterType === "COASTAL_SHOALS") return "rgba(110,201,255,0.32)";
  return undefined;
};
const clusterMarkerColor = (clusterType: string | undefined): string | undefined => {
  if (clusterType === "FERTILE_PLAINS") return "#e9f27b";
  if (clusterType === "IRON_HILLS") return "#c7ced8";
  if (clusterType === "CRYSTAL_BASIN") return "#b175ff";
  if (clusterType === "HORSE_STEPPES") return "#d6b48a";
  if (clusterType === "ANCIENT_RUINS") return "#faad5d";
  if (clusterType === "COASTAL_SHOALS") return "#6ec9ff";
  return undefined;
};
const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "FUR") return "#d6b48a";
  if (resource === "WOOD") return "#7b4f2c";
  if (resource === "IRON") return "#c7ced8";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};
const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "FUR") return "FUR";
  if (resource === "FISH") return "FISH";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "GEMS";
  if (resource === "WOOD") return "WOOD";
  return resource ?? "";
};
const strategicLabel = (resource: string): string => {
  if (resource === "FOOD") return "Food";
  if (resource === "IRON") return "Iron";
  if (resource === "CRYSTAL") return "Crystal";
  if (resource === "SUPPLY") return "Supply";
  if (resource === "SHARD") return "Shard";
  return resource;
};
const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "IRON") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "SUPPLY") return "🦊";
  if (resource === "SHARD") return "✦";
  return "•";
};
const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "IRON" || resource === "CRYSTAL" || resource === "SUPPLY" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};
const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};
const formatUpkeepSummary = (upkeep: typeof state.upkeepPerMinute): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeep.food.toFixed(2)}/m`);
  if (upkeep.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeep.iron.toFixed(2)}/m`);
  if (upkeep.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeep.supply.toFixed(2)}/m`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeep.crystal.toFixed(2)}/m`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeep.gold.toFixed(2)}/m`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
const rateToneClass = (rate: number): string => {
  if (rate > 0.001) return "positive";
  if (rate < -0.001) return "negative";
  return "neutral";
};
const prettyToken = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain !== "LAND") return terrain;
  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return "GRASS";
  return "SAND";
};
const toroidDelta = (from: number, to: number, dim: number): number => {
  let d = to - from;
  if (d > dim / 2) d -= dim;
  if (d < -dim / 2) d += dim;
  return d;
};
const worldToScreen = (wx: number, wy: number, size: number, halfW: number, halfH: number): { sx: number; sy: number } => {
  const dx = toroidDelta(state.camX, wx, WORLD_WIDTH);
  const dy = toroidDelta(state.camY, wy, WORLD_HEIGHT);
  return {
    sx: (dx + halfW + 0.5) * size,
    sy: (dy + halfH + 0.5) * size
  };
};

const dockRouteKey = (ax: number, ay: number, bx: number, by: number): string => `${ax},${ay}->${bx},${by}`;
const manhattanToroid = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx + dy;
};
const manhattanLinear = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const nearestSeaNeighbor = (x: number, y: number, tx: number, ty: number): { x: number; y: number } | undefined => {
  const candidates = [
    { x: wrapX(x), y: wrapY(y - 1) },
    { x: wrapX(x + 1), y: wrapY(y) },
    { x: wrapX(x), y: wrapY(y + 1) },
    { x: wrapX(x - 1), y: wrapY(y) }
  ].filter((p) => terrainAt(p.x, p.y) === "SEA");
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => manhattanLinear(a.x, a.y, tx, ty) - manhattanLinear(b.x, b.y, tx, ty));
  return candidates[0];
};

const reconstructSeaPath = (cameFrom: Map<number, number>, endIdx: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  let cur = endIdx;
  while (true) {
    out.push({ x: cur % WORLD_WIDTH, y: Math.floor(cur / WORLD_WIDTH) });
    const prev = cameFrom.get(cur);
    if (prev === undefined) break;
    cur = prev;
  }
  out.reverse();
  return out;
};
const computeDockSeaRoute = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const cacheK = dockRouteKey(ax, ay, bx, by);
  const cached = state.dockRouteCache.get(cacheK);
  if (cached) return cached;

  const aSea = nearestSeaNeighbor(ax, ay, bx, by);
  const bSea = nearestSeaNeighbor(bx, by, ax, ay);
  if (!aSea || !bSea) {
    state.dockRouteCache.set(cacheK, []);
    return [];
  }

  const start = worldIndex(aSea.x, aSea.y);
  const goal = worldIndex(bSea.x, bSea.y);
  const open: number[] = [start];
  const inOpen = new Set<number>([start]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  const fScore = new Map<number, number>([[start, manhattanLinear(aSea.x, aSea.y, bSea.x, bSea.y)]]);
  const maxExpanded = 24_000;
  let expanded = 0;
  let solved = false;

  while (open.length > 0 && expanded < maxExpanded) {
    let bestI = 0;
    let bestF = fScore.get(open[0]!) ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < open.length; i += 1) {
      const score = fScore.get(open[i]!) ?? Number.POSITIVE_INFINITY;
      if (score < bestF) {
        bestF = score;
        bestI = i;
      }
    }
    const current = open.splice(bestI, 1)[0]!;
    inOpen.delete(current);
    expanded += 1;
    if (current === goal) {
      solved = true;
      break;
    }
    const cx = current % WORLD_WIDTH;
    const cy = Math.floor(current / WORLD_WIDTH);
    const neighbors = [
      { x: cx, y: cy - 1 },
      { x: cx + 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx - 1, y: cy }
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.y < 0 || n.x >= WORLD_WIDTH || n.y >= WORLD_HEIGHT) continue;
      if (terrainAt(n.x, n.y) !== "SEA") continue;
      const ni = worldIndex(n.x, n.y);
      const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative >= (gScore.get(ni) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(ni, current);
      gScore.set(ni, tentative);
      fScore.set(ni, tentative + manhattanLinear(n.x, n.y, bSea.x, bSea.y));
      if (!inOpen.has(ni)) {
        inOpen.add(ni);
        open.push(ni);
      }
    }
  }

  let seaPath: Array<{ x: number; y: number }> = [];
  if (solved) seaPath = reconstructSeaPath(cameFrom, goal);
  const route = seaPath;
  state.dockRouteCache.set(cacheK, route);
  return route;
};

const markDockDiscovered = (tile: Tile): void => {
  if (tile.dockId && !tile.fogged) state.discoveredDockTiles.add(key(tile.x, tile.y));
};

const isDockRouteVisibleForPlayer = (pair: DockPair): boolean => {
  if (state.fogDisabled) return true;
  if (state.selected && ((state.selected.x === pair.ax && state.selected.y === pair.ay) || (state.selected.x === pair.bx && state.selected.y === pair.by))) {
    return true;
  }
  return state.discoveredDockTiles.has(key(pair.ax, pair.ay)) && state.discoveredDockTiles.has(key(pair.bx, pair.by));
};

const buildMiniMapBase = (): void => {
  const w = miniMapBase.width;
  const h = miniMapBase.height;
  miniMapBaseCtx.clearRect(0, 0, w, h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const wx = Math.floor((px / w) * WORLD_WIDTH);
      const wy = Math.floor((py / h) * WORLD_HEIGHT);
      const tt = terrainAt(wx, wy);
      miniMapBaseCtx.fillStyle = cachedTerrainColorAt(wx, wy, tt);
      miniMapBaseCtx.fillRect(px, py, 1, 1);
    }
  }
  miniMapBaseReady = true;
  miniMapLastDrawCamX = Number.NaN;
};

const drawMiniMap = (): void => {
  const nowMs = performance.now();
  const miniMapChanged = state.camX !== miniMapLastDrawCamX || state.camY !== miniMapLastDrawCamY || state.zoom !== miniMapLastDrawZoom;
  if (!miniMapChanged && nowMs - miniMapLastDrawAt < 140) return;
  const w = miniMapEl.width;
  const h = miniMapEl.height;
  miniMapCtx.clearRect(0, 0, w, h);
  if (!miniMapBaseReady) {
    miniMapCtx.fillStyle = "#0b1320";
    miniMapCtx.fillRect(0, 0, w, h);
    miniMapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    miniMapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return;
  }
  miniMapCtx.drawImage(miniMapBase, 0, 0);
  if (!state.fogDisabled) {
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const wx = Math.floor((px / w) * WORLD_WIDTH);
        const wy = Math.floor((py / h) * WORLD_HEIGHT);
        const t = state.tiles.get(key(wx, wy));
        const vis = tileVisibilityStateAt(wx, wy, t);
        if (vis === "unexplored") {
          miniMapCtx.fillStyle = "#000000";
          miniMapCtx.fillRect(px, py, 1, 1);
        } else if (vis === "fogged") {
          miniMapCtx.fillStyle = "rgba(0,0,0,0.62)";
          miniMapCtx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  const viewTilesW = canvas.width / state.zoom;
  const viewTilesH = canvas.height / state.zoom;
  const vx = ((state.camX - viewTilesW / 2 + WORLD_WIDTH) % WORLD_WIDTH) / WORLD_WIDTH;
  const vy = ((state.camY - viewTilesH / 2 + WORLD_HEIGHT) % WORLD_HEIGHT) / WORLD_HEIGHT;
  const vw = Math.min(1, viewTilesW / WORLD_WIDTH);
  const vh = Math.min(1, viewTilesH / WORLD_HEIGHT);

  miniMapCtx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  miniMapCtx.lineWidth = 1.5;
  miniMapCtx.strokeRect(vx * w, vy * h, Math.max(2, vw * w), Math.max(2, vh * h));

  const px = (state.camX / WORLD_WIDTH) * w;
  const py = (state.camY / WORLD_HEIGHT) * h;
  miniMapCtx.fillStyle = "#ffd166";
  miniMapCtx.beginPath();
  miniMapCtx.arc(px, py, 2.8, 0, Math.PI * 2);
  miniMapCtx.fill();

  // Dock hints on minimap for faster navigation/discovery.
  miniMapCtx.fillStyle = "rgba(127, 238, 255, 0.9)";
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const aKnown = state.tiles.get(key(pair.ax, pair.ay));
    const bKnown = state.tiles.get(key(pair.bx, pair.by));
    if (!state.fogDisabled && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
    const adx = Math.floor((pair.ax / WORLD_WIDTH) * w);
    const ady = Math.floor((pair.ay / WORLD_HEIGHT) * h);
    const bdx = Math.floor((pair.bx / WORLD_WIDTH) * w);
    const bdy = Math.floor((pair.by / WORLD_HEIGHT) * h);
    miniMapCtx.fillRect(adx - 1, ady - 1, 3, 3);
    miniMapCtx.fillRect(bdx - 1, bdy - 1, 3, 3);
  }
  for (const t of state.tiles.values()) {
    if (!t.town) continue;
    if (!state.fogDisabled && t.fogged) continue;
    const tx = Math.floor((t.x / WORLD_WIDTH) * w);
    const ty = Math.floor((t.y / WORLD_HEIGHT) * h);
    if (t.town.type === "MARKET") miniMapCtx.fillStyle = "rgba(255, 214, 112, 0.92)";
    else if (t.town.type === "FARMING") miniMapCtx.fillStyle = "rgba(157, 236, 130, 0.92)";
    else miniMapCtx.fillStyle = "rgba(196, 169, 255, 0.92)";
    miniMapCtx.fillRect(tx - 1, ty - 1, 3, 3);
  }
  miniMapLastDrawCamX = state.camX;
  miniMapLastDrawCamY = state.camY;
  miniMapLastDrawZoom = state.zoom;
  miniMapLastDrawAt = nowMs;
};

const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  state.feed.unshift({ text: msg, type, severity, at: Date.now() });
  state.feed = state.feed.slice(0, 18);
};

const showCaptureAlert = (title: string, detail: string, tone: "error" | "warn" = "error"): void => {
  state.captureAlert = { title, detail, until: Date.now() + 2200, tone };
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

const requestViewRefresh = (radius = 2, force = false): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const elapsed = Date.now() - state.lastSubAt;
  const sameSub = cx === state.lastSubCx && cy === state.lastSubCy && radius === state.lastSubRadius;
  if (!force && sameSub && elapsed < 700) return;
  state.lastSubCx = cx;
  state.lastSubCy = cy;
  state.lastSubRadius = radius;
  state.lastSubAt = Date.now();
  ws.send(
    JSON.stringify({
      type: "SUBSCRIBE_CHUNKS",
      cx,
      cy,
      radius
    })
  );
};

const maybeRefreshForCamera = (force = false): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (!force && (state.actionInFlight || state.capture || state.actionQueue.length > 0)) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const chunkChanged = cx !== state.lastSubCx || cy !== state.lastSubCy;
  if (force || chunkChanged) requestViewRefresh();
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

const viewportSize = (): { width: number; height: number } => {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
};

const setActivePanel = (panel: typeof state.activePanel): void => {
  if (state.activePanel === panel) {
    state.activePanel = null;
    renderMobilePanels();
    return;
  }
  state.activePanel = panel;
  if (panel === "feed") state.unreadAttackAlerts = 0;
  if (isMobile() && panel) {
    state.mobilePanel = panelToMobile(panel);
    if (state.mobilePanel === "intel") state.unreadAttackAlerts = 0;
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

const handleTileSelection = (wx: number, wy: number, clientX: number, clientY: number): void => {
  if (holdActivated) {
    holdActivated = false;
    return;
  }
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  hideHoldBuildMenu();
  hideTileActionMenu();

  const clicked = state.tiles.get(key(wx, wy));
  const vis = tileVisibilityStateAt(wx, wy, clicked);
  if (state.crystalTargeting.active) {
    if (vis === "unexplored") {
      renderHud();
      return;
    }
    if (clicked) state.selected = { x: wx, y: wy };
    if (clicked && executeCrystalTargeting(clicked)) {
      renderHud();
      return;
    }
    if (clicked && vis === "visible") {
      pushFeed(`${crystalTargetingTitle(state.crystalTargeting.ability)} can only target highlighted tiles.`, "combat", "warn");
    }
    renderHud();
    return;
  }
  if (vis === "unexplored") {
    state.selected = undefined;
    renderHud();
    return;
  }
  if (vis === "fogged") {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }
  if (!clicked) {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }

  const to = clicked;
  state.selected = { x: wx, y: wy };
  const adjacentFromOwned = pickOriginForTarget(to.x, to.y);
  const unreachableForeignClick =
    to.terrain === "LAND" &&
    !to.fogged &&
    to.ownerId !== state.me &&
    !isTileOwnedByAlly(to) &&
    !adjacentFromOwned;
  if (unreachableForeignClick) {
    pushFeed("Target is not connected to your border.", "combat", "warn");
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  if (to.terrain === "LAND" && !to.fogged && !to.ownerId && adjacentFromOwned) {
    if (enqueueTarget(to.x, to.y, "normal")) {
      processActionQueue();
      pushFeed(`Queued frontier capture (${to.x}, ${to.y}).`, "combat", "info");
    }
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  openSingleTileActionMenu(to, clientX, clientY);
  requestAttackPreviewForHover();
  renderHud();
};

const isTownSupportNeighbor = (tx: number, ty: number, sx: number, sy: number): boolean => {
  const dx = Math.min(Math.abs(tx - sx), WORLD_WIDTH - Math.abs(tx - sx));
  const dy = Math.min(Math.abs(ty - sy), WORLD_HEIGHT - Math.abs(ty - sy));
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
};
const hoverTile = (): Tile | undefined => {
  if (!state.hover) return undefined;
  return state.tiles.get(key(state.hover.x, state.hover.y));
};

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

const isAdjacentCardinal = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
};

const dockDestinationsFor = (dx: number, dy: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (const pair of state.dockPairs) {
    if (pair.ax === dx && pair.ay === dy) {
      const k = key(pair.bx, pair.by);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.bx, y: pair.by });
      }
    }
    if (pair.bx === dx && pair.by === dy) {
      const k = key(pair.ax, pair.ay);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.ax, y: pair.ay });
      }
    }
  }
  return out;
};

const pickDockOriginForTarget = (tx: number, ty: number): Tile | undefined => {
  for (const t of state.tiles.values()) {
    if (t.ownerId !== state.me || t.terrain !== "LAND" || t.fogged || !t.dockId) continue;
    const linked = dockDestinationsFor(t.x, t.y);
    for (const d of linked) {
      if ((d.x === tx && d.y === ty) || isAdjacentCardinal(d.x, d.y, tx, ty)) return t;
    }
  }
  return undefined;
};

const pickOriginForTarget = (tx: number, ty: number): Tile | undefined => {
  const candidates = [
    state.tiles.get(key(wrapX(tx), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty + 1)))
  ].filter((t): t is Tile => Boolean(t));
  const adjacent = candidates.find((t) => t.ownerId === state.me);
  if (adjacent) return adjacent;
  return pickDockOriginForTarget(tx, ty);
};

const renderCaptureProgress = (): void => {
  if (state.capture) {
    captureCardEl.dataset.state = "progress";
    const total = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    const elapsed = Date.now() - state.capture.startAt;
    const pct = Math.max(0, Math.min(1, elapsed / total));
    const remaining = Math.max(0, Math.ceil((state.capture.resolvesAt - Date.now()) / 100) / 10);
    captureCardEl.style.display = "grid";
    captureWrapEl.style.display = "block";
    captureCancelBtn.style.display = "inline-flex";
    captureBarEl.style.width = `${Math.floor(pct * 100)}%`;
    captureTitleEl.textContent = "Capturing Territory...";
    captureTimeEl.textContent = `${remaining.toFixed(1)}s`;
    captureTargetEl.textContent = `Target: (${state.capture.target.x}, ${state.capture.target.y})`;
  } else if (state.captureAlert && state.captureAlert.until > Date.now()) {
    captureCardEl.dataset.state = state.captureAlert.tone;
    captureCardEl.style.display = "grid";
    captureWrapEl.style.display = "block";
    captureCancelBtn.style.display = "none";
    captureBarEl.style.width = "100%";
    captureTitleEl.textContent = state.captureAlert.title;
    captureTimeEl.textContent = "";
    captureTargetEl.textContent = state.captureAlert.detail;
  } else {
    delete captureCardEl.dataset.state;
    state.captureAlert = undefined;
    captureCardEl.style.display = "none";
    captureWrapEl.style.display = "none";
    captureCancelBtn.style.display = "none";
    captureBarEl.style.width = "0%";
    captureTitleEl.textContent = "";
    captureTimeEl.textContent = "";
    captureTargetEl.textContent = "";
  }
};
const defensibilityPctFromTE = (t: number | undefined, e: number | undefined): number => {
  if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return state.defensibilityPct;
  return Math.max(0, Math.min(100, (1 - exposureRatio(t, e)) * 100));
};

const missionCardsHtml = (): string =>
  state.missions.length === 0
    ? `<article class="card"><p>Missions are paused for rebalance.</p></article>`
    : state.missions
    .map((m) => {
      const pct = Math.min(100, Math.floor((m.progress / Math.max(1, m.target)) * 100));
      const status = m.claimed ? "Claimed" : m.completed ? "Completed" : `${m.progress}/${m.target}`;
      const expiresText =
        typeof m.expiresAt === "number"
          ? (() => {
              const ms = Math.max(0, m.expiresAt - Date.now());
              const h = Math.floor(ms / 3_600_000);
              const d = Math.floor(h / 24);
              if (d > 0) return `Expires in ${d}d ${h % 24}h`;
              return `Expires in ${h}h`;
            })()
          : "";
      return `<article class="card mission-card">
        <div class="mission-top"><strong>${m.name}</strong><span class="chip">${status}</span></div>
        <p>${m.description}</p>
        ${expiresText ? `<p class="muted">${expiresText}</p>` : ""}
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div class="mission-reward">${m.rewardLabel ?? `Reward +${m.rewardPoints} Gold`}</div>
      </article>`;
    })
    .join("");

const techOwnedHtml = (): string => {
  if (state.techIds.length === 0) return `<article class="card"><p>No techs selected yet.</p></article>`;
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  return state.techIds
    .map((id) => {
      const t = catalogById.get(id);
      return `<article class="card"><strong>${t?.name ?? id}</strong><p>${t?.description ?? id}</p><p>${t ? formatTechBenefitSummary(t) : id}</p></article>`;
    })
    .join("");
};

const domainOwnedHtml = (): string => {
  if (state.domainIds.length === 0) return `<article class="card"><p>No domains selected yet.</p></article>`;
  const catalogById = new Map(state.domainCatalog.map((d) => [d.id, d]));
  return state.domainIds
    .map((id) => {
      const d = catalogById.get(id);
      return `<article class="card"><strong>${d?.name ?? id}</strong><p>${d?.description ?? id}</p><p>${d ? formatDomainBenefitSummary(d) : id}</p></article>`;
    })
    .join("");
};

const effectSummaryLabel = (key: string, value: unknown): string | null => {
  if (key === "unlockFarmstead" && value === true) return "Unlocks farmsteads";
  if (key === "unlockCamp" && value === true) return "Unlocks camps";
  if (key === "unlockMine" && value === true) return "Unlocks mines";
  if (key === "unlockMarket" && value === true) return "Unlocks markets";
  if (key === "unlockForts" && value === true) return "Unlocks forts";
  if (key === "unlockObservatory" && value === true) return "Unlocks observatories";
  if (key === "unlockSiegeOutposts" && value === true) return "Unlocks siege outposts";
  if (key === "unlockGranary" && value === true) return "Unlocks granaries";
  if (key === "unlockRevealRegion" && value === true) return "Unlocks reveal region";
  if (key === "unlockRevealEmpire" && value === true) return "Unlocks empire reveal";
  if (key === "unlockDeepStrike" && value === true) return "Unlocks deep strike";
  if (key === "unlockNavalInfiltration" && value === true) return "Unlocks naval infiltration";
  if (key === "unlockSabotage" && value === true) return "Unlocks sabotage";
  if (key === "unlockMountainPass" && value === true) return "Unlocks mountain pass";
  if (key === "unlockTerrainShaping" && value === true) return "Unlocks terrain shaping";
  if (key === "unlockBreachAttack" && value === true) return "Unlocks breach attack";
  if (key === "dockGoldOutputMult" && typeof value === "number") return `Dock income +${Math.round((value - 1) * 100)}%`;
  if (key === "dockGoldCapMult" && typeof value === "number") return `Dock cap +${Math.round((value - 1) * 100)}%`;
  if (key === "dockConnectionBonusPerLink" && typeof value === "number") return `Dock route bonus ${Math.round(value * 100)}% per link`;
  if (key === "dockRoutesVisible" && value === true) return "Shows dock routes";
  if (key === "marketCrystalUpkeepMult" && typeof value === "number") return `Market crystal upkeep -${Math.round((1 - value) * 100)}%`;
  if (key === "resourceOutputMult" && value && typeof value === "object") {
    const resourceOutput = value as Record<string, unknown>;
    const labels: string[] = [];
    if (typeof resourceOutput.farm === "number" && resourceOutput.farm !== 1) {
      labels.push(`Farm output +${((resourceOutput.farm - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.fish === "number" && resourceOutput.fish !== 1) {
      labels.push(`Fish output +${((resourceOutput.fish - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.iron === "number" && resourceOutput.iron !== 1) {
      labels.push(`Iron output +${((resourceOutput.iron - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.crystal === "number" && resourceOutput.crystal !== 1) {
      labels.push(`Crystal output +${((resourceOutput.crystal - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.supply === "number" && resourceOutput.supply !== 1) {
      labels.push(`Supply output +${((resourceOutput.supply - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.shard === "number" && resourceOutput.shard !== 1) {
      labels.push(`Shard output +${((resourceOutput.shard - 1) * 100).toFixed(0)}%`);
    }
    return labels.length > 0 ? labels.join(" | ") : null;
  }
  if (key === "settlementSpeedMult" && typeof value === "number") return `Settlement speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "settledFoodUpkeepMult" && typeof value === "number") return `Settled food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "settledGoldUpkeepMult" && typeof value === "number") return `Settled gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townFoodUpkeepMult" && typeof value === "number") return `Town food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townGoldOutputMult" && typeof value === "number") return `Town gold output ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "townGoldCapMult" && typeof value === "number") return `Town cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "marketIncomeBonusAdd" && typeof value === "number") return `Market income +${Math.round(value * 100)} pts`;
  if (key === "marketCapBonusAdd" && typeof value === "number") return `Market cap +${Math.round(value * 100)} pts`;
  if (key === "granaryCapBonusAddPctPoints" && typeof value === "number") return `Granary cap +${Math.round(value * 100)} pts`;
  if (key === "populationGrowthMult" && typeof value === "number") return `Population growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "populationIncomeMult" && typeof value === "number") return `Population income ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "connectedTownStepBonusAdd" && typeof value === "number") return `Connected-city bonus +${Math.round(value * 100)} pts/step`;
  if (key === "growthPauseDurationMult" && typeof value === "number") return `War growth pause ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "buildCapacityAdd" && typeof value === "number") return `Build capacity ${value >= 0 ? "+" : ""}${value}`;
  if (key === "operationalTempoMult" && typeof value === "number") return `Operational tempo ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "harvestCapMult" && typeof value === "number") return `Harvest cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortDefenseMult" && typeof value === "number") return `Fort defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortBuildGoldCostMult" && typeof value === "number") return `Fort cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortIronUpkeepMult" && typeof value === "number") return `Fort iron upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortGoldUpkeepMult" && typeof value === "number") return `Fort gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "outpostAttackMult" && typeof value === "number") return `Outpost attack ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostSupplyUpkeepMult" && typeof value === "number") return `Outpost supply upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "outpostGoldUpkeepMult" && typeof value === "number") return `Outpost gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "revealUpkeepMult" && typeof value === "number") return `Reveal upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "revealCapacityBonus" && typeof value === "number") return `Reveal capacity +${value}`;
  if (key === "visionRadiusBonus" && typeof value === "number") return `Vision radius +${value}`;
  if (key === "settledDefenseMult" && typeof value === "number") return `Settled defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsSettledMult" && typeof value === "number") return `Attack vs settled ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsFortsMult" && typeof value === "number") return `Attack vs forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  return null;
};

const formatTechModifiers = (mods: TechInfo["mods"]): string[] => {
  const lines: string[] = [];
  if (typeof mods.attack === "number" && mods.attack !== 1) lines.push(`Attack ${mods.attack > 1 ? "+" : ""}${((mods.attack - 1) * 100).toFixed(0)}%`);
  if (typeof mods.defense === "number" && mods.defense !== 1) lines.push(`Defense ${mods.defense > 1 ? "+" : ""}${((mods.defense - 1) * 100).toFixed(0)}%`);
  if (typeof mods.income === "number" && mods.income !== 1) lines.push(`Income ${mods.income > 1 ? "+" : ""}${((mods.income - 1) * 100).toFixed(0)}%`);
  if (typeof mods.vision === "number" && mods.vision !== 1) lines.push(`Vision ${mods.vision > 1 ? "+" : ""}${((mods.vision - 1) * 100).toFixed(0)}%`);
  return lines;
};

const formatTechBenefitSummary = (tech: TechInfo): string => {
  const lines = formatTechModifiers(tech.mods);
  if (tech.effects) {
    for (const [key, value] of Object.entries(tech.effects)) {
      const label = effectSummaryLabel(key, value);
      if (label) lines.push(label);
    }
  }
  if (tech.grantsPowerup) lines.push(`Powerup: ${tech.grantsPowerup.id} +${tech.grantsPowerup.charges}`);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

const formatDomainModifiers = (mods: DomainInfo["mods"]): string[] => {
  const lines: string[] = [];
  if (typeof mods.attack === "number" && mods.attack !== 1) lines.push(`Attack ${mods.attack > 1 ? "+" : ""}${((mods.attack - 1) * 100).toFixed(0)}%`);
  if (typeof mods.defense === "number" && mods.defense !== 1) lines.push(`Defense ${mods.defense > 1 ? "+" : ""}${((mods.defense - 1) * 100).toFixed(0)}%`);
  if (typeof mods.income === "number" && mods.income !== 1) lines.push(`Income ${mods.income > 1 ? "+" : ""}${((mods.income - 1) * 100).toFixed(0)}%`);
  if (typeof mods.vision === "number" && mods.vision !== 1) lines.push(`Vision ${mods.vision > 1 ? "+" : ""}${((mods.vision - 1) * 100).toFixed(0)}%`);
  return lines;
};

const formatDomainBenefitSummary = (domain: DomainInfo): string => {
  const lines = formatDomainModifiers(domain.mods);
  if (domain.effects) {
    for (const [key, value] of Object.entries(domain.effects)) {
      const label = effectSummaryLabel(key, value);
      if (label) lines.push(label);
    }
  }
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

const techCurrentModsHtml = (): string => {
  const m = state.mods;
  const chips = [
    { label: "ATK", value: m.attack },
    { label: "DEF", value: m.defense },
    { label: "VIS", value: m.vision }
  ]
    .map(({ label, value }) => `<div class="tech-mod-chip"><span>${label}</span><strong>x${value.toFixed(2)}</strong></div>`)
    .join("");
  return `<div class="tech-mod-strip">${chips}</div>`;
};

const techTier = (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>): number => {
  const cached = memo.get(id);
  if (typeof cached === "number") return cached;
  const t = byId.get(id);
  if (!t) return 1;
  const parents = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
  if (parents.length === 0) {
    memo.set(id, 1);
    return 1;
  }
  const parentTier = Math.max(...parents.map((p) => techTier(p, byId, memo)));
  const tier = parentTier + 1;
  memo.set(id, tier);
  return tier;
};

const titleCaseFromId = (value: string): string =>
  value
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");

const techNameList = (ids: string[]): string =>
  ids
    .map((id) => state.techCatalog.find((t) => t.id === id)?.name ?? titleCaseFromId(id))
    .join(", ");

const unlockedByTech = (techId: string): TechInfo[] =>
  state.techCatalog
    .filter((candidate) => {
      const prereqs =
        candidate.prereqIds && candidate.prereqIds.length > 0 ? candidate.prereqIds : candidate.requires ? [candidate.requires] : [];
      return prereqs.includes(techId);
    })
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

const formatTechCost = (t: TechInfo): string => {
  const checklist = t.requirements.checklist ?? [];
  const costBits = checklist.filter((c) => /gold|food|iron|crystal|supply|shard/i.test(c.label)).map((c) => c.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallback = checklist.map((c) => c.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

const renderTechChoiceGrid = (): string => {
  const byId = new Map(state.techCatalog.map((t) => [t.id, t]));
  const tierMemo = new Map<string, number>();
  const choices = state.techChoices
    .map((id) => byId.get(id))
    .filter((t): t is TechInfo => Boolean(t))
    .sort((a, b) => techTier(a.id, byId, tierMemo) - techTier(b.id, byId, tierMemo));
  if (choices.length === 0) return `<article class="card"><p>No available technologies right now.</p></article>`;
  const grouped = new Map<number, TechInfo[]>();
  for (const t of choices) {
    const tier = techTier(t.id, byId, tierMemo);
    const arr = grouped.get(tier) ?? [];
    arr.push(t);
    grouped.set(tier, arr);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  return tiers
    .map((tier) => {
      const cards = (grouped.get(tier) ?? [])
        .map((t) => {
          const selected = state.techUiSelectedId === t.id ? " selected" : "";
          const owned = state.techIds.includes(t.id) ? " owned" : "";
          const blocked = t.requirements.canResearch ? "" : " blocked";
          return `<button class="tech-card${selected}${owned}${blocked}" data-tech-card="${t.id}">
            <div class="tech-card-top">
              <strong>${t.name}</strong>
              <span class="tech-root">Tier ${techTier(t.id, byId, tierMemo)}</span>
            </div>
            <p>${formatTechBenefitSummary(t)}</p>
            <p class="tech-card-cost">${formatTechCost(t)}</p>
          </button>`;
        })
        .join("");
      return `<div class="tech-tier-block"><h4>Tier ${tier}</h4><div class="tech-card-grid">${cards}</div></div>`;
    })
    .join("");
};

const renderTechDetailCard = (): string => {
  const selectedId = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value;
  const t = state.techCatalog.find((x) => x.id === selectedId);
  if (!t) return `<article class="card"><p>Select a technology card to inspect details.</p></article>`;
  const checklist = t.requirements.checklist ?? [];
  const checks = checklist
    .map((c) => `<li class="${c.met ? "ok" : "bad"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
    .join("");
  const prereqs = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
  const unlocks = unlockedByTech(t.id);
  const prereqText = prereqs.length > 0 ? techNameList(prereqs) : "Entry tech";
  const canUnlock = t.requirements.canResearch;
  const effectSummary = formatTechBenefitSummary(t);
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <strong>${t.name}</strong>
        <p class="tech-detail-effect">${effectSummary}</p>
        <p class="muted">${prereqs.length > 0 ? `Requires ${prereqText}` : "Entry tech (no prerequisites)"}</p>
      </div>
      <button class="panel-btn tech-unlock-btn" data-tech-unlock="${t.id}" ${canUnlock ? "" : "disabled"}>${canUnlock ? "Unlock" : "Locked"}</button>
    </div>
    <p class="tech-detail-flavor">${t.description}</p>
    ${unlocks.length > 0 ? `<p class="muted"><strong>Unlocks next:</strong> ${unlocks.map((next) => `${next.name} (T${next.tier})`).join(", ")}</p>` : ""}
    <p><strong>Requirements:</strong></p>
    <ul class="tech-req-list">${checks || "<li>None</li>"}</ul>
  </article>`;
};

const formatDomainCost = (d: DomainInfo): string => {
  const checklist = d.requirements.checklist ?? [];
  const costBits = checklist.filter((c) => /gold|food|iron|crystal|supply|shard/i.test(c.label)).map((c) => c.label);
  if (costBits.length > 0) return costBits.join(" · ");
  return "Cost not listed";
};

const renderDomainChoiceGrid = (): string => {
  const byId = new Map(state.domainCatalog.map((d) => [d.id, d]));
  const choices = state.domainChoices.map((id) => byId.get(id)).filter((d): d is DomainInfo => Boolean(d));
  if (choices.length === 0) return `<article class="card"><p>No available domains right now.</p></article>`;
  const grouped = new Map<number, DomainInfo[]>();
  for (const d of choices) {
    const arr = grouped.get(d.tier) ?? [];
    arr.push(d);
    grouped.set(d.tier, arr);
  }
  return [...grouped.keys()]
    .sort((a, b) => a - b)
    .map((tier) => {
      const cards = (grouped.get(tier) ?? [])
        .map((d) => {
          const selected = state.domainUiSelectedId === d.id ? " selected" : "";
          const owned = state.domainIds.includes(d.id) ? " owned" : "";
          const blocked = d.requirements.canResearch ? "" : " blocked";
          return `<button class="tech-card${selected}${owned}${blocked}" data-domain-card="${d.id}">
            <div class="tech-card-top">
              <strong>${d.name}</strong>
              <span class="tech-root">Domain T${d.tier}</span>
            </div>
            <p>${formatDomainBenefitSummary(d)}</p>
            <p class="tech-card-cost">${formatDomainCost(d)}</p>
          </button>`;
        })
        .join("");
      return `<div class="tech-tier-block"><h4>Domain Tier ${tier}</h4><div class="tech-card-grid">${cards}</div></div>`;
    })
    .join("");
};

const renderDomainDetailCard = (): string => {
  const d = state.domainCatalog.find((x) => x.id === state.domainUiSelectedId);
  if (!d) return `<article class="card"><p>Select a domain card to inspect details.</p></article>`;
  const checklist = d.requirements.checklist ?? [];
  const checks = checklist
    .map((c) => `<li class="${c.met ? "ok" : "bad"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
    .join("");
  const canUnlock = d.requirements.canResearch;
  const requiresTechName = techNameList([d.requiresTechId]);
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <strong>${d.name}</strong>
        <p class="muted">Tier ${d.tier} · Requires ${requiresTechName}</p>
      </div>
      <button class="panel-btn domain-unlock-btn" data-domain-unlock="${d.id}" ${canUnlock ? "" : "disabled"}>${canUnlock ? "Unlock" : "Locked"}</button>
    </div>
    <p>${d.description}</p>
    <p><strong>Benefits:</strong> ${formatDomainBenefitSummary(d)}</p>
    <p><strong>Cost:</strong> ${formatDomainCost(d)}</p>
    <p><strong>Requirements:</strong></p>
    <ul class="tech-req-list">${checks || "<li>None</li>"}</ul>
  </article>`;
};

const renderTechChoiceDetails = (): string => {
  const selectedId = techPickEl.value || mobileTechPickEl.value;
  const t = state.techCatalog.find((x) => x.id === selectedId);
  if (!t) return `<p class="muted">No tech selected.</p>`;
  const mods = Object.entries(t.mods ?? {})
    .map(([k, v]) => `${k} x${Number(v).toFixed(3)}`)
    .join(" | ");
  const projected = {
    attack: state.mods.attack * (t.mods.attack ?? 1),
    defense: state.mods.defense * (t.mods.defense ?? 1),
    income: state.mods.income * (t.mods.income ?? 1),
    vision: state.mods.vision * (t.mods.vision ?? 1)
  };
  const checklist = t.requirements.checklist ?? [];
  const checklistHtml =
    checklist.length > 0
      ? `<ul>${checklist
          .map((c) => `<li style="color:${c.met ? "#84f2b8" : "#ff9f9f"}">${c.met ? "✓" : "✗"} ${c.label}</li>`)
          .join("")}</ul>`
      : "<p class=\"muted\">No requirements listed.</p>";
  const prereqs = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
  return `<article class="card">
    <strong>${t.name}</strong>
    <p>${t.description}</p>
    <p><strong>Prerequisites:</strong> ${prereqs.length > 0 ? prereqs.join(", ") : "None"}</p>
    <p><strong>Requirements:</strong></p>
    ${checklistHtml}
    <p><strong>Modifiers:</strong> ${mods || "None"}</p>
    <p><strong>Current:</strong> atk x${state.mods.attack.toFixed(3)} | def x${state.mods.defense.toFixed(3)} | inc x${state.mods.income.toFixed(3)} | vis x${state.mods.vision.toFixed(3)}</p>
    <p><strong>Projected:</strong> atk x${projected.attack.toFixed(3)} | def x${projected.defense.toFixed(3)} | inc x${projected.income.toFixed(3)} | vis x${projected.vision.toFixed(3)}</p>
    ${t.grantsPowerup ? `<p><strong>Powerup:</strong> ${t.grantsPowerup.id} (+${t.grantsPowerup.charges})</p>` : ""}
  </article>`;
};

const affordableTechChoicesCount = (): number => {
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  let n = 0;
  for (const id of state.techChoices) {
    const t = catalogById.get(id);
    if (t && t.requirements.canResearch) n += 1;
  }
  return n;
};

const leaderboardHtml = (): string => {
  const overallLine = (e: LeaderboardOverallEntry): string =>
    `${e.name} | score ${e.score.toFixed(1)} | tiles ${e.tiles} | income ${e.incomePerMinute.toFixed(1)} | tech ${e.techs}`;
  const metricLine = (e: LeaderboardMetricEntry): string => `${e.name} (${e.value.toFixed(1)})`;
  const pressureCards =
    state.victoryPressure.length > 0
      ? `
    <article class="card pressure-card">
      <strong>Victory Pressure</strong>
      ${state.victoryPressure
        .map(
          (objective) => `<div class="pressure-row">
            <div class="pressure-head">
              <span class="pressure-name">${objective.name}</span>
              <span class="pressure-status ${objective.conditionMet ? "is-hot" : ""}">${objective.statusLabel}</span>
            </div>
            <div class="pressure-meta">${objective.description}</div>
            <div class="pressure-meta">Leader: ${objective.leaderName} · ${objective.progressLabel}</div>
            <div class="pressure-meta">${objective.thresholdLabel} · ${objective.rewardLabel}</div>
          </div>`
        )
        .join("")}
    </article>`
      : "";
  return `
    ${pressureCards}
    <article class="card">
      <strong>Overall</strong>
      ${state.leaderboard.overall.map((e, i) => `<div class="lb-row">${i + 1}. ${overallLine(e)}</div>`).join("")}
    </article>
    <article class="card">
      <strong>Most Tiles</strong>
      ${state.leaderboard.byTiles.map((e, i) => `<div class="lb-row">${i + 1}. ${metricLine(e)}</div>`).join("")}
    </article>
    <article class="card">
      <strong>Most Income</strong>
      ${state.leaderboard.byIncome.map((e, i) => `<div class="lb-row">${i + 1}. ${metricLine(e)}</div>`).join("")}
    </article>
    <article class="card">
      <strong>Most Techs</strong>
      ${state.leaderboard.byTechs.map((e, i) => `<div class="lb-row">${i + 1}. ${metricLine(e)}</div>`).join("")}
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

const strategicRibbonHtml = (): string => {
  const nowMs = Date.now();
  const entries: Array<{
    key: "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
    icon: string;
    label: string;
    source: string;
    className: string;
  }> = [
    { key: "FOOD", icon: "🍞", label: "Food", source: "From Farms + Fish", className: "res-food" },
    { key: "IRON", icon: "⛏", label: "Iron", source: "From Iron nodes", className: "res-iron" },
    { key: "CRYSTAL", icon: "💎", label: "Crystal", source: "From Gem nodes", className: "res-crystal" },
    { key: "SUPPLY", icon: "🦊", label: "Supply", source: "From Fur + Wood", className: "res-stone" },
    { key: "SHARD", icon: "✦", label: "Shard", source: "From Ancient towns", className: "res-shard" }
  ];
  return `<div class="resource-ribbon">${entries
    .map((e) => {
      const stock = state.strategicResources[e.key];
      const upkeep =
        e.key === "FOOD"
          ? state.upkeepPerMinute.food
          : e.key === "IRON"
            ? state.upkeepPerMinute.iron
            : e.key === "CRYSTAL"
              ? state.upkeepPerMinute.crystal
              : e.key === "SUPPLY"
                ? state.upkeepPerMinute.supply
                : 0;
      const net = state.strategicProductionPerMinute[e.key] - upkeep;
      const prodText = `${net > 0 ? "+" : ""}${net.toFixed(2)}/m`;
      const rateClass = rateToneClass(net);
      const anim = state.strategicAnim[e.key];
      const deltaClass =
        nowMs < anim.until ? (anim.dir > 0 ? "delta-up" : anim.dir < 0 ? "delta-down" : "") : "";
      return `<div class="resource-pill ${e.className} ${deltaClass}" title="${e.label} · ${e.source}">
        <span class="resource-icon" aria-hidden="true">${e.icon}</span>
        <span class="resource-value-row">
          <span class="resource-value">${Number(stock).toFixed(1)}</span>
          <span class="resource-rate ${rateClass}">${prodText}</span>
        </span>
      </div>`;
    })
    .join("")}</div>`;
};

const setAuthStatus = (message: string, tone: "normal" | "error" = "normal"): void => {
  state.authError = tone === "error" ? message : "";
  authStatusEl.textContent = message;
  authStatusEl.dataset.tone = tone;
};

const syncAuthPanelState = (): void => {
  authPanelEl.dataset.mode = state.profileSetupRequired ? "setup" : authEmailLinkSentTo ? "sent" : "login";
  authEmailSentAddressEl.textContent = authEmailLinkSentTo;
  const activeColor = authProfileColorEl.value.toLowerCase();
  authColorPresetButtons.forEach((btn) => {
    btn.dataset.selected = btn.dataset.color?.toLowerCase() === activeColor ? "true" : "false";
  });
};

const syncAuthOverlay = (): void => {
  authOverlayEl.style.display = state.authSessionReady && !state.profileSetupRequired ? "none" : "grid";
  authLoginBtn.disabled = state.authBusy || !state.authConfigured;
  authRegisterBtn.disabled = state.authBusy || !state.authConfigured;
  authEmailLinkBtn.disabled = state.authBusy || !state.authConfigured;
  authGoogleBtn.disabled = state.authBusy || !state.authConfigured;
  authEmailEl.disabled = state.authBusy || !state.authConfigured;
  authPasswordEl.disabled = state.authBusy || !state.authConfigured;
  authDisplayNameEl.disabled = state.authBusy || !state.authConfigured;
  authEmailResetBtn.disabled = state.authBusy;
  authProfileNameEl.disabled = state.authBusy || !state.authConfigured;
  authProfileColorEl.disabled = state.authBusy || !state.authConfigured;
  authProfileSaveBtn.disabled = state.authBusy || !state.authConfigured;
  syncAuthPanelState();
  if (!state.authConfigured) {
    setAuthStatus("Firebase auth is not configured. Set the VITE_FIREBASE_* env vars.", "error");
  } else if (state.profileSetupRequired && !state.authBusy && !state.authError) {
    setAuthStatus("One last step before the campaign begins.");
  } else if (!state.authReady && !state.authBusy && !state.authError) {
    setAuthStatus("");
  }
};

const authLabelForUser = (user: User): string => user.displayName?.trim() || user.email?.trim() || "Authenticated user";

const seedProfileSetupFields = (name?: string, color?: string): void => {
  const cleanedName = (name ?? "").trim();
  if (cleanedName) authProfileNameEl.value = cleanedName.slice(0, 24);
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) authProfileColorEl.value = color;
  syncAuthPanelState();
};

const authenticateSocket = async (forceRefresh = false): Promise<void> => {
  if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN) return;
  authToken = await firebaseAuth.currentUser.getIdToken(forceRefresh);
  authUid = firebaseAuth.currentUser.uid;
  ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
};

const completeEmailLinkSignIn = async (emailRaw: string): Promise<void> => {
  if (!firebaseAuth) return;
  const email = emailRaw.trim();
  if (!email) {
    setAuthStatus("Enter the email address that received the sign-in link.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Completing email link sign-in...");
  syncAuthOverlay();
  try {
    await signInWithEmailLink(firebaseAuth, email, window.location.href);
    authEmailLinkPending = false;
    authEmailLinkSentTo = "";
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    window.history.replaceState({}, document.title, cleanUrl.toString());
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Email link sign-in failed.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

const renderHud = (): void => {
  const connClass = state.connection === "disconnected" ? "warning" : "normal";
  const pointsClass =
    Date.now() < state.goldAnimUntil ? (state.goldAnimDir > 0 ? " delta-up" : state.goldAnimDir < 0 ? " delta-down" : "") : "";
  const netGoldPerMinute = state.incomePerMinute - state.upkeepPerMinute.gold;
  const goldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(1)}/m`;
  const goldRateClass = rateToneClass(netGoldPerMinute);
  statsChipsEl.innerHTML = `
    <div class="stat-chip ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>
    <div class="stat-chip stat-chip-gold${pointsClass}"><span>Gold</span><strong>${state.gold.toFixed(1)} <em class="stat-chip-rate ${goldRateClass}">${goldRateText}</em></strong></div>
    <div class="stat-chip"><span>Defensibility</span><strong>${Math.round(state.defensibilityPct)}%</strong></div>
    ${strategicRibbonHtml()}
  `;
  fogToggleMobileBtn.textContent = `Fog ${state.fogDisabled ? "Off" : "On"}`;
  const techReady = state.availableTechPicks > 0 && affordableTechChoicesCount() > 0;
  const attackAlertUnread = state.unreadAttackAlerts > 0;
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel === "tech") {
      btn.innerHTML = techReady
        ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
        : '<span class="tab-icon">⚡</span>';
      return;
    }
    if (btn.dataset.panel === "feed") {
      btn.innerHTML = attackAlertUnread
        ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
        : '<span class="tab-icon">🔔</span>';
    }
  });
  const techMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='tech']");
  if (techMobileBtn) techMobileBtn.innerHTML = techReady ? 'Tech <span class="tech-ready-dot" aria-label="upgrade available"></span>' : "Tech";
  const intelMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='intel']");
  if (intelMobileBtn) intelMobileBtn.innerHTML = attackAlertUnread ? 'Intel <span class="attack-alert-dot" aria-label="under attack">🔥</span>' : "Intel";

  if (state.crystalTargeting.active) {
    const ability = state.crystalTargeting.ability;
    const selectedKey = state.selected ? key(state.selected.x, state.selected.y) : "";
    const selectedOriginKey = selectedKey ? state.crystalTargeting.originByTarget.get(selectedKey) : undefined;
    const selectedOrigin = selectedOriginKey ? parseKey(selectedOriginKey) : undefined;
    const validCount = state.crystalTargeting.validTargets.size;
    const detail =
      ability === "deep_strike"
        ? "Pick an enemy tile exactly 2 tiles deep. Mountain barriers block the strike."
        : ability === "naval_infiltration"
          ? "Pick an enemy land tile across up to 4 sea tiles. First landing strike is weaker."
          : "Pick an enemy town or resource tile to cut output by 50% for 45 minutes.";
    const status = selectedOrigin
      ? `Origin ${selectedOrigin.x}, ${selectedOrigin.y} → Target ${state.selected?.x}, ${state.selected?.y}`
      : `Valid targets in view: ${validCount}`;
    targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-${crystalTargetingTone(ability)}">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">${crystalTargetingTitle(ability)}</div>
        <div class="targeting-detail">${detail}</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    targetingOverlayEl.style.display = "block";
    const cancelBtn = targetingOverlayEl.querySelector<HTMLButtonElement>("#targeting-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        renderHud();
      };
    }
  } else {
    targetingOverlayEl.style.display = "none";
    targetingOverlayEl.innerHTML = "";
  }

  const selected = selectedTile();
  if (!selected) {
    selectedEl.innerHTML = `<div class="hover-line"><strong>No tile selected</strong></div><div class="hover-subline">Click a tile for actions. Yellow pulse dot on your settled tile means collectable yield.</div>`;
  } else {
    const selectedVisibility = tileVisibilityStateAt(selected.x, selected.y, selected);
    if (selectedVisibility === "unexplored") {
      selectedEl.innerHTML = `<div class="hover-line"><strong>${selected.x}, ${selected.y}</strong> Unexplored</div>`;
    } else if (selectedVisibility === "fogged") {
      selectedEl.innerHTML = `<div class="hover-line"><strong>${selected.x}, ${selected.y}</strong> Fogged</div><div class="hover-subline">Last seen only.</div>`;
    } else {
      selectedEl.innerHTML = inspectionHtmlForTile(selected);
    }
  }
  hoverEl.innerHTML = "";
  hoverEl.style.display = "none";

  mobileCoreHelpEl.innerHTML = `
    <div class="mobile-context-block">
      <div class="mobile-context-label">Tile</div>
      <div class="mobile-context-value">${selectedEl.innerHTML || selectedEl.textContent || "No tile selected."}</div>
    </div>
  `;

  renderCaptureProgress();
  miniMapLabelEl.textContent = `Minimap (${state.camX}, ${state.camY})`;
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (loadingActive) {
    mapLoadingOverlayEl.style.display = "grid";
    if (state.connection === "disconnected") {
      mapLoadingTitleEl.textContent = "Disconnected from server";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connecting") {
      mapLoadingTitleEl.textContent = "Connecting to server...";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
      const startAt = state.mapLoadStartedAt || Date.now();
      const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
      mapLoadingTitleEl.textContent = "Loading world...";
      mapLoadingMetaEl.textContent = `Elapsed ${elapsed}s · chunks ${state.chunkFullCount}`;
    } else {
      mapLoadingTitleEl.textContent = "Loading world...";
      mapLoadingMetaEl.textContent = "Finalizing map render...";
    }
  } else {
    mapLoadingOverlayEl.style.display = "none";
  }

  const choicesSig = `${state.availableTechPicks}|${state.techChoices.join("|")}|${state.techCatalog.length}`;
  const focused = document.activeElement === techPickEl || document.activeElement === mobileTechPickEl;
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  if (choicesSig !== state.techChoicesSig && !focused) {
    const previous = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value;
    techPickEl.innerHTML = "";
    mobileTechPickEl.innerHTML = "";
    for (const choice of state.techChoices) {
      const opt = document.createElement("option");
      opt.value = choice;
      const info = catalogById.get(choice);
      opt.textContent = info ? `${info.name}${info.requirements.canResearch ? "" : " (blocked)"}` : choice;
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    if (state.techChoices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        state.techIds.length > 0
          ? "No further techs in your current branch this season"
          : "No available tech choices";
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    const fallback = state.techChoices[0] ?? "";
    const nextValue = state.techChoices.includes(previous) ? previous : fallback;
    techPickEl.value = nextValue;
    mobileTechPickEl.value = nextValue;
    state.techUiSelectedId = nextValue;
    state.techChoicesSig = choicesSig;
  } else if (!focused) {
    const selected = techPickEl.value || mobileTechPickEl.value;
    if (selected) state.techUiSelectedId = selected;
  }
  techPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  mobileTechPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  techCurrentModsEl.innerHTML = techCurrentModsHtml();
  mobileTechCurrentModsEl.innerHTML = techCurrentModsHtml();
  techChoicesGridEl.innerHTML = renderTechChoiceGrid();
  mobileTechChoicesGridEl.innerHTML = renderTechChoiceGrid();
  techDetailCardEl.innerHTML = renderTechDetailCard();
  mobileTechDetailCardEl.innerHTML = renderTechDetailCard();
  techOwnedEl.innerHTML = techOwnedHtml();
  mobileTechOwnedEl.innerHTML = techOwnedHtml();
  techDomainsEl.innerHTML = `${renderDomainChoiceGrid()}${renderDomainDetailCard()}${domainOwnedHtml()}`;
  mobileTechDomainsEl.innerHTML = `${renderDomainChoiceGrid()}${renderDomainDetailCard()}${domainOwnedHtml()}`;
  techChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  mobileTechChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  const techResearchSectionEl = document.querySelector<HTMLDivElement>("#tech-research-section");
  const techDomainsSectionEl = document.querySelector<HTMLDivElement>("#tech-domains-section");
  const mobileTechResearchSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-research-section");
  const mobileTechDomainsSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-domains-section");
  if (techResearchSectionEl) techResearchSectionEl.style.display = state.techSection === "research" ? "grid" : "none";
  if (techDomainsSectionEl) techDomainsSectionEl.style.display = state.techSection === "domains" ? "grid" : "none";
  if (mobileTechResearchSectionEl) mobileTechResearchSectionEl.style.display = state.techSection === "research" ? "grid" : "none";
  if (mobileTechDomainsSectionEl) mobileTechDomainsSectionEl.style.display = state.techSection === "domains" ? "grid" : "none";
  const techSectionButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-section]");
  techSectionButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.techSection === state.techSection);
    btn.onclick = () => {
      const section = btn.dataset.techSection;
      if (section !== "research" && section !== "domains") return;
      state.techSection = section;
      renderHud();
    };
  });
  const selectedTech = state.techCatalog.find((t) => t.id === (techPickEl.value || mobileTechPickEl.value));
  const canPick = Boolean(selectedTech && selectedTech.requirements.canResearch);
  techChooseBtn.disabled = !canPick;
  mobileTechChooseBtn.disabled = !canPick;

  const techCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-card]");
  techCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techCard;
      if (!id) return;
      state.techUiSelectedId = id;
      techPickEl.value = id;
      mobileTechPickEl.value = id;
      renderHud();
    };
  });
  const techUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-unlock]");
  techUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techUnlock;
      if (!id) return;
      chooseTech(id);
    };
  });
  const domainCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-card]");
  domainCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainCard;
      if (!id) return;
      state.domainUiSelectedId = id;
      renderHud();
    };
  });
  const domainUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-unlock]");
  domainUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainUnlock;
      if (!id) return;
      sendGameMessage({ type: "CHOOSE_DOMAIN", domainId: id }, "Finish sign-in before choosing a domain.");
    };
  });
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
    <div class="card auth-settings-card">
      <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
      <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
    </div>
  `;

  const acceptButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-request");
  acceptButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_ACCEPT", requestId: id }, "Finish sign-in before responding to alliance requests.");
    };
  });
  const breakButtons = hud.querySelectorAll<HTMLButtonElement>(".break-ally");
  breakButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.allyId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing alliances.");
    };
  });

  const authLogoutBtn = document.querySelector<HTMLButtonElement>("#auth-logout");
  if (authLogoutBtn) {
    authLogoutBtn.onclick = async () => {
      if (!firebaseAuth) return;
      await signOut(firebaseAuth);
      window.location.reload();
    };
  }

  syncAuthOverlay();
  renderMobilePanels();
};

const resize = (): void => {
  const { width, height } = viewportSize();
  canvas.width = width;
  canvas.height = height;
};
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();

const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;
const ws = new WebSocket(wsUrl);
let reconnectReloadTimer: number | undefined;
const requireAuthedSession = (message = "Finish sign-in before interacting with the map."): boolean => {
  if (ws.readyState !== ws.OPEN) {
    setAuthStatus(`Game server unavailable at ${wsUrl}.`, "error");
    syncAuthOverlay();
    return false;
  }
  if (state.authSessionReady) return true;
  setAuthStatus(message, "error");
  syncAuthOverlay();
  return false;
};
const sendGameMessage = (payload: unknown, message?: string): boolean => {
  if (!requireAuthedSession(message)) return false;
  ws.send(JSON.stringify(payload));
  return true;
};
const clearReconnectReloadTimer = (): void => {
  if (reconnectReloadTimer !== undefined) {
    window.clearTimeout(reconnectReloadTimer);
    reconnectReloadTimer = undefined;
  }
};
const scheduleReconnectReload = (): void => {
  if (!state.hasEverInitialized) return;
  if (reconnectReloadTimer !== undefined) return;
  reconnectReloadTimer = window.setTimeout(() => {
    reconnectReloadTimer = undefined;
    if (state.connection === "initialized" || state.connection === "connected") return;
    window.location.reload();
  }, 4000);
};

const sendAllianceRequest = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_REQUEST", targetPlayerName: t }, "Finish sign-in before sending alliance requests.");
};
const breakAlliance = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking alliances.");
};
const currentTechPickId = (): string => {
  const byState = state.techUiSelectedId?.trim();
  if (byState) return byState;
  const byDesktop = techPickEl.value?.trim();
  if (byDesktop) return byDesktop;
  const byMobile = mobileTechPickEl.value?.trim();
  if (byMobile) return byMobile;
  return "";
};
const chooseTech = (techIdRaw?: string): void => {
  const techId = (techIdRaw ?? "").trim() || currentTechPickId();
  if (!techId) {
    console.error("[tech] choose blocked: empty tech id", {
      stateTechUiSelectedId: state.techUiSelectedId,
      desktopValue: techPickEl.value,
      mobileValue: mobileTechPickEl.value,
      choices: state.techChoices
    });
    pushFeed("No tech selected.", "tech", "warn");
    return;
  }
  if (ws.readyState !== ws.OPEN) {
    console.error("[tech] choose blocked: websocket not open", { techId, readyState: ws.readyState });
    pushFeed("Cannot choose tech while disconnected.", "tech", "error");
    return;
  }
  if (!state.authSessionReady) {
    setAuthStatus("Finish sign-in before choosing a technology.", "error");
    syncAuthOverlay();
    return;
  }
  state.techUiSelectedId = techId;
  console.info("[tech] sending CHOOSE_TECH", { techId });
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
};

const explainActionFailure = (code: string, message: string): string => {
  if (code === "INSUFFICIENT_GOLD") return `Action blocked: ${message}.`;
  if (code === "SETTLE_INVALID") return `Cannot settle: ${message}.`;
  if (code === "FORT_BUILD_INVALID") return `Cannot build fort: ${message}.`;
  if (code === "OBSERVATORY_BUILD_INVALID") return `Cannot build observatory: ${message}.`;
  if (code === "SIEGE_OUTPOST_BUILD_INVALID") return `Cannot build siege outpost: ${message}.`;
  if (code === "ECONOMIC_STRUCTURE_BUILD_INVALID") return `Cannot build structure: ${message}.`;
  if (code === "REVEAL_EMPIRE_INVALID") return `Cannot reveal empire: ${message}.`;
  if (code === "SABOTAGE_INVALID") return `Cannot sabotage tile: ${message}.`;
  if (code === "DEEP_STRIKE_INVALID") return `Cannot deep strike: ${message}.`;
  if (code === "NAVAL_INFILTRATION_INVALID") return `Cannot launch naval infiltration: ${message}.`;
  if (code === "CREATE_MOUNTAIN_INVALID") return `Cannot create mountain: ${message}.`;
  if (code === "REMOVE_MOUNTAIN_INVALID") return `Cannot remove mountain: ${message}.`;
  if (code === "NOT_ADJACENT") return "Action blocked: target must border your territory or a linked dock.";
  if (code === "NOT_OWNER") return "Action blocked: you need to launch from one of your own tiles.";
  if (code === "LOCKED") return "Action blocked: the tile is already in combat.";
  if (code === "BARRIER") return "Action blocked: only land tiles can be claimed or attacked.";
  if (code === "SHIELDED") return "Action blocked: that empire is still under spawn protection.";
  if (code === "ALLY_TARGET") return "Action blocked: you cannot attack an allied empire.";
  if (code === "BREAKTHROUGH_TARGET_INVALID") return `Cannot launch breach attack: ${message}.`;
  if (code === "EXPAND_TARGET_OWNED") return "Frontier claim failed: that tile is already owned.";
  return `Error ${code}: ${message}`;
};

const enqueueTarget = (x: number, y: number, mode: "normal" | "breakthrough" | "settle" = "normal"): boolean => {
  const k = key(x, y);
  if (state.queuedTargetKeys.has(k)) return false;
  state.actionQueue.push({ x, y, mode, retries: 0 });
  state.queuedTargetKeys.add(k);
  return true;
};

const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  return {
    gx: Math.floor(offsetX / size) - halfW + state.camX,
    gy: Math.floor(offsetY / size) - halfH + state.camY
  };
};

const computeDragPreview = (): void => {
  const start = state.boxSelectStart;
  const cur = state.boxSelectCurrent;
  state.dragPreviewKeys.clear();
  if (!start || !cur) return;
  const minX = Math.min(start.gx, cur.gx);
  const maxX = Math.max(start.gx, cur.gx);
  const minY = Math.min(start.gy, cur.gy);
  const maxY = Math.max(start.gy, cur.gy);
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  if (area > 2500) return;
  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const wx = wrapX(gx);
      const wy = wrapY(gy);
      const t = state.tiles.get(key(wx, wy));
      if (!t || t.fogged || t.terrain !== "LAND") continue;
      if (t.ownerId === state.me) {
        if (!hasCollectableYield(t)) continue;
      }
      state.dragPreviewKeys.add(key(wx, wy));
    }
  }
};

const buildFrontierQueue = (
  candidates: string[],
  enqueue: (x: number, y: number) => boolean
): { queued: number; skipped: number; queuedKeys: string[] } => {
  if (candidates.length === 0) return { queued: 0, skipped: 0, queuedKeys: [] };
  const owned = new Set<string>();
  for (const t of state.tiles.values()) {
    if (t.ownerId === state.me) owned.add(key(t.x, t.y));
  }
  const planned = new Set<string>();
  const remaining = new Set<string>(candidates);
  let queued = 0;

  while (remaining.size > 0) {
    const frontier: string[] = [];
    for (const k of remaining) {
      const { x, y } = parseKey(k);
      const neighbors = [
        key(wrapX(x), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y)),
        key(wrapX(x), wrapY(y + 1)),
        key(wrapX(x - 1), wrapY(y)),
        key(wrapX(x - 1), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y - 1)),
        key(wrapX(x + 1), wrapY(y + 1)),
        key(wrapX(x - 1), wrapY(y + 1))
      ];
      if (neighbors.some((n) => owned.has(n) || planned.has(n))) frontier.push(k);
    }
    if (frontier.length === 0) break;
    frontier.sort();
    for (const k of frontier) {
      const { x, y } = parseKey(k);
      remaining.delete(k);
      if (enqueueTarget(x, y)) {
        planned.add(k);
        queued += 1;
      }
    }
  }

  return { queued, skipped: remaining.size, queuedKeys: [...planned] };
};
const queueDragSelection = (): { queued: number; skipped: number } =>
  buildFrontierQueue([...state.dragPreviewKeys], (x, y) => enqueueTarget(x, y));

const queueSpecificTargets = (
  targetKeys: string[],
  mode: "normal" | "breakthrough"
): { queued: number; skipped: number; queuedKeys: string[] } =>
  buildFrontierQueue(targetKeys, (x, y) => enqueueTarget(x, y, mode));

const startQueuedSettle = (x: number, y: number, retries: number): boolean => {
  if (!sendGameMessage({ type: "SETTLE", x, y })) return false;
  const startAt = Date.now();
  state.actionCurrent = { x, y, mode: "settle", retries };
  state.actionInFlight = true;
  state.combatStartAck = true;
  state.actionStartedAt = startAt;
  state.actionTargetKey = key(x, y);
  state.capture = { startAt, resolvesAt: startAt + SETTLE_MS, target: { x, y } };
  state.attackPreview = undefined;
  state.attackPreviewPendingKey = "";
  state.selected = { x, y };
  renderHud();
  return true;
};

const processActionQueue = (): boolean => {
  if (state.actionInFlight || ws.readyState !== ws.OPEN || !state.authSessionReady) return false;
  const next = state.actionQueue.shift();
  if (!next) return false;

  const to = state.tiles.get(key(next.x, next.y));
  if (!to) return false;
  if (next.mode === "settle") {
    if (to.ownerId !== state.me || to.ownershipState !== "FRONTIER") {
      state.queuedTargetKeys.delete(key(next.x, next.y));
      return false;
    }
    return startQueuedSettle(to.x, to.y, next.retries ?? 0);
  }
  if (to.ownerId === state.me) return false;

  let from = pickOriginForTarget(to.x, to.y);
  const selectedFrom = state.selected ? state.tiles.get(key(state.selected.x, state.selected.y)) : undefined;
  if (!from && selectedFrom && selectedFrom.ownerId === state.me && isAdjacent(selectedFrom.x, selectedFrom.y, to.x, to.y)) {
    from = selectedFrom;
  }
  if (!from) return false;

  state.actionCurrent = {
    x: to.x,
    y: to.y,
    retries: next.retries ?? 0
  };
  if (next.mode) state.actionCurrent.mode = next.mode;
  state.actionInFlight = true;
  state.combatStartAck = false;
  state.actionStartedAt = Date.now();
  state.actionTargetKey = key(to.x, to.y);
  const optimisticMs = !to.ownerId ? 1_250 : 3_000;
  state.capture = { startAt: Date.now(), resolvesAt: Date.now() + optimisticMs, target: { x: to.x, y: to.y } };
  state.attackPreview = undefined;
  state.attackPreviewPendingKey = "";
  if (!to.ownerId) {
    ws.send(JSON.stringify({ type: "EXPAND", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
    pushFeed(`Queued expand (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
  } else {
    if (next.mode === "breakthrough") {
      ws.send(JSON.stringify({ type: "BREAKTHROUGH_ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
      pushFeed(`Queued breakthrough (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "warn");
    } else {
      ws.send(JSON.stringify({ type: "ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
      pushFeed(`Queued attack (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
    }
  }
  state.selected = { x: to.x, y: to.y };
  renderHud();
  return true;
};
const requestAttackPreviewForHover = (): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!state.selected || !state.hover) return;
  const from = state.tiles.get(key(state.selected.x, state.selected.y));
  const to = state.tiles.get(key(state.hover.x, state.hover.y));
  if (!from || !to) return;
  if (from.ownerId !== state.me) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) {
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    return;
  }
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  const previewKey = `${fromKey}->${toKey}`;
  if (state.attackPreviewPendingKey === previewKey) return;
  if (state.attackPreview && state.attackPreview.fromKey === fromKey && state.attackPreview.toKey === toKey) return;
  const nowMs = Date.now();
  if (nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
};

const requestAttackPreviewForTarget = (to: Tile): void => {
  if (ws.readyState !== ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) return;
  const from = pickOriginForTarget(to.x, to.y);
  if (!from || from.ownerId !== state.me) return;
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  const previewKey = `${fromKey}->${toKey}`;
  if (state.attackPreviewPendingKey === previewKey) return;
  if (state.attackPreview && state.attackPreview.fromKey === fromKey && state.attackPreview.toKey === toKey) return;
  const nowMs = Date.now();
  if (nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
};

const attackPreviewDetailForTarget = (to: Tile, mode: "normal" | "breakthrough" = "normal"): string | undefined => {
  const from = pickOriginForTarget(to.x, to.y);
  if (!from) return undefined;
  const fromKey = key(from.x, from.y);
  const toKey = key(to.x, to.y);
  if (!state.attackPreview || state.attackPreview.fromKey !== fromKey || state.attackPreview.toKey !== toKey) return undefined;
  if (!state.attackPreview.valid) return state.attackPreview.reason ? `Attack ${state.attackPreview.reason}` : undefined;
  if (mode === "breakthrough" && typeof state.attackPreview.breakthroughWinChance === "number") {
    return `${Math.round(state.attackPreview.breakthroughWinChance * 100)}% breach win chance`;
  }
  if (typeof state.attackPreview.winChance === "number") return `${Math.round(state.attackPreview.winChance * 100)}% win chance`;
  return undefined;
};
const buildFortOnSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select an owned border/dock tile first.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "BUILD_FORT", x: sel.x, y: sel.y });
};
const settleSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select a frontier tile first.", "error", "warn");
    renderHud();
    return;
  }
  const tile = state.tiles.get(key(sel.x, sel.y));
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    pushFeed("Selected tile is not one of your frontier tiles.", "error", "warn");
    renderHud();
    return;
  }
  if (!enqueueTarget(sel.x, sel.y, "settle")) {
    pushFeed(`Settle already queued for (${sel.x}, ${sel.y}).`, "combat", "warn");
    renderHud();
    return;
  }
  processActionQueue();
  pushFeed(`Settle queued at (${sel.x}, ${sel.y}).`, "combat", "info");
};
const buildSiegeOutpostOnSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select an owned border tile first.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "BUILD_SIEGE_OUTPOST", x: sel.x, y: sel.y });
};
const uncaptureSelected = (): void => {
  const sel = state.selected;
  if (!sel) {
    pushFeed("Select one of your tiles to uncapture.", "error", "warn");
    renderHud();
    return;
  }
  const t = state.tiles.get(key(sel.x, sel.y));
  if (!t || t.ownerId !== state.me) {
    pushFeed("Selected tile is not owned by you.", "error", "warn");
    renderHud();
    return;
  }
  sendGameMessage({ type: "UNCAPTURE_TILE", x: sel.x, y: sel.y });
};
const cancelOngoingCapture = (): void => {
  state.actionQueue.length = 0;
  state.queuedTargetKeys.clear();
  state.dragPreviewKeys.clear();
  sendGameMessage({ type: "CANCEL_CAPTURE" });
};
const collectVisibleYield = (): void => {
  sendGameMessage({ type: "COLLECT_VISIBLE" });
};
const collectSelectedYield = (): void => {
  const sel = state.selected;
  if (!sel) return;
  sendGameMessage({ type: "COLLECT_TILE", x: sel.x, y: sel.y });
};
const applyTileColor = (value: string): void => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  tileColorInput.value = value;
  panelColorInput.value = value;
  panelColorTextInput.value = value;
  sendGameMessage({ type: "SET_TILE_COLOR", color: value }, "Finish sign-in before changing your nation color.");
};

const hideHoldBuildMenu = (): void => {
  holdBuildMenuEl.style.display = "none";
  holdBuildMenuEl.innerHTML = "";
};

const hideTileActionMenu = (): void => {
  state.tileActionMenu.visible = false;
  state.tileActionMenu.bulkKeys = [];
  tileActionMenuEl.style.display = "none";
  tileActionMenuEl.innerHTML = "";
};

type TileActionDef = {
  id:
    | "settle_land"
    | "launch_attack"
    | "launch_breach_attack"
    | "reveal_empire"
    | "collect_yield"
    | "build_fortification"
    | "build_observatory"
    | "build_farmstead"
    | "build_camp"
    | "build_mine"
    | "build_market"
    | "build_granary"
    | "abandon_territory"
    | "build_siege_camp"
    | "deep_strike"
    | "naval_infiltration"
    | "sabotage_tile"
    | "create_mountain"
    | "remove_mountain";
  label: string;
  cost?: string;
  detail?: string | undefined;
  disabled?: boolean;
  disabledReason?: string;
  targetKey?: string;
  originKey?: string;
};

const actionIcon = (id: TileActionDef["id"]): string => {
  if (id === "settle_land") return "⌂";
  if (id === "launch_attack") return "⚔";
  if (id === "launch_breach_attack") return "✦";
  if (id === "reveal_empire") return "◈";
  if (id === "collect_yield") return "⛃";
  if (id === "build_fortification") return "🛡";
  if (id === "build_observatory") return "◉";
  if (id === "build_farmstead") return "▥";
  if (id === "build_camp") return "⛺";
  if (id === "build_mine") return "⛏";
  if (id === "build_market") return "▣";
  if (id === "build_granary") return "◫";
  if (id === "abandon_territory") return "✕";
  if (id === "deep_strike") return "✦";
  if (id === "naval_infiltration") return "≈";
  if (id === "sabotage_tile") return "☍";
  if (id === "create_mountain") return "⛰";
  if (id === "remove_mountain") return "⌵";
  return "⛺";
};

const isTileOwnedByAlly = (tile: Tile): boolean => Boolean(tile.ownerId && state.allies.includes(tile.ownerId));

const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => {
  for (const candidate of state.tiles.values()) {
    if (!candidate.observatory || candidate.observatory.status !== "active") continue;
    if (!candidate.ownerId || candidate.ownerId === state.me || state.allies.includes(candidate.ownerId)) continue;
    if (candidate.fogged) continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= OBSERVATORY_PROTECTION_RADIUS) return candidate;
  }
  return undefined;
};

const abilityCooldownRemainingMs = (
  abilityId: "deep_strike" | "naval_infiltration" | "sabotage" | "reveal_empire" | "create_mountain" | "remove_mountain"
): number =>
  Math.max(0, (state.abilityCooldowns[abilityId] ?? 0) - Date.now());

const formatCooldownShort = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const hasRevealCapability = (): boolean => {
  return state.techIds.includes("cryptography") || state.activeRevealTargets.length > 0;
};

const hasDeepStrikeCapability = (): boolean => state.techIds.includes("deep-operations");
const hasBreakthroughCapability = (): boolean => state.techIds.includes("breach-doctrine");

const hasNavalInfiltrationCapability = (): boolean => state.techIds.includes("navigation");

const hasSabotageCapability = (): boolean => state.techIds.includes("cryptography");

const hasTerrainShapingCapability = (): boolean => state.techIds.includes("terrain-engineering");

const hasOwnedLandWithinClientRange = (x: number, y: number, range: number): boolean => {
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    if (chebyshevDistanceClient(tile.x, tile.y, x, y) <= range) return true;
  }
  return false;
};

const crystalTargetingTitle = (ability: CrystalTargetingAbility): string => {
  if (ability === "deep_strike") return "Deep Strike";
  if (ability === "naval_infiltration") return "Naval Infiltration";
  return "Sabotage";
};

const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" => {
  if (ability === "deep_strike") return "amber";
  if (ability === "naval_infiltration") return "cyan";
  return "red";
};

const clearCrystalTargeting = (): void => {
  state.crystalTargeting.active = false;
  state.crystalTargeting.validTargets.clear();
  state.crystalTargeting.originByTarget.clear();
};

const lineStepsBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    out.push({ x: wrapX(Math.round(ax + (dx * i) / steps)), y: wrapY(Math.round(ay + (dy * i) / steps)) });
  }
  return out;
};

const findDeepStrikeOriginForTarget = (target: Tile): Tile | undefined => {
  let best: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const dx = Math.min(Math.abs(tile.x - target.x), WORLD_WIDTH - Math.abs(tile.x - target.x));
    const dy = Math.min(Math.abs(tile.y - target.y), WORLD_HEIGHT - Math.abs(tile.y - target.y));
    if (Math.max(dx, dy) < 2 || Math.max(dx, dy) > 2) continue;
    const blocked = lineStepsBetween(tile.x, tile.y, target.x, target.y).some((step) => terrainAt(step.x, step.y) === "MOUNTAIN");
    if (blocked) continue;
    best = tile;
    break;
  }
  return best;
};

const findNavalInfiltrationOriginForTarget = (target: Tile): Tile | undefined => {
  let best: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const dx = Math.min(Math.abs(tile.x - target.x), WORLD_WIDTH - Math.abs(tile.x - target.x));
    const dy = Math.min(Math.abs(tile.y - target.y), WORLD_HEIGHT - Math.abs(tile.y - target.y));
    const distance = Math.max(dx, dy);
    if (distance < 2 || distance > 4) continue;
    const steps = lineStepsBetween(tile.x, tile.y, target.x, target.y);
    if (steps.length === 0) continue;
    const seaOnly = steps.every((step) => terrainAt(step.x, step.y) === "SEA");
    if (!seaOnly) continue;
    best = tile;
    break;
  }
  return best;
};

const navalInfiltrationActionsForSeaTile = (tile: Tile): TileActionDef[] => {
  if (tile.terrain !== "SEA" || tile.fogged) return [];
  const out: TileActionDef[] = [];
  const cooldown = abilityCooldownRemainingMs("naval_infiltration");
  for (const candidate of state.tiles.values()) {
    if (candidate.fogged || candidate.terrain !== "LAND") continue;
    if (!candidate.ownerId || candidate.ownerId === state.me || isTileOwnedByAlly(candidate)) continue;
    const origin = findNavalInfiltrationOriginForTarget(candidate);
    if (!origin) continue;
    const steps = lineStepsBetween(origin.x, origin.y, candidate.x, candidate.y);
    if (!steps.some((step) => step.x === tile.x && step.y === tile.y)) continue;
    const targetName = candidate.town
      ? `${prettyToken(candidate.town.type)} Town`
      : candidate.resource
        ? prettyToken(resourceLabel(candidate.resource))
        : `${terrainLabel(candidate.x, candidate.y, candidate.terrain)} Tile`;
    const observatoryProtection = hostileObservatoryProtectingTile(candidate);
    out.push({
      id: "naval_infiltration",
      label: `Naval Infiltration · ${targetName}`,
      targetKey: key(candidate.x, candidate.y),
      originKey: key(origin.x, origin.y),
      ...tileActionAvailability(
        hasNavalInfiltrationCapability() && !observatoryProtection && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
        !hasNavalInfiltrationCapability()
          ? "Requires Navigation"
          : observatoryProtection
            ? "Blocked by observatory field"
          : cooldown > 0
            ? `Cooldown ${formatCooldownShort(cooldown)}`
            : "Need 30 CRYSTAL",
        `Land at ${candidate.x}, ${candidate.y} • 30 CRYSTAL`
      )
    });
  }
  return out.slice(0, 6);
};

const computeCrystalTargets = (
  ability: CrystalTargetingAbility
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.terrain !== "LAND") continue;
    if (!tile.ownerId || tile.ownerId === state.me || isTileOwnedByAlly(tile)) continue;
    if (hostileObservatoryProtectingTile(tile)) continue;
    if (ability === "deep_strike") {
      const origin = findDeepStrikeOriginForTarget(tile);
      if (!origin) continue;
      validTargets.add(key(tile.x, tile.y));
      originByTarget.set(key(tile.x, tile.y), key(origin.x, origin.y));
      continue;
    }
    if (ability === "naval_infiltration") {
      const origin = findNavalInfiltrationOriginForTarget(tile);
      if (!origin) continue;
      validTargets.add(key(tile.x, tile.y));
      originByTarget.set(key(tile.x, tile.y), key(origin.x, origin.y));
      continue;
    }
    if ((tile.resource || tile.town) && !tile.sabotage) validTargets.add(key(tile.x, tile.y));
  }
  return { validTargets, originByTarget };
};

const beginCrystalTargeting = (ability: CrystalTargetingAbility): void => {
  if (ability === "deep_strike") {
    const cooldown = abilityCooldownRemainingMs("deep_strike");
    if (!hasDeepStrikeCapability()) {
      pushFeed("Deep Strike requires Deep Operations.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 25) {
      pushFeed("Deep Strike needs 25 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Deep Strike cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "naval_infiltration") {
    const cooldown = abilityCooldownRemainingMs("naval_infiltration");
    if (!hasNavalInfiltrationCapability()) {
      pushFeed("Naval Infiltration requires Navigation.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 30) {
      pushFeed("Naval Infiltration needs 30 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Naval Infiltration cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "sabotage") {
    const cooldown = abilityCooldownRemainingMs("sabotage");
    if (!hasSabotageCapability()) {
      pushFeed("Sabotage requires Cryptography.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 20) {
      pushFeed("Sabotage needs 20 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      pushFeed(`Sabotage cooling down for ${formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }

  const { validTargets, originByTarget } = computeCrystalTargets(ability);
  if (validTargets.size === 0) {
    const title = crystalTargetingTitle(ability);
    pushFeed(`${title} has no valid targets in view.`, "combat", "warn");
    return;
  }
  state.crystalTargeting.active = true;
  state.crystalTargeting.ability = ability;
  state.crystalTargeting.validTargets = validTargets;
  state.crystalTargeting.originByTarget = originByTarget;
  hideTileActionMenu();
  hideHoldBuildMenu();
  const current = selectedTile();
  if (!current || !validTargets.has(key(current.x, current.y))) {
    const first = [...validTargets][0];
    if (first) state.selected = parseKey(first);
  }
  pushFeed(`${crystalTargetingTitle(ability)} armed. Tap a highlighted target tile.`, "combat", "info");
  renderHud();
};

const executeCrystalTargeting = (tile: Tile): boolean => {
  const targetKey = key(tile.x, tile.y);
  if (!state.crystalTargeting.active || !state.crystalTargeting.validTargets.has(targetKey)) return false;
  if (hostileObservatoryProtectingTile(tile)) {
    pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "deep_strike") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const origin = parseKey(originKey);
    ws.send(JSON.stringify({ type: "DEEP_STRIKE_ATTACK", fromX: origin.x, fromY: origin.y, toX: tile.x, toY: tile.y }));
  } else if (ability === "naval_infiltration") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const origin = parseKey(originKey);
    ws.send(JSON.stringify({ type: "NAVAL_INFILTRATION_ATTACK", fromX: origin.x, fromY: origin.y, toX: tile.x, toY: tile.y }));
  } else {
    ws.send(JSON.stringify({ type: "SABOTAGE_TILE", x: tile.x, y: tile.y }));
  }
  clearCrystalTargeting();
  hideTileActionMenu();
  return true;
};

const tileActionAvailability = (
  enabled: boolean,
  reason: string,
  cost?: string
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (enabled) return cost ? { disabled: false, cost } : { disabled: false };
  return { disabled: true, disabledReason: reason, cost: reason };
};

const isOwnedBorderTile = (x: number, y: number): boolean => {
  const neighbors = [
    state.tiles.get(key(wrapX(x), wrapY(y - 1))),
    state.tiles.get(key(wrapX(x + 1), wrapY(y))),
    state.tiles.get(key(wrapX(x), wrapY(y + 1))),
    state.tiles.get(key(wrapX(x - 1), wrapY(y)))
  ];
  return neighbors.some((tile) => !tile || tile.ownerId !== state.me);
};

const menuActionsForSingleTile = (tile: Tile): TileActionDef[] => {
  if (tile.fogged) return [];
  if (tile.terrain === "SEA") return navalInfiltrationActionsForSeaTile(tile);
  if (tile.terrain === "MOUNTAIN") {
    const removeCooldown = abilityCooldownRemainingMs("remove_mountain");
    const observatoryProtection = hostileObservatoryProtectingTile(tile);
    return [
      {
        id: "remove_mountain",
        label: "Remove Mountain",
        ...tileActionAvailability(
          hasTerrainShapingCapability() &&
            !observatoryProtection &&
            hasOwnedLandWithinClientRange(tile.x, tile.y, 2) &&
            removeCooldown <= 0 &&
            state.gold >= 8000 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 400,
          !hasTerrainShapingCapability()
            ? "Requires Terrain Engineering"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !hasOwnedLandWithinClientRange(tile.x, tile.y, 2)
                ? "Must be within 2 tiles of your land"
                : removeCooldown > 0
                  ? `Cooldown ${formatCooldownShort(removeCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
          "8000 gold + 400 CRYSTAL"
        )
      }
    ];
  }
  if (tile.terrain !== "LAND") return [];
  const createMountainAction = (): TileActionDef => {
    const createCooldown = abilityCooldownRemainingMs("create_mountain");
    const observatoryProtection = hostileObservatoryProtectingTile(tile);
    const hasRange = hasOwnedLandWithinClientRange(tile.x, tile.y, 2);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    return {
      id: "create_mountain",
      label: "Create Mountain",
      ...tileActionAvailability(
        hasTerrainShapingCapability() &&
          !observatoryProtection &&
          hasRange &&
          !blockedBySite &&
          createCooldown <= 0 &&
          state.gold >= 8000 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 400,
        !hasTerrainShapingCapability()
          ? "Requires Terrain Engineering"
          : observatoryProtection
            ? "Blocked by observatory field"
            : !hasRange
              ? "Must be within 2 tiles of your land"
              : blockedBySite
                ? "Town, dock, or structure blocks terrain shaping"
                : createCooldown > 0
                  ? `Cooldown ${formatCooldownShort(createCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
        "8000 gold + 400 CRYSTAL"
      )
    };
  };
  if (!tile.ownerId) {
    const reachable = Boolean(pickOriginForTarget(tile.x, tile.y));
    const hasGold = state.gold >= FRONTIER_CLAIM_COST;
    return [
      {
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(
          reachable && hasGold,
          !reachable ? "Must touch your territory" : `Need ${FRONTIER_CLAIM_COST} gold`,
          `${SETTLE_COST} gold + timers`
        )
      },
      createMountainAction()
    ];
  }
  if (tile.ownerId === state.me) {
    const out: TileActionDef[] = [];
    const y = (tile as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
    const hasYield =
      Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
    const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    if (tile.ownershipState === "SETTLED" && hasYield) out.push({ id: "collect_yield", label: "Collect Yield" });
    if (tile.ownershipState === "FRONTIER")
      out.push({
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(state.gold >= SETTLE_COST, `Need ${SETTLE_COST} gold`, `${SETTLE_COST} gold`)
      });
    if (tile.ownershipState === "SETTLED" && !tile.fort) {
      const isBorderOrDock = Boolean(tile.dockId || isOwnedBorderTile(tile.x, tile.y));
      const hasTech = state.techIds.includes("masonry");
      const hasGold = state.gold >= FORT_BUILD_COST;
      const hasIron = (state.strategicResources.IRON ?? 0) >= 45;
      out.push({
        id: "build_fortification",
        label: "Build Fortification",
        ...tileActionAvailability(
          hasTech && hasGold && hasIron && isBorderOrDock && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure,
          !hasTech ? "Requires Masonry" : !isBorderOrDock ? "Needs border or dock tile" : tile.siegeOutpost || tile.observatory || tile.economicStructure ? "Tile already has structure" : !hasGold ? `Need ${FORT_BUILD_COST} gold` : !hasIron ? "Need 45 IRON" : "Unavailable",
          `${FORT_BUILD_COST} gold + 45 IRON`
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.observatory) {
      const hasTech = state.techIds.includes("cartography");
      const hasGold = state.gold >= OBSERVATORY_BUILD_COST;
      const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= 45;
      out.push({
        id: "build_observatory",
        label: "Build Observatory",
        ...tileActionAvailability(
          hasTech && hasGold && hasCrystal && !tile.fort && !tile.siegeOutpost && !tile.economicStructure,
          !hasTech ? "Requires Cartography" : tile.fort || tile.siegeOutpost || tile.economicStructure ? "Tile already has structure" : !hasGold ? `Need ${OBSERVATORY_BUILD_COST} gold` : !hasCrystal ? "Need 45 CRYSTAL" : "Unavailable",
          `${OBSERVATORY_BUILD_COST} gold + 45 CRYSTAL`
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.siegeOutpost) {
      const hasTech = state.techIds.includes("leatherworking");
      const hasGold = state.gold >= SIEGE_OUTPOST_BUILD_COST;
      const hasSupply = (state.strategicResources.SUPPLY ?? 0) >= 45;
      const onBorder = isOwnedBorderTile(tile.x, tile.y);
      out.push({
        id: "build_siege_camp",
        label: "Build Siege Camp",
        ...tileActionAvailability(
          hasTech && hasGold && hasSupply && onBorder && !tile.fort && !tile.observatory && !tile.economicStructure,
          !hasTech ? "Requires Leatherworking" : !onBorder ? "Needs border tile" : tile.fort || tile.observatory || tile.economicStructure ? "Tile already has structure" : !hasGold ? `Need ${SIEGE_OUTPOST_BUILD_COST} gold` : !hasSupply ? "Need 45 SUPPLY" : "Unavailable",
          `${SIEGE_OUTPOST_BUILD_COST} gold + 45 SUPPLY`
        )
      });
    }
    if (tile.ownershipState === "SETTLED") {
      if (tile.resource === "FARM" || tile.resource === "FISH") {
        out.push({
          id: "build_farmstead",
          label: "Build Farmstead",
          ...tileActionAvailability(
            !hasBlockingStructure && state.techIds.includes("agriculture") && state.gold >= 400 && (state.strategicResources.FOOD ?? 0) >= 20,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("agriculture") ? "Requires Agriculture" : state.gold < 400 ? "Need 400 gold" : "Need 20 FOOD",
            "400 gold + 20 FOOD"
          )
        });
      }
      if (tile.resource === "WOOD" || tile.resource === "FUR") {
        out.push({
          id: "build_camp",
          label: "Build Camp",
          ...tileActionAvailability(
            !hasBlockingStructure && state.techIds.includes("leatherworking") && state.gold >= 500 && (state.strategicResources.SUPPLY ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("leatherworking") ? "Requires Leatherworking" : state.gold < 500 ? "Need 500 gold" : "Need 30 SUPPLY",
            "500 gold + 30 SUPPLY"
          )
        });
      }
      if (tile.resource === "IRON" || tile.resource === "GEMS") {
        const matchingNeed = tile.resource === "IRON" ? "IRON" : "CRYSTAL";
        out.push({
          id: "build_mine",
          label: "Build Mine",
          ...tileActionAvailability(
            !hasBlockingStructure && state.techIds.includes("mining") && state.gold >= 500 && (state.strategicResources[matchingNeed] ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("mining") ? "Requires Mining" : state.gold < 500 ? "Need 500 gold" : `Need 30 ${matchingNeed}`,
            `500 gold + 30 ${matchingNeed}`
          )
        });
      }
      if (tile.town) {
        out.push({
          id: "build_market",
          label: "Build Market",
          ...tileActionAvailability(
            !hasBlockingStructure && state.techIds.includes("trade") && state.gold >= 600 && (state.strategicResources.CRYSTAL ?? 0) >= 40,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("trade") ? "Requires Trade" : state.gold < 600 ? "Need 600 gold" : "Need 40 CRYSTAL",
            "600 gold + 40 CRYSTAL"
          )
        });
        out.push({
          id: "build_granary",
          label: "Build Granary",
          ...tileActionAvailability(
            !hasBlockingStructure && state.techIds.includes("pottery") && state.gold >= 400 && (state.strategicResources.FOOD ?? 0) >= 40,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("pottery") ? "Requires Pottery" : state.gold < 400 ? "Need 400 gold" : "Need 40 FOOD",
            "400 gold + 40 FOOD"
          )
        });
      }
    }
    out.push(createMountainAction());
    out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (isTileOwnedByAlly(tile)) return [];
  if (tile.ownerId === "barbarian") {
    const previewDetail = attackPreviewDetailForTarget(tile);
    const breachPreviewDetail = attackPreviewDetailForTarget(tile, "breakthrough");
    return [
      {
        id: "launch_attack",
        label: "Launch Attack",
        ...(previewDetail ? { detail: previewDetail } : {}),
        ...tileActionAvailability(Boolean(pickOriginForTarget(tile.x, tile.y)) && state.gold >= FRONTIER_CLAIM_COST, !pickOriginForTarget(tile.x, tile.y) ? "No bordering origin tile" : `Need ${FRONTIER_CLAIM_COST} gold`)
      },
      {
        id: "launch_breach_attack",
        label: "Launch Breach Attack",
        ...(breachPreviewDetail ? { detail: breachPreviewDetail } : {}),
        ...tileActionAvailability(
          Boolean(pickOriginForTarget(tile.x, tile.y)) && hasBreakthroughCapability() && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
          !pickOriginForTarget(tile.x, tile.y)
            ? "No bordering origin tile"
            : !hasBreakthroughCapability()
              ? "Requires Breach Doctrine"
              : state.gold < 2
                ? "Need 2 gold"
                : "Need 1 IRON",
          "2 gold + 1 IRON"
        )
      },
      createMountainAction()
    ];
  }
  const reachable = Boolean(pickOriginForTarget(tile.x, tile.y));
  const out: TileActionDef[] = [
    {
      id: "launch_attack",
      label: "Launch Attack",
      ...(attackPreviewDetailForTarget(tile) ? { detail: attackPreviewDetailForTarget(tile) } : {}),
      ...tileActionAvailability(reachable && state.gold >= FRONTIER_CLAIM_COST, !reachable ? "No bordering origin tile" : `Need ${FRONTIER_CLAIM_COST} gold`)
    },
    {
      id: "launch_breach_attack",
      label: "Launch Breach Attack",
      ...(attackPreviewDetailForTarget(tile, "breakthrough") ? { detail: attackPreviewDetailForTarget(tile, "breakthrough") } : {}),
      ...tileActionAvailability(
        reachable && hasBreakthroughCapability() && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
        !reachable ? "No bordering origin tile" : !hasBreakthroughCapability() ? "Requires Breach Doctrine" : state.gold < 2 ? "Need 2 gold" : "Need 1 IRON",
        "2 gold + 1 IRON"
      )
    }
  ];
  const deepStrikeCooldown = abilityCooldownRemainingMs("deep_strike");
  const deepStrikeOrigin = findDeepStrikeOriginForTarget(tile);
  const observatoryProtection = hostileObservatoryProtectingTile(tile);
  out.push({
    id: "deep_strike",
    label: "Deep Strike",
    ...tileActionAvailability(
      hasDeepStrikeCapability() && !observatoryProtection && Boolean(deepStrikeOrigin) && deepStrikeCooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 25,
      !hasDeepStrikeCapability()
        ? "Requires Deep Operations"
        : observatoryProtection
          ? "Blocked by observatory field"
        : !deepStrikeOrigin
          ? "Need valid 2-tile origin"
          : deepStrikeCooldown > 0
            ? `Cooldown ${formatCooldownShort(deepStrikeCooldown)}`
            : "Need 25 CRYSTAL",
      "25 CRYSTAL • -10% ATK"
    )
  });
  const navalCooldown = abilityCooldownRemainingMs("naval_infiltration");
  const navalOrigin = findNavalInfiltrationOriginForTarget(tile);
  out.push({
    id: "naval_infiltration",
    label: "Naval Infiltration",
    ...tileActionAvailability(
      hasNavalInfiltrationCapability() && !observatoryProtection && Boolean(navalOrigin) && navalCooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
      !hasNavalInfiltrationCapability()
        ? "Requires Navigation"
        : observatoryProtection
          ? "Blocked by observatory field"
        : !navalOrigin
          ? "Need water crossing origin"
          : navalCooldown > 0
            ? `Cooldown ${formatCooldownShort(navalCooldown)}`
            : "Need 30 CRYSTAL",
      "30 CRYSTAL • -15% ATK"
    )
  });
  if (tile.ownerId && !state.activeRevealTargets.includes(tile.ownerId)) {
      const revealCost = 20;
      const hasCapability = hasRevealCapability();
      const hasCapacity = state.revealCapacity > 0 && state.activeRevealTargets.length < 1;
      const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= revealCost;
      out.push({
        id: "reveal_empire",
        label: "Reveal Empire",
        ...tileActionAvailability(
          hasCapability && hasCapacity && hasCrystal,
          !hasCapability ? "Requires Cryptography" : !hasCapacity ? "Reveal capacity full" : "Need crystal",
          "20 CRYSTAL • 0.15 / 10m"
        )
      });
    const sabotageCooldown = abilityCooldownRemainingMs("sabotage");
    out.push({
      id: "sabotage_tile",
      label: "Sabotage",
      ...tileActionAvailability(
        hasSabotageCapability() &&
          !observatoryProtection &&
          sabotageCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 20 &&
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSabotageCapability()
          ? "Requires Cryptography"
          : observatoryProtection
            ? "Blocked by observatory field"
          : tile.sabotage
            ? "Already sabotaged"
            : !(tile.resource || tile.town)
              ? "Town or resource only"
              : sabotageCooldown > 0
                ? `Cooldown ${formatCooldownShort(sabotageCooldown)}`
                : "Need 20 CRYSTAL",
        "20 CRYSTAL • -50% for 45m"
      )
    });
  }
  out.push(createMountainAction());
  return out;
};

const renderTileActionMenu = (title: string, subtitle: string, actions: TileActionDef[], clientX: number, clientY: number): void => {
  if (actions.length === 0) {
    hideTileActionMenu();
    return;
  }
  const rows = actions
    .map(
      (a) => `<button class="tile-action-btn" data-action="${a.id}" ${a.targetKey ? `data-target-key="${a.targetKey}"` : ""} ${a.originKey ? `data-origin-key="${a.originKey}"` : ""} ${a.disabled ? "disabled" : ""}>
        <span class="tile-action-icon">${actionIcon(a.id)}</span>
        <span class="tile-action-copy">
          <span class="tile-action-label">${a.label}</span>
          ${a.detail ? `<span class="tile-action-detail">${a.detail}</span>` : ""}
        </span>
        ${a.cost ? `<span class="tile-action-cost">${a.cost}</span>` : ""}
      </button>`
    )
    .join("");
  tileActionMenuEl.innerHTML = `
    <div class="tile-action-card">
      <button class="tile-action-close" id="tile-action-close" title="Close">×</button>
      <div class="tile-action-head">
        <div class="tile-action-title">${title}</div>
        <div class="tile-action-subtitle">${subtitle}</div>
      </div>
      <div class="tile-action-list">${rows}</div>
      <div class="tile-action-hint">${isMobile() ? "Tap outside to close" : "Right-click or ESC to close"}</div>
    </div>
  `;
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(330, vw - 16);
  const menuH = 260;
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 10));
  const top = Math.max(78, Math.min(vh - menuH - 8, clientY + 8));
  tileActionMenuEl.style.width = `${menuW}px`;
  tileActionMenuEl.style.left = `${left}px`;
  tileActionMenuEl.style.top = `${top}px`;
  tileActionMenuEl.style.display = "block";
  state.tileActionMenu.visible = true;
  state.tileActionMenu.x = clientX;
  state.tileActionMenu.y = clientY;
  const closeBtn = tileActionMenuEl.querySelector<HTMLButtonElement>("#tile-action-close");
  if (closeBtn) closeBtn.onclick = () => hideTileActionMenu();
  const actionButtons = tileActionMenuEl.querySelectorAll<HTMLButtonElement>("button[data-action]");
  actionButtons.forEach((btn) => {
    btn.onclick = () => {
      const actionId = btn.dataset.action as TileActionDef["id"] | undefined;
      if (!actionId) return;
      handleTileAction(actionId, btn.dataset.targetKey, btn.dataset.originKey);
    };
  });
};

const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number): void => {
  if (tile.ownerId && tile.ownerId !== state.me && !isTileOwnedByAlly(tile)) requestAttackPreviewForTarget(tile);
  const actions = menuActionsForSingleTile(tile);
  const ownerLabel =
    tile.terrain === "SEA"
      ? actions.length > 0
        ? "Crossing Route"
        : "Open Sea"
      : !tile.ownerId
        ? "Unclaimed"
        : tile.ownerId === state.me
          ? "Owned"
          : isTileOwnedByAlly(tile)
            ? "Allied"
            : "Enemy";
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.bulkKeys = [];
  renderTileActionMenu(`${terrainLabel(tile.x, tile.y, tile.terrain)} (${tile.x}, ${tile.y})`, ownerLabel, actions, clientX, clientY);
};

const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void => {
  if (targetKeys.length === 0) return;
  let neutralCount = 0;
  let enemyCount = 0;
  let ownedYieldCount = 0;
  for (const k of targetKeys) {
    const t = state.tiles.get(k);
    if (!t || t.terrain !== "LAND" || t.fogged) continue;
    if (!t.ownerId) neutralCount += 1;
    else if (t.ownerId !== state.me && !isTileOwnedByAlly(t)) enemyCount += 1;
    else if (t.ownerId === state.me) {
      if (t.ownershipState !== "SETTLED") continue;
      const y = (t as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
      const hasYield =
        Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
      if (hasYield) ownedYieldCount += 1;
    }
  }
  const actions: TileActionDef[] = [];
  if (neutralCount > 0) {
    actions.push({ id: "settle_land", label: `Settle Land (${neutralCount})`, cost: `${SETTLE_COST} gold each` });
  }
  if (enemyCount > 0) {
    actions.push({ id: "launch_attack", label: `Launch Attack (${enemyCount})` });
    actions.push({
      id: "launch_breach_attack",
      label: `Launch Breach Attack (${enemyCount})`,
      cost: hasBreakthroughCapability() ? "2 gold + 1 IRON each" : "Requires Breach Doctrine"
    });
  }
  if (ownedYieldCount > 0) {
    actions.push({ id: "collect_yield", label: `Collect Yield (${ownedYieldCount})` });
  }
  state.tileActionMenu.mode = "bulk";
  state.tileActionMenu.bulkKeys = targetKeys;
  renderTileActionMenu("Tile Selection", `${targetKeys.length} selected`, actions, clientX, clientY);
};

const handleTileAction = (actionId: TileActionDef["id"], targetKeyOverride?: string, originKeyOverride?: string): void => {
  const selected = state.selected ? state.tiles.get(key(state.selected.x, state.selected.y)) : undefined;
  const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
  const fromBulk = bulkKeys.length > 0;
  const targets = fromBulk ? bulkKeys : selected ? [key(selected.x, selected.y)] : [];
  if (targets.length === 0) {
    hideTileActionMenu();
    return;
  }

  if (actionId === "settle_land") {
    if (fromBulk) {
      const neutralTargets = targets.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.ownerId;
      });
      const out = queueSpecificTargets(neutralTargets, "normal");
      for (const k of out.queuedKeys) state.autoSettleTargets.add(k);
      if (out.queued > 0) processActionQueue();
      pushFeed(
        out.queued > 0
          ? `Queued ${out.queued} settle chains${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`
          : "No frontier claims queued. Targets must touch your territory and you need enough gold.",
        "combat",
        out.queued > 0 ? "info" : "warn"
      );
    } else if (selected) {
      const k = key(selected.x, selected.y);
      if (!selected.ownerId) {
        const out = queueSpecificTargets([k], "normal");
        if (out.queued > 0) {
          state.autoSettleTargets.add(k);
          processActionQueue();
          pushFeed(`Queued settle chain at (${selected.x}, ${selected.y}).`, "combat", "info");
        } else {
          pushFeed("Cannot claim this tile yet. It must touch your territory and you need enough gold.", "combat", "warn");
        }
      } else if (selected.ownerId === state.me && selected.ownershipState === "FRONTIER") {
        if (enqueueTarget(selected.x, selected.y, "settle")) {
          processActionQueue();
          pushFeed(`Settle queued at (${selected.x}, ${selected.y}).`, "combat", "info");
        } else {
          pushFeed(`Settle already queued for (${selected.x}, ${selected.y}).`, "combat", "warn");
        }
      }
      state.autoSettleTargets.delete(k);
    }
    hideTileActionMenu();
    return;
  }
  if (actionId === "launch_attack" || actionId === "launch_breach_attack") {
    const enemyTargets = targets.filter((k) => {
      const t = state.tiles.get(k);
      return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
    });
    const mode = actionId === "launch_breach_attack" ? "breakthrough" : "normal";
    const out = queueSpecificTargets(enemyTargets, mode);
    if (out.queued > 0) processActionQueue();
    pushFeed(
      out.queued > 0
        ? `Queued ${out.queued} attacks${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`
        : `Cannot launch ${mode === "breakthrough" ? "breakthrough " : ""}attack. Target needs a bordering origin tile and sufficient resources.`,
      "combat",
      out.queued > 0 ? "warn" : "error"
    );
    hideTileActionMenu();
    return;
  }
  if (actionId === "collect_yield" && fromBulk) {
    let n = 0;
    for (const k of targets) {
      const t = state.tiles.get(k);
      if (!t || t.ownerId !== state.me) continue;
      sendGameMessage({ type: "COLLECT_TILE", x: t.x, y: t.y });
      n += 1;
    }
    pushFeed(`Collecting from ${n} selected tiles.`, "info", "info");
    hideTileActionMenu();
    return;
  }
  if (!selected) {
    hideTileActionMenu();
    return;
  }
  if (actionId === "collect_yield") sendGameMessage({ type: "COLLECT_TILE", x: selected.x, y: selected.y });
  if (actionId === "build_fortification") sendGameMessage({ type: "BUILD_FORT", x: selected.x, y: selected.y });
  if (actionId === "build_observatory") sendGameMessage({ type: "BUILD_OBSERVATORY", x: selected.x, y: selected.y });
  if (actionId === "build_farmstead") sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FARMSTEAD" });
  if (actionId === "build_camp") sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CAMP" });
  if (actionId === "build_mine") sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MINE" });
  if (actionId === "build_market") sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MARKET" });
  if (actionId === "build_granary") sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GRANARY" });
  if (actionId === "build_siege_camp") sendGameMessage({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y });
  if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "abandon_territory") sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
  if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId });
  }
  if (actionId === "deep_strike") {
    if (hostileObservatoryProtectingTile(selected)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    const origin = findDeepStrikeOriginForTarget(selected);
    if (origin) {
      sendGameMessage({ type: "DEEP_STRIKE_ATTACK", fromX: origin.x, fromY: origin.y, toX: selected.x, toY: selected.y });
    }
  }
  if (actionId === "naval_infiltration") {
    const targetTile = targetKeyOverride ? state.tiles.get(targetKeyOverride) : selected;
    if (targetTile && hostileObservatoryProtectingTile(targetTile)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    const origin = originKeyOverride
      ? (() => {
          const parsed = parseKey(originKeyOverride);
          return state.tiles.get(originKeyOverride) ?? state.tiles.get(key(parsed.x, parsed.y));
        })()
      : targetTile
        ? findNavalInfiltrationOriginForTarget(targetTile)
        : undefined;
    if (targetTile && origin) {
      sendGameMessage({ type: "NAVAL_INFILTRATION_ATTACK", fromX: origin.x, fromY: origin.y, toX: targetTile.x, toY: targetTile.y });
    }
  }
  if (actionId === "sabotage_tile") {
    if (hostileObservatoryProtectingTile(selected)) {
      pushFeed("Blocked by observatory field.", "combat", "warn");
      hideTileActionMenu();
      return;
    }
    sendGameMessage({ type: "SABOTAGE_TILE", x: selected.x, y: selected.y });
  }
  hideTileActionMenu();
};

const showHoldBuildMenu = (x: number, y: number, clientX: number, clientY: number): void => {
  const tile = state.tiles.get(key(x, y));
  if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") {
    hideHoldBuildMenu();
    return;
  }
  state.selected = { x, y };
  const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
  const canAffordFort = state.gold >= FORT_BUILD_COST;
  const canAffordSiege = state.gold >= SIEGE_OUTPOST_BUILD_COST;
  const canAffordObservatory =
    tile.ownershipState === "SETTLED" &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.techIds.includes("cartography") &&
    state.gold >= OBSERVATORY_BUILD_COST &&
    (state.strategicResources.CRYSTAL ?? 0) >= 45;
  const canBuildFarmstead =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "FARM" || tile.resource === "FISH") &&
    state.techIds.includes("agriculture") &&
    state.gold >= 400 &&
    (state.strategicResources.FOOD ?? 0) >= 20;
  const canBuildCamp =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "WOOD" || tile.resource === "FUR") &&
    state.techIds.includes("leatherworking") &&
    state.gold >= 500 &&
    (state.strategicResources.SUPPLY ?? 0) >= 30;
  const canBuildMine =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "IRON" || tile.resource === "GEMS") &&
    state.techIds.includes("mining") &&
    state.gold >= 500 &&
    (state.strategicResources[tile.resource === "IRON" ? "IRON" : "CRYSTAL"] ?? 0) >= 30;
  const canBuildMarket =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    state.techIds.includes("trade") &&
    state.gold >= 600 &&
    (state.strategicResources.CRYSTAL ?? 0) >= 40;
  const canBuildGranary =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    state.techIds.includes("pottery") &&
    state.gold >= 400 &&
    (state.strategicResources.FOOD ?? 0) >= 40;
  holdBuildMenuEl.innerHTML = `
    <div class="hold-menu-card">
      <div class="hold-menu-title">Build on (${x}, ${y})</div>
      <button class="hold-menu-btn" data-build="settle" ${tile.ownershipState === "FRONTIER" && state.gold >= SETTLE_COST ? "" : "disabled"}>
        <span>Settle Tile</span>
        <small>${SETTLE_COST} gold • ${(SETTLE_MS / 1000).toFixed(1)}s • converts frontier to settled</small>
      </button>
      <button class="hold-menu-btn" data-build="fort" ${canAffordFort ? "" : "disabled"}>
        <span>Fort</span>
        <small>${FORT_BUILD_COST} gold + 45 IRON • ${(FORT_BUILD_MS / 1000).toFixed(0)}s • def x${FORT_DEFENSE_MULT.toFixed(2)}</small>
      </button>
      <button class="hold-menu-btn" data-build="observatory" ${canAffordObservatory ? "" : "disabled"}>
        <span>Observatory</span>
        <small>${OBSERVATORY_BUILD_COST} gold + 45 CRYSTAL • +5 local vision • 0.25 / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="farmstead" ${canBuildFarmstead ? "" : "disabled"}>
        <span>Farmstead</span>
        <small>400 gold + 20 FOOD • +50% food output • 1 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="camp" ${canBuildCamp ? "" : "disabled"}>
        <span>Camp</span>
        <small>500 gold + 30 SUPPLY • +50% supply output • 1.2 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="mine" ${canBuildMine ? "" : "disabled"}>
        <span>Mine</span>
        <small>500 gold + 30 matching resource • +50% iron or crystal • 1.2 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="market" ${canBuildMarket ? "" : "disabled"}>
        <span>Market</span>
        <small>600 gold + 40 CRYSTAL • +50% town gold if fed • 0.05 crystal / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="granary" ${canBuildGranary ? "" : "disabled"}>
        <span>Granary</span>
        <small>400 gold + 40 FOOD • +50% town cap • 1 gold / 10m</small>
      </button>
      <button class="hold-menu-btn" data-build="siege" ${canAffordSiege ? "" : "disabled"}>
        <span>Siege Outpost</span>
        <small>${SIEGE_OUTPOST_BUILD_COST} gold + 45 SUPPLY • ${(SIEGE_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${SIEGE_OUTPOST_ATTACK_MULT.toFixed(2)} (from tile)</small>
      </button>
      <div class="hold-menu-hint">Hold any owned land tile to open this menu.</div>
    </div>
  `;
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(290, vw - 16);
  const menuH = 168;
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 8));
  const top = Math.max(84, Math.min(vh - menuH - 8, clientY + 8));
  holdBuildMenuEl.style.width = `${menuW}px`;
  holdBuildMenuEl.style.left = `${left}px`;
  holdBuildMenuEl.style.top = `${top}px`;
  holdBuildMenuEl.style.display = "block";

  const settleBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='settle']");
  const fortBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='fort']");
  const observatoryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='observatory']");
  const farmsteadBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='farmstead']");
  const campBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='camp']");
  const mineBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='mine']");
  const marketBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='market']");
  const granaryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='granary']");
  const siegeBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='siege']");
  if (settleBtn) {
    settleBtn.onclick = () => {
      sendGameMessage({ type: "SETTLE", x, y });
      hideHoldBuildMenu();
    };
  }
  if (fortBtn) {
    fortBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_FORT", x, y });
      hideHoldBuildMenu();
    };
  }
  if (siegeBtn) {
    siegeBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_SIEGE_OUTPOST", x, y });
      hideHoldBuildMenu();
    };
  }
  if (observatoryBtn) {
    observatoryBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_OBSERVATORY", x, y });
      hideHoldBuildMenu();
    };
  }
  if (farmsteadBtn) {
    farmsteadBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "FARMSTEAD" });
      hideHoldBuildMenu();
    };
  }
  if (campBtn) {
    campBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "CAMP" });
      hideHoldBuildMenu();
    };
  }
  if (mineBtn) {
    mineBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MINE" });
      hideHoldBuildMenu();
    };
  }
  if (marketBtn) {
    marketBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MARKET" });
      hideHoldBuildMenu();
    };
  }
  if (granaryBtn) {
    granaryBtn.onclick = () => {
      sendGameMessage({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "GRANARY" });
      hideHoldBuildMenu();
    };
  }
  renderHud();
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
  chooseTech();
};
mobileTechChooseBtn.onclick = () => {
  chooseTech();
};
techPickEl.onchange = () => {
  state.techUiSelectedId = techPickEl.value;
  mobileTechPickEl.value = techPickEl.value;
  renderHud();
};
mobileTechPickEl.onchange = () => {
  state.techUiSelectedId = mobileTechPickEl.value;
  techPickEl.value = mobileTechPickEl.value;
  renderHud();
};
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
  requestViewRefresh(2, true);
};
centerMeDesktopBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh(2, true);
};
collectVisibleDesktopBtn.onclick = () => {
  collectVisibleYield();
};

refreshBtn.onclick = () => requestViewRefresh();
collectVisibleMobileBtn.onclick = () => {
  collectVisibleYield();
};
fogToggleMobileBtn.onclick = () => {
  sendGameMessage({ type: "SET_FOG_DISABLED", disabled: !state.fogDisabled });
};
settleMobileBtn.onclick = () => settleSelected();
buildFortMobileBtn.onclick = () => buildFortOnSelected();
buildSiegeMobileBtn.onclick = () => buildSiegeOutpostOnSelected();
uncaptureMobileBtn.onclick = () => uncaptureSelected();
captureCancelBtn.onclick = () => cancelOngoingCapture();

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

authColorPresetButtons.forEach((btn) => {
  btn.onclick = () => {
    const color = btn.dataset.color;
    if (!color) return;
    authProfileColorEl.value = color;
    syncAuthPanelState();
  };
});

authProfileColorEl.oninput = () => {
  syncAuthPanelState();
};

authEmailEl.onkeydown = (event) => {
  if (event.key === "Enter" && !state.profileSetupRequired) {
    event.preventDefault();
    authEmailLinkBtn.click();
  }
};

authProfileNameEl.onkeydown = (event) => {
  if (event.key === "Enter" && state.profileSetupRequired) {
    event.preventDefault();
    authProfileSaveBtn.click();
  }
};

const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
mobileNavButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
    if (!p) return;
    state.mobilePanel = p;
    if (p === "intel") state.unreadAttackAlerts = 0;
    renderHud();
  };
});

ws.addEventListener("open", () => {
  state.connection = "connected";
  if (!state.mapLoadStartedAt) state.mapLoadStartedAt = Date.now();
  clearReconnectReloadTimer();
  renderHud();
  void authenticateSocket();
});
ws.addEventListener("close", () => {
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  pushFeed("Connection lost. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = false;
    setAuthStatus(`Signed into Firebase, but the game server is unavailable at ${wsUrl}.`, "error");
  }
  scheduleReconnectReload();
  renderHud();
});
ws.addEventListener("error", () => {
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  pushFeed("Server unreachable. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = false;
    setAuthStatus(`Signed into Firebase, but the game server is unavailable at ${wsUrl}.`, "error");
  }
  scheduleReconnectReload();
  renderHud();
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
  if (msg.type === "INIT") {
    state.connection = "initialized";
    state.authSessionReady = true;
    state.hasEverInitialized = true;
    state.authBusy = false;
    state.authRetrying = false;
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    const p = msg.player as Record<string, unknown>;
    state.me = p.id as string;
    state.meName = p.name as string;
    state.profileSetupRequired = Boolean(p.profileNeedsSetup);
    setAuthStatus(`Signed in as ${state.authUserLabel || (p.name as string)}.`);
    state.gold = (p.gold as number | undefined) ?? (p.points as number);
    state.level = p.level as number;
    state.mods = (p.mods as typeof state.mods) ?? state.mods;
    state.incomePerMinute = (p.incomePerMinute as number) ?? state.incomePerMinute;
    state.strategicResources =
      (p.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (p.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.stamina = p.stamina as number;
    state.territoryT = (p.T as number) ?? state.territoryT;
    state.exposureE = (p.E as number) ?? state.exposureE;
    state.settledT = (p.Ts as number) ?? state.settledT;
    state.settledE = (p.Es as number) ?? state.settledE;
    state.defensibilityPct = defensibilityPctFromTE(
      (p.Ts as number | undefined) ?? (p.T as number | undefined),
      (p.Es as number | undefined) ?? (p.E as number | undefined)
    );
    state.availableTechPicks = (p.availableTechPicks as number) ?? 0;
    state.techRootId = p.techRootId as string | undefined;
    state.techIds = (p.techIds as string[]) ?? [];
    state.domainIds = (p.domainIds as string[]) ?? [];
    state.revealCapacity = (p.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (p.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (p.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.allies = (p.allies as string[]) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      tileColorInput.value = myTileColor;
    }
    const myVisualStyle = p.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    seedProfileSetupFields((p.name as string) || state.authUserLabel, myTileColor ?? tileColorInput.value);
    for (const s of ((msg.playerStyles as Array<{ id: string; tileColor?: string; visualStyle?: EmpireVisualStyle }>) ?? [])) {
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
      if (s.visualStyle) state.playerVisualStyles.set(s.id, s.visualStyle);
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
    state.domainChoices = (msg.domainChoices as string[]) ?? [];
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? [];
    if (!state.domainUiSelectedId && state.domainChoices.length > 0) state.domainUiSelectedId = state.domainChoices[0]!;
    state.missions = (msg.missions as MissionState[]) ?? [];
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.victoryPressure = (msg.victoryPressure as VictoryPressureObjectiveView[] | undefined) ?? state.victoryPressure;
    if (state.profileSetupRequired) {
      setAuthStatus("Choose a display name and nation color to begin.");
    }
    state.incomingAllianceRequests = (msg.allianceRequests as AllianceRequest[]) ?? [];
    const cfg = (msg.config as { season?: { seasonId: string; worldSeed?: number }; fogDisabled?: boolean } | undefined) ?? {};
    const season = cfg.season;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.fogDisabled = Boolean(cfg.fogDisabled);
    const mapMeta = (msg.mapMeta as { dockCount?: number; dockPairCount?: number; clusterCount?: number; townCount?: number; dockPairs?: DockPair[] } | undefined) ?? {};
    state.discoveredTiles.clear();
    state.discoveredDockTiles.clear();
    state.dockPairs = mapMeta.dockPairs ?? [];
    state.dockRouteCache.clear();
    pushFeed(`Spawned. ${season?.seasonId ? `Season ${season.seasonId}.` : ""} Your tile is centered.`, "info", "success");
    if (cfg.fogDisabled) pushFeed("Fog of war is disabled for this server session.", "info", "warn");
    if (typeof mapMeta.dockCount === "number") {
      pushFeed(
        `Map features: ${mapMeta.dockCount} docks (${mapMeta.dockPairCount ?? Math.floor(mapMeta.dockCount / 2)} pairs), ${mapMeta.clusterCount ?? 0} clusters.`,
        "info",
        "info"
      );
      if (typeof mapMeta.townCount === "number") {
        pushFeed(`Towns on world: ${mapMeta.townCount}.`, "info", "info");
      }
    }
    requestViewRefresh();
    syncAuthOverlay();
    renderHud();
  }
  if (msg.type === "CHUNK_FULL") {
    const tiles = msg.tilesMaskedByFog as Tile[];
    state.chunkFullCount += 1;
    if (state.firstChunkAt === 0) state.firstChunkAt = Date.now();
    let sawVisibleTile = false;
    let sawOwnedTile = false;
    for (const t of tiles) {
      state.tiles.set(key(t.x, t.y), t);
      markDockDiscovered(t);
      if (!t.fogged) state.discoveredTiles.add(key(t.x, t.y));
      if (!t.fogged) sawVisibleTile = true;
      if (t.ownerId === state.me) sawOwnedTile = true;
    }
    if (sawOwnedTile) {
      state.hasOwnedTileInCache = true;
    } else if (!state.hasOwnedTileInCache) {
      centerOnOwnedTile();
    }
    renderHud();
  }
  if (msg.type === "PLAYER_UPDATE") {
    const prevGold = state.gold;
    const prevStrategic = { ...state.strategicResources };
    state.gold = (msg.gold as number | undefined) ?? (msg.points as number);
    if (typeof msg.name === "string") {
      state.meName = msg.name;
      authProfileNameEl.value = msg.name;
    }
    state.level = msg.level as number;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.strategicResources =
      (msg.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (msg.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.upkeepPerMinute =
      (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
    state.upkeepLastTick =
      (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
    if (state.upkeepLastTick.foodCoverage < 0.999 && !state.foodCoverageWarned) {
      pushFeed(
        `Town support underfed: FOOD upkeep coverage ${(state.upkeepLastTick.foodCoverage * 100).toFixed(0)}%. Town income is reduced.`,
        "info",
        "warn"
      );
      state.foodCoverageWarned = true;
    } else if (state.upkeepLastTick.foodCoverage >= 0.999 && state.foodCoverageWarned) {
      pushFeed("FOOD upkeep recovered. Town income back to normal.", "info", "success");
      state.foodCoverageWarned = false;
    }
    if (state.gold > prevGold) {
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = 1;
    } else if (state.gold < prevGold) {
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = -1;
    } else {
      state.goldAnimDir = 0;
    }
    for (const k of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
      const prev = prevStrategic[k] ?? 0;
      const next = state.strategicResources[k] ?? 0;
      if (next > prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = 1;
      } else if (next < prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = -1;
      } else if (Date.now() >= state.strategicAnim[k].until) {
        state.strategicAnim[k].dir = 0;
      }
    }
    state.stamina = msg.stamina as number;
    if (typeof (msg.T as number | undefined) === "number") state.territoryT = msg.T as number;
    if (typeof (msg.E as number | undefined) === "number") state.exposureE = msg.E as number;
    if (typeof (msg.Ts as number | undefined) === "number") state.settledT = msg.Ts as number;
    if (typeof (msg.Es as number | undefined) === "number") state.settledE = msg.Es as number;
    state.defensibilityPct = defensibilityPctFromTE(state.settledT, state.settledE);
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    if (typeof msg.profileNeedsSetup === "boolean") state.profileSetupRequired = msg.profileNeedsSetup;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (msg.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.victoryPressure = (msg.victoryPressure as VictoryPressureObjectiveView[] | undefined) ?? state.victoryPressure;
    const myTileColor = msg.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      tileColorInput.value = myTileColor;
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    syncAuthOverlay();
    renderHud();
  }
  if (msg.type === "COMBAT_RESULT") {
    const changes = msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN"; breachShockUntil?: number }>;
    for (const c of changes) {
      const existing = state.tiles.get(key(c.x, c.y));
      if (existing) {
        if (c.ownerId) existing.ownerId = c.ownerId;
        else delete existing.ownerId;
        if (c.ownershipState) existing.ownershipState = c.ownershipState;
        else if (!c.ownerId) delete existing.ownershipState;
        if (typeof c.breachShockUntil === "number") existing.breachShockUntil = c.breachShockUntil;
        else if ("breachShockUntil" in c && !c.breachShockUntil) delete existing.breachShockUntil;
      }
    }
    pushFeed(`Combat winner: ${(msg.winnerId as string).slice(0, 8)}`, "combat", "success");
    const resolvedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    const targetKey = state.capture ? key(state.capture.target.x, state.capture.target.y) : state.actionTargetKey;
    let handedOffToSettle = false;
    if (targetKey && state.autoSettleTargets.has(targetKey)) {
      const settledTile = state.tiles.get(targetKey);
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
        if (startQueuedSettle(settledTile.x, settledTile.y, 0)) {
          handedOffToSettle = true;
          pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
        }
      }
      state.autoSettleTargets.delete(targetKey);
    }
    if (!handedOffToSettle) {
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      if (targetKey) state.queuedTargetKeys.delete(targetKey);
      if (resolvedCurrentKey) state.queuedTargetKeys.delete(resolvedCurrentKey);
      const startedNext = processActionQueue();
      if (!startedNext) {
        state.capture = undefined;
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
      }
    }
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
  }
  if (msg.type === "COMBAT_START") {
    const target = msg.target as { x: number; y: number };
    const resolvesAt = msg.resolvesAt as number;
    state.combatStartAck = true;
    state.capture = { startAt: Date.now(), resolvesAt: Math.max(resolvesAt, Date.now() + 100), target };
    state.actionInFlight = true;
    state.actionStartedAt = Date.now();
    state.actionTargetKey = key(target.x, target.y);
    renderHud();
  }
  if (msg.type === "ATTACK_ALERT") {
    const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
    const x = Number(msg.x ?? -1);
    const y = Number(msg.y ?? -1);
    state.unreadAttackAlerts += 1;
    pushFeed(`Under attack: ${attackerName} is striking (${x}, ${y}).`, "combat", "error");
    renderHud();
  }
  if (msg.type === "COMBAT_CANCELLED") {
    const cancelledCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (cancelledCurrentKey) state.queuedTargetKeys.delete(cancelledCurrentKey);
    state.autoSettleTargets.clear();
    pushFeed(`Capture cancelled (${(msg.count as number | undefined) ?? 1})`, "combat", "warn");
    renderHud();
  }
  if (msg.type === "FOG_UPDATE") {
    state.fogDisabled = Boolean(msg.fogDisabled);
    pushFeed(`Fog of war ${state.fogDisabled ? "disabled" : "enabled"}.`, "info", "info");
    renderHud();
  }
  if (msg.type === "TILE_DELTA") {
    const updates = (msg.updates as Array<Tile>) ?? [];
    for (const update of updates) {
      const existing = state.tiles.get(key(update.x, update.y));
      const merged: Tile = existing ?? { x: update.x, y: update.y, terrain: update.terrain ?? "LAND" };
      if (update.terrain) merged.terrain = update.terrain;
      if (update.fogged !== undefined) merged.fogged = update.fogged;
      if (update.resource !== undefined) merged.resource = update.resource;
      if (update.ownerId) merged.ownerId = update.ownerId;
      else delete merged.ownerId;
      if ("ownershipState" in update) {
        if (update.ownershipState) merged.ownershipState = update.ownershipState;
        else delete merged.ownershipState;
      }
      if ("capital" in update) {
        if (update.capital) merged.capital = update.capital;
        else delete merged.capital;
      }
      if ("breachShockUntil" in update) {
        if (typeof update.breachShockUntil === "number") merged.breachShockUntil = update.breachShockUntil;
        else delete merged.breachShockUntil;
      }
      if ("ownerId" in update && !update.ownerId) delete merged.ownershipState;
      if (update.clusterId !== undefined) merged.clusterId = update.clusterId;
      if (update.clusterType !== undefined) merged.clusterType = update.clusterType;
      if (update.regionType !== undefined) merged.regionType = update.regionType;
      if (update.dockId !== undefined) merged.dockId = update.dockId;
      if (update.town !== undefined) merged.town = update.town;
      if ("town" in update && !update.town) delete merged.town;
      if (update.fort !== undefined) merged.fort = update.fort;
      if (!update.fort) delete merged.fort;
      if ("observatory" in update) {
        if (update.observatory) merged.observatory = update.observatory;
        else delete merged.observatory;
      }
      if ("economicStructure" in update) {
        if (update.economicStructure) merged.economicStructure = update.economicStructure;
        else delete merged.economicStructure;
      }
      if (update.siegeOutpost !== undefined) merged.siegeOutpost = update.siegeOutpost;
      if (!update.siegeOutpost) delete merged.siegeOutpost;
      if ("sabotage" in update) {
        if (update.sabotage) merged.sabotage = update.sabotage;
        else delete merged.sabotage;
      }
      if ("yield" in update) {
        if (update.yield) merged.yield = update.yield;
        else delete merged.yield;
      }
      if ("yieldRate" in update) {
        if (update.yieldRate) merged.yieldRate = update.yieldRate;
        else delete merged.yieldRate;
      }
      if ("yieldCap" in update) {
        if (update.yieldCap) merged.yieldCap = update.yieldCap;
        else delete merged.yieldCap;
      }
      if ("history" in update) {
        if (update.history) merged.history = update.history;
        else delete merged.history;
      }
      state.tiles.set(key(update.x, update.y), merged);
      markDockDiscovered(merged);
      if (!merged.fogged) state.discoveredTiles.add(key(update.x, update.y));
    }
  }
  if (msg.type === "TECH_UPDATE") {
    console.info("[tech] TECH_UPDATE received", {
      techRootId: msg.techRootId,
      ownedTechs: (msg.techIds as string[])?.length ?? 0,
      nextChoices: (msg.nextChoices as string[])?.length ?? 0
    });
    state.techRootId = msg.techRootId as string | undefined;
    state.techIds = (msg.techIds as string[]) ?? [];
    state.techChoices = (msg.nextChoices as string[]) ?? [];
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    pushFeed(`Tech chosen: ${state.techIds[state.techIds.length - 1] ?? "unknown"}`, "tech", "success");
    renderHud();
  }
  if (msg.type === "DOMAIN_UPDATE") {
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    pushFeed(`Domain chosen: ${state.domainIds[state.domainIds.length - 1] ?? "unknown"}`, "tech", "success");
    renderHud();
  }
  if (msg.type === "REVEAL_EMPIRE_UPDATE") {
    state.activeRevealTargets = (msg.activeTargets as string[]) ?? state.activeRevealTargets;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
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
  if (msg.type === "VICTORY_PRESSURE_UPDATE") {
    state.victoryPressure = (msg.objectives as VictoryPressureObjectiveView[]) ?? state.victoryPressure;
    const announcement = msg.announcement as string | undefined;
    if (announcement) pushFeed(announcement, "info", "warn");
    renderHud();
  }
  if (msg.type === "ERROR") {
    const failedTargetKey = state.actionTargetKey;
    console.error("[server-error]", {
      code: msg.code,
      message: msg.message,
      actionInFlight: state.actionInFlight,
      actionTargetKey: failedTargetKey,
      queuedActions: state.actionQueue.length,
      selected: state.selected,
      hover: state.hover
    });
    const errorCode = String(msg.code ?? "");
    const errorMessage = String(msg.message ?? "unknown failure");
    if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE") {
      state.authSessionReady = false;
      if (errorCode === "AUTH_FAIL" && firebaseAuth?.currentUser && !state.authRetrying) {
        state.authBusy = true;
        state.authRetrying = true;
        setAuthStatus("Refreshing Firebase session...");
        syncAuthOverlay();
        void authenticateSocket(true)
          .catch(() => {
            state.authBusy = false;
            state.authRetrying = false;
            setAuthStatus(errorMessage, "error");
            syncAuthOverlay();
          });
        renderHud();
        return;
      }
      state.authBusy = false;
      state.authRetrying = false;
      setAuthStatus(errorMessage, "error");
      syncAuthOverlay();
    }
    if (errorCode === "INSUFFICIENT_GOLD" && failedTargetKey) {
      showCaptureAlert("Insufficient gold", errorMessage === "insufficient gold for frontier claim" ? "Frontier claim costs 1 gold." : "Attack cost not met.", "error");
    } else if (errorCode === "SETTLE_INVALID" && failedTargetKey) {
      showCaptureAlert("Action failed", errorMessage, "warn");
    }
    if (errorCode === "COLLECT_EMPTY") {
      pushFeed(`Nothing to collect on this tile yet: ${errorMessage}.`, "info", "warn");
    } else {
      pushFeed(explainActionFailure(errorCode, errorMessage), "error", "error");
    }
    // LOCKED while we already have an in-flight action is expected occasionally due rapid queue overlap.
    if (errorCode === "LOCKED" && state.actionInFlight) {
      renderHud();
      return;
    }
    const failedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (failedCurrentKey) state.queuedTargetKeys.delete(failedCurrentKey);
    if (failedTargetKey) state.autoSettleTargets.delete(failedTargetKey);
    state.attackPreviewPendingKey = "";
    processActionQueue();
    renderHud();
  }
  if (msg.type === "ATTACK_PREVIEW_RESULT") {
    const from = msg.from as { x: number; y: number };
    const to = msg.to as { x: number; y: number };
    const preview: {
      fromKey: string;
      toKey: string;
      valid: boolean;
      reason?: string;
      winChance?: number;
      breakthroughWinChance?: number;
      atkEff?: number;
      defEff?: number;
      defenseEffPct?: number;
    } = {
      fromKey: key(from.x, from.y),
      toKey: key(to.x, to.y),
      valid: Boolean(msg.valid)
    };
    const reason = msg.reason as string | undefined;
    const winChance = msg.winChance as number | undefined;
    const breakthroughWinChance = msg.breakthroughWinChance as number | undefined;
    const atkEff = msg.atkEff as number | undefined;
    const defEff = msg.defEff as number | undefined;
    const defMult = msg.defMult as number | undefined;
    if (reason) preview.reason = reason;
    if (typeof winChance === "number") preview.winChance = winChance;
    if (typeof breakthroughWinChance === "number") preview.breakthroughWinChance = breakthroughWinChance;
    if (typeof atkEff === "number") preview.atkEff = atkEff;
    if (typeof defEff === "number") preview.defEff = defEff;
    if (typeof defMult === "number") preview.defenseEffPct = Math.max(0, Math.min(100, defMult * 100));
    state.attackPreview = preview;
    state.attackPreviewPendingKey = "";
    if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.selected) {
      const selectedTile = state.tiles.get(key(state.selected.x, state.selected.y));
      if (selectedTile && selectedTile.ownerId && selectedTile.ownerId !== state.me && !isTileOwnedByAlly(selectedTile)) {
        openSingleTileActionMenu(selectedTile, state.tileActionMenu.x, state.tileActionMenu.y);
      }
    }
    renderHud();
  }
  if (msg.type === "PLAYER_STYLE") {
    const pid = msg.playerId as string;
    const color = msg.tileColor as string | undefined;
    const visualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) tileColorInput.value = color;
    }
    if (pid && visualStyle) state.playerVisualStyles.set(pid, visualStyle);
  }
  if (msg.type === "COLLECT_RESULT") {
    const gold = Number(msg.gold ?? 0);
    const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
    const strategicParts = Object.entries(strategic)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${Number(v).toFixed(1)} ${k}`);
    const bits: string[] = [];
    if (gold > 0) bits.push(`${gold.toFixed(1)} gold`);
    bits.push(...strategicParts);
    pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
    renderHud();
  }
  if (msg.type === "SEASON_ROLLOVER") {
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("Season rolled over. World and progression reset.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
  if (msg.type === "WORLD_REGENERATED") {
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("World regenerated by admin. Fresh map loaded.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
});

state.authConfigured = Boolean(firebaseAuth);
syncAuthOverlay();

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
  onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      state.authReady = false;
      state.authSessionReady = false;
      state.authUserLabel = "";
      state.profileSetupRequired = false;
      authToken = "";
      authUid = "";
      state.authBusy = false;
      state.authRetrying = false;
      authProfileNameEl.value = "";
      authProfileColorEl.value = "#38b000";
      syncAuthOverlay();
      return;
    }
    authEmailLinkSentTo = "";
    state.authReady = true;
    state.authSessionReady = false;
    state.authBusy = true;
    state.authRetrying = false;
    state.authUserLabel = authLabelForUser(user);
    seedProfileSetupFields(user.displayName ?? user.email?.split("@")[0] ?? "", authProfileColorEl.value);
    setAuthStatus("Authorizing empire...");
    syncAuthOverlay();
    try {
      authToken = await user.getIdToken(true);
      authUid = user.uid;
      setAuthStatus(`Authenticating ${state.authUserLabel}...`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
      } else {
        state.authBusy = false;
        setAuthStatus(`Google account connected. Game server unavailable at ${wsUrl}.`, "error");
      }
    } catch (error) {
      state.authSessionReady = false;
      state.authBusy = false;
      setAuthStatus(error instanceof Error ? error.message : "Could not authorize this session.", "error");
    } finally {
      syncAuthOverlay();
      renderHud();
    }
  });
}

const authEmailAndPassword = async (mode: "login" | "register"): Promise<void> => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  const displayName = authDisplayNameEl.value.trim();
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    syncAuthOverlay();
    return;
  }
  if (mode === "register" && !displayName) {
    setAuthStatus("Display name is required for new accounts.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus(mode === "login" ? "Signing in..." : "Creating account...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(cred.user, { displayName });
    }
    authSucceeded = true;
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Authentication failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authLoginBtn.onclick = () => {
  void authEmailAndPassword("login");
};

authRegisterBtn.onclick = () => {
  void authEmailAndPassword("register");
};

authGoogleBtn.onclick = async () => {
  if (!firebaseAuth || !googleProvider) return;
  authEmailLinkSentTo = "";
  state.authBusy = true;
  setAuthStatus("Opening Google sign-in...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    await signInWithPopup(firebaseAuth, googleProvider);
    authSucceeded = true;
    setAuthStatus("Google sign-in complete. Authorizing empire...");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Google sign-in failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailLinkBtn.onclick = async () => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  if (authEmailLinkPending && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
    await completeEmailLinkSignIn(email);
    return;
  }
  if (!email) {
    setAuthStatus("Enter your email first.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Sending sign-in link...");
  syncAuthOverlay();
  try {
    await sendSignInLinkToEmail(firebaseAuth, email, {
      url: window.location.href,
      handleCodeInApp: true
    });
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
    authEmailLinkSentTo = email;
    setAuthStatus("");
  } catch (error) {
    authEmailLinkSentTo = "";
    setAuthStatus(error instanceof Error ? error.message : "Could not send email link.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailResetBtn.onclick = () => {
  authEmailLinkSentTo = "";
  setAuthStatus("");
  authEmailEl.focus();
  syncAuthOverlay();
};

authProfileSaveBtn.onclick = async () => {
  if (!requireAuthedSession("Connection lost. Reconnect before finishing setup.")) {
    syncAuthOverlay();
    return;
  }
  const displayName = authProfileNameEl.value.trim();
  if (displayName.length < 2) {
    setAuthStatus("Display name must be at least 2 characters.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Raising your banner...");
  syncAuthOverlay();
  try {
    ws.send(JSON.stringify({ type: "SET_PROFILE", displayName, color: authProfileColorEl.value }));
    if (firebaseAuth?.currentUser && firebaseAuth.currentUser.displayName !== displayName) {
      await updateProfile(firebaseAuth.currentUser, { displayName });
    }
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Could not save your empire profile.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

if (firebaseAuth && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
  const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) ?? authEmailEl.value.trim();
  if (storedEmail) {
    void completeEmailLinkSignIn(storedEmail);
  } else {
    authEmailLinkPending = true;
    authEmailLinkSentTo = "";
    setAuthStatus("Enter the email address that received the sign-in link, then press Continue with Email.");
    syncAuthOverlay();
  }
}

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
  const dockEndpointKeys = new Set<string>();
  for (const pair of state.dockPairs) {
    dockEndpointKeys.add(key(pair.ax, pair.ay));
    dockEndpointKeys.add(key(pair.bx, pair.by));
  }
  const crystalTargetingActive = state.crystalTargeting.active;
  const crystalTone = crystalTargetingActive ? crystalTargetingTone(state.crystalTargeting.ability) : "amber";
  const queueIndex = new Map<string, number>();
  let queueOffset = 0;
  if (state.actionInFlight && state.actionTargetKey) {
    queueIndex.set(state.actionTargetKey, 1);
    queueOffset = 1;
  }
  for (let i = 0; i < state.actionQueue.length; i += 1) {
    const q = state.actionQueue[i];
    if (!q) continue;
    queueIndex.set(key(q.x, q.y), i + 1 + queueOffset);
  }

  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      const wx = wrapX(state.camX + x);
      const wy = wrapY(state.camY + y);
      const wk = key(wx, wy);
      const t = state.tiles.get(key(wx, wy));
      const vis = tileVisibilityStateAt(wx, wy, t);
      const px = (x + halfW) * size;
      const py = (y + halfH) * size;
      let ownerAlpha = 1;

      if (vis === "unexplored") {
        ctx.fillStyle = "#06090f";
        ctx.fillRect(px, py, size - 1, size - 1);
      } else if (!t) {
        if (state.firstChunkAt === 0 || state.fogDisabled) {
          const tt = terrainAt(wx, wy);
          drawTerrainTile(wx, wy, tt, px, py, size);
        } else {
          ctx.fillStyle = "#06090f";
          ctx.fillRect(px, py, size - 1, size - 1);
        }
      } else if (vis === "fogged") {
        drawTerrainTile(wx, wy, t.terrain, px, py, size);
        ctx.fillStyle = "rgba(2, 5, 10, 0.72)";
        ctx.fillRect(px, py, size - 1, size - 1);
      } else if (t.terrain === "SEA" || t.terrain === "MOUNTAIN") {
        drawTerrainTile(wx, wy, t.terrain, px, py, size);
      } else {
        drawTerrainTile(wx, wy, "LAND", px, py, size);
      }

      // Render ownership on top of land terrain so frontier tiles stay subtle and biome remains visible.
      if (t && vis === "visible" && t.terrain === "LAND" && t.ownerId) {
        ctx.fillStyle = effectiveOverlayColor(t.ownerId);
        ownerAlpha = t.ownershipState === "FRONTIER" ? 0.2 : 0.92;
        if (typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now()) {
          ownerAlpha = Math.min(ownerAlpha, 0.62);
        }
        ctx.globalAlpha = ownerAlpha;
        ctx.fillRect(px, py, size - 1, size - 1);
        ctx.globalAlpha = 1;
      }

      if (t && vis === "visible" && t.clusterType && t.terrain === "LAND") {
        const tint = clusterTint(t.clusterType);
        if (tint) {
          const marker = clusterMarkerColor(t.clusterType);
          if (marker) {
            const r = Math.max(1, Math.floor(size * 0.14));
            ctx.fillStyle = "rgba(12, 16, 28, 0.72)";
            ctx.fillRect(px + 1, py + 1, r * 2 + 1, r * 2 + 1);
            ctx.fillStyle = marker;
            ctx.fillRect(px + 2, py + 2, r * 2 - 1, r * 2 - 1);
          }
        }
      }

      const isDockEndpoint = dockEndpointKeys.has(wk);
      const dockVisible = (!t && state.fogDisabled) || vis === "visible";
      if (dockVisible && isDockEndpoint) {
        // Previous-style frame+cross marker, but with higher contrast than yellow-on-sand.
        ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
        ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
        ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
        ctx.beginPath();
        ctx.moveTo(px + size / 2, py + 3);
        ctx.lineTo(px + size / 2, py + size - 3);
        ctx.moveTo(px + 3, py + size / 2);
        ctx.lineTo(px + size - 3, py + size / 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      if (t && vis === "visible" && t.resource && t.terrain === "LAND") {
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

      if (t && vis === "visible" && t.town && t.terrain === "LAND") {
        const marker = Math.max(4, Math.floor(size * 0.34));
        const mx = px + Math.floor((size - marker) / 2);
        const my = py + Math.floor((size - marker) / 2);
        ctx.fillStyle = "rgba(10, 14, 24, 0.82)";
        ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
        if (t.town.type === "MARKET") ctx.fillStyle = "rgba(255, 212, 102, 0.95)";
        else if (t.town.type === "FARMING") ctx.fillStyle = "rgba(162, 241, 132, 0.95)";
        else ctx.fillStyle = "rgba(198, 171, 255, 0.95)";
        ctx.fillRect(mx, my, marker, marker);
      }

      if (t && vis === "visible" && t.ownerId === state.me && t.ownershipState === "SETTLED" && hasCollectableYield(t)) {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
        const marker = Math.max(4, Math.floor(size * 0.22));
        const mx = px + 3;
        const my = py + 3;
        ctx.fillStyle = `rgba(15, 18, 28, ${0.68 + pulse * 0.18})`;
        ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
        ctx.fillStyle = `rgba(255, 220, 90, ${0.75 + pulse * 0.25})`;
        ctx.fillRect(mx, my, marker, marker);
      }

      if (t && vis === "visible" && t.fort) {
        ctx.fillStyle = structureAccentColor(t.ownerId ?? "", t.fort.status === "active" ? "rgba(239,71,111,0.8)" : "rgba(255,209,102,0.75)");
        const dot = Math.max(3, Math.floor(size * 0.25));
        ctx.fillRect(px + size - dot - 2, py + 2, dot, dot);
      }
      if (t && vis === "visible" && t.siegeOutpost) {
        ctx.fillStyle = structureAccentColor(t.ownerId ?? "", t.siegeOutpost.status === "active" ? "rgba(255, 123, 0, 0.85)" : "rgba(255, 196, 122, 0.78)");
        const dot = Math.max(3, Math.floor(size * 0.25));
        ctx.fillRect(px + size - dot - 2, py + size - dot - 2, dot, dot);
      }
      if (t && vis === "visible" && t.observatory) {
        ctx.strokeStyle = structureAccentColor(t.ownerId ?? "", t.observatory.status === "active" ? "rgba(122, 214, 255, 0.92)" : "rgba(122, 214, 255, 0.42)");
        ctx.beginPath();
        ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (t && vis === "visible" && t.economicStructure) {
        const markerSize = Math.max(3, Math.floor(size * 0.2));
        const active = t.economicStructure.status === "active";
        if (t.economicStructure.type === "FARMSTEAD") {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)");
          ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
        } else if (t.economicStructure.type === "CAMP") {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(222, 174, 108, 0.95)" : "rgba(171, 134, 86, 0.74)");
          ctx.beginPath();
          ctx.moveTo(px + size / 2, py + 3);
          ctx.lineTo(px + size - 4, py + markerSize + 4);
          ctx.lineTo(px + 4, py + markerSize + 4);
          ctx.closePath();
          ctx.fill();
        } else if (t.economicStructure.type === "MINE") {
          ctx.fillStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)");
          ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
        } else {
          ctx.strokeStyle = structureAccentColor(t.ownerId ?? "", active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)");
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
          ctx.lineWidth = 1;
        }
      }
      if (t && vis === "visible" && t.sabotage && t.sabotage.endsAt > Date.now()) {
        ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 3);
        ctx.lineTo(px + size - 3, py + size - 3);
        ctx.moveTo(px + size - 3, py + 3);
        ctx.lineTo(px + 3, py + size - 3);
        ctx.stroke();
      }

      if (crystalTargetingActive && t && vis === "visible" && state.crystalTargeting.validTargets.has(wk)) {
        const fill =
          crystalTone === "amber"
            ? "rgba(255, 187, 72, 0.12)"
            : crystalTone === "cyan"
              ? "rgba(113, 223, 255, 0.13)"
              : "rgba(255, 100, 100, 0.12)";
        const stroke =
          crystalTone === "amber"
            ? "rgba(255, 201, 102, 0.88)"
            : crystalTone === "cyan"
              ? "rgba(116, 227, 255, 0.9)"
              : "rgba(255, 110, 110, 0.88)";
        ctx.fillStyle = fill;
        ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      if (t && vis === "visible" && t.ownerId && t.ownershipState !== "FRONTIER") {
        ctx.strokeStyle =
          t.ownerId === "barbarian"
            ? "rgba(214, 222, 232, 0.45)"
            : t.ownerId === state.me
              ? borderColorForOwner(t.ownerId, t.ownershipState)
              : isTileOwnedByAlly(t)
                ? "rgba(255, 205, 92, 0.82)"
                : borderColorForOwner(t.ownerId, t.ownershipState);
        ctx.lineWidth = borderLineWidthForOwner(t.ownerId, t.ownershipState);
        if (visualStyleForOwner(t.ownerId)?.borderStyle === "DASHED") ctx.setLineDash([4, 3]);
        else if (visualStyleForOwner(t.ownerId)?.borderStyle === "SOFT") ctx.setLineDash([10, 6]);
        else ctx.setLineDash([]);
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }

      if (t && vis === "visible" && typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now() && t.ownerId) {
        ctx.strokeStyle = "rgba(255,255,255,0.52)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      if (state.selected && state.selected.x === wx && state.selected.y === wy) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        ctx.lineWidth = 1;
      } else if (state.selected) {
        const selected = state.tiles.get(key(state.selected.x, state.selected.y));
        if (selected?.town && isTownSupportNeighbor(wx, wy, state.selected.x, state.selected.y)) {
          if (t?.terrain !== "LAND") {
            ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
          } else if (!t?.ownerId) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          } else if (t.ownerId !== state.me) {
            ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
          } else if (t.ownershipState === "SETTLED") {
            ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
          } else {
            ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
          }
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
          ctx.lineWidth = 1;
        }
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

      if (state.dragPreviewKeys.has(wk)) {
        ctx.strokeStyle = "rgba(129, 230, 217, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        ctx.lineWidth = 1;
      }

      const queuedN = queueIndex.get(wk);
      if (queuedN !== undefined) {
        ctx.strokeStyle = "rgba(168, 139, 250, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        if (size >= 16) {
          ctx.fillStyle = "rgba(20, 16, 35, 0.85)";
          ctx.fillRect(px + 3, py + 3, Math.min(size - 6, 14), 12);
          ctx.fillStyle = "#c4b5fd";
          ctx.font = "10px monospace";
          ctx.textBaseline = "top";
          ctx.fillText(String(queuedN), px + 5, py + 4);
        }
        ctx.lineWidth = 1;
      }
    }
  }

  const selectedWorld = selectedTile();
  if (selectedWorld && selectedWorld.observatory) {
    const selectedVisibility = tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld);
    if (selectedVisibility === "visible") {
      const center = worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
      const ringRadius = OBSERVATORY_VISION_BONUS + 0.5;
      const squareSize = ringRadius * 2 * size;
      ctx.save();
      ctx.strokeStyle =
        selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.55)" : "rgba(122, 214, 255, 0.28)";
      ctx.fillStyle =
        selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.05)" : "rgba(122, 214, 255, 0.025)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      ctx.restore();
      if (selectedWorld.ownerId === state.me && selectedWorld.observatory.status === "active") {
        const protectionRadius = OBSERVATORY_PROTECTION_RADIUS + 0.5;
        const protectionSquareSize = protectionRadius * 2 * size;
        ctx.save();
        ctx.strokeStyle = "rgba(106, 180, 255, 0.35)";
        ctx.fillStyle = "rgba(106, 180, 255, 0.02)";
        ctx.setLineDash([14, 10]);
        ctx.lineWidth = 2;
        ctx.strokeRect(
          center.sx - protectionSquareSize / 2,
          center.sy - protectionSquareSize / 2,
          protectionSquareSize,
          protectionSquareSize
        );
        ctx.fillRect(
          center.sx - protectionSquareSize / 2,
          center.sy - protectionSquareSize / 2,
          protectionSquareSize,
          protectionSquareSize
        );
        ctx.restore();
      }
    }
  }

  if (crystalTargetingActive) {
    const hoveredKey = state.hover ? key(state.hover.x, state.hover.y) : "";
    const selectedKey = state.selected ? key(state.selected.x, state.selected.y) : "";
    const targetKey = state.crystalTargeting.validTargets.has(hoveredKey)
      ? hoveredKey
      : state.crystalTargeting.validTargets.has(selectedKey)
        ? selectedKey
        : "";
    if (targetKey) {
      const target = parseKey(targetKey);
      const targetScreen = worldToScreen(target.x, target.y, size, halfW, halfH);
      const originKey = state.crystalTargeting.originByTarget.get(targetKey);
      if (originKey) {
        const origin = parseKey(originKey);
        const originScreen = worldToScreen(origin.x, origin.y, size, halfW, halfH);
        ctx.save();
        ctx.strokeStyle =
          crystalTone === "amber"
            ? "rgba(255, 205, 98, 0.92)"
            : crystalTone === "cyan"
              ? "rgba(116, 227, 255, 0.92)"
              : "rgba(255, 110, 110, 0.92)";
        ctx.lineWidth = 2;
        ctx.setLineDash(crystalTone === "cyan" ? [10, 6] : [7, 5]);
        ctx.beginPath();
        ctx.moveTo(originScreen.sx, originScreen.sy);
        ctx.lineTo(targetScreen.sx, targetScreen.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeRect(originScreen.sx - size / 2 + 2, originScreen.sy - size / 2 + 2, size - 4, size - 4);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle =
        crystalTone === "amber"
          ? "rgba(255, 219, 132, 1)"
          : crystalTone === "cyan"
            ? "rgba(153, 240, 255, 1)"
            : "rgba(255, 144, 144, 1)";
      ctx.lineWidth = 3;
      ctx.strokeRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
      ctx.restore();
    }
  }

  const routeDash = [9, 8];
  ctx.setLineDash(routeDash);
  ctx.lineDashOffset = -((nowMs / 140) % 17);
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const aIsDockLand = terrainAt(pair.ax, pair.ay) === "LAND";
    const bIsDockLand = terrainAt(pair.bx, pair.by) === "LAND";
    const selectedRoute = Boolean(
      state.selected &&
        ((pair.ax === state.selected.x && pair.ay === state.selected.y) || (pair.bx === state.selected.x && pair.by === state.selected.y))
    );
    if (!aIsDockLand || !bIsDockLand) continue;

    const route = computeDockSeaRoute(pair.ax, pair.ay, pair.bx, pair.by);
    if (route.length < 2) {
      // Fallback so every dock pair still communicates connectivity if sea routing fails.
      const a = worldToScreen(pair.ax, pair.ay, size, halfW, halfH);
      const b = {
        sx: a.sx + toroidDelta(pair.ax, pair.bx, WORLD_WIDTH) * size,
        sy: a.sy + toroidDelta(pair.ay, pair.by, WORLD_HEIGHT) * size
      };
      ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
      ctx.lineWidth = selectedRoute ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      continue;
    }
    ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
    ctx.lineWidth = selectedRoute ? 2 : 1.2;
    let prev = route[0]!;
    let prevScreen = worldToScreen(prev.x, prev.y, size, halfW, halfH);
    for (let i = 1; i < route.length; i += 1) {
      const b = route[i]!;
      const stepX = toroidDelta(prev.x, b.x, WORLD_WIDTH) * size;
      const stepY = toroidDelta(prev.y, b.y, WORLD_HEIGHT) * size;
      const sb = { sx: prevScreen.sx + stepX, sy: prevScreen.sy + stepY };
      if (
        (prevScreen.sx < -size && sb.sx < -size) ||
        (prevScreen.sy < -size && sb.sy < -size) ||
        (prevScreen.sx > canvas.width + size && sb.sx > canvas.width + size) ||
        (prevScreen.sy > canvas.height + size && sb.sy > canvas.height + size)
      ) {
        prev = b;
        prevScreen = sb;
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(prevScreen.sx, prevScreen.sy);
      ctx.lineTo(sb.sx, sb.sy);
      ctx.stroke();
      prev = b;
      prevScreen = sb;
    }
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  drawMiniMap();
  maybeRefreshForCamera(false);

  requestAnimationFrame(draw);
};

initTerrainTextures();
draw();
renderHud();
setInterval(renderCaptureProgress, 100);
setInterval(() => {
  if (!state.actionInFlight) return;
  const started = state.actionStartedAt;
  if (!started) return;
  // Stage 1: waiting for server COMBAT_START ack.
  if (!state.combatStartAck && Date.now() - started > 4_500) {
    const current = state.actionCurrent;
    state.capture = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (current && (current.retries ?? 0) < 3) {
      const retryAction: { x: number; y: number; mode?: "normal" | "breakthrough"; retries: number } = {
        x: current.x,
        y: current.y,
        retries: (current.retries ?? 0) + 1
      };
      if (current.mode) retryAction.mode = current.mode;
      state.actionQueue.unshift(retryAction);
      state.queuedTargetKeys.add(key(current.x, current.y));
      pushFeed(`No combat start from server; retrying action (${retryAction.retries}/3).`, "combat", "warn");
    } else {
      pushFeed("No combat start from server; skipping queued action.", "combat", "warn");
      if (current) state.queuedTargetKeys.delete(key(current.x, current.y));
    }
    processActionQueue();
    renderHud();
    return;
  }
  if (!state.capture) return;
  // Stage 2: combat started but result got dropped.
  if (Date.now() > state.capture.resolvesAt + 4_000) {
    const timedOutCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (timedOutCurrentKey) state.queuedTargetKeys.delete(timedOutCurrentKey);
    pushFeed("Combat result delayed locally; continuing queue.", "combat", "warn");
    processActionQueue();
    renderHud();
  }
}, 300);

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  state.zoom = Math.min(40, Math.max(10, state.zoom + (ev.deltaY > 0 ? -1 : 1)));
});

window.addEventListener("keydown", (ev) => {
  const target = ev.target as HTMLElement | null;
  const tagName = target?.tagName;
  const editing =
    target?.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT";
  if (editing) return;

  if (ev.key === "Escape") {
    cancelOngoingCapture();
    hideHoldBuildMenu();
    hideTileActionMenu();
    clearCrystalTargeting();
    return;
  }

  if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
    ev.preventDefault();
    const step = ev.shiftKey ? 8 : 3;
    if (ev.key === "ArrowUp") state.camY = wrapY(state.camY - step);
    if (ev.key === "ArrowDown") state.camY = wrapY(state.camY + step);
    if (ev.key === "ArrowLeft") state.camX = wrapX(state.camX - step);
    if (ev.key === "ArrowRight") state.camX = wrapX(state.camX + step);
    maybeRefreshForCamera(true);
  }
});
window.addEventListener("mousedown", (ev) => {
  const target = ev.target as Node | null;
  if (!target) return;
  if (holdBuildMenuEl.contains(target) || tileActionMenuEl.contains(target)) return;
  hideHoldBuildMenu();
  hideTileActionMenu();
});
window.addEventListener("resize", () => renderMobilePanels());

setInterval(() => {
  if (state.connection !== "initialized") return;
  if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
  // Keep subscription alive, but do not spam full resubscribe.
  if (Date.now() - state.lastSubAt > 20_000) requestViewRefresh(2, true);
}, isMobile() ? 8_000 : 5_000);

setInterval(() => {
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (!loadingActive) return;
  // Keep loading timer text fresh and recover from dropped initial subscriptions.
  renderHud();
  if (state.connection === "initialized" && Date.now() - state.lastSubAt > 1200) {
    requestViewRefresh(3, true);
  }
}, 300);

const worldTileFromPointer = (offsetX: number, offsetY: number): { wx: number; wy: number } => {
  const raw = worldTileRawFromPointer(offsetX, offsetY);
  return { wx: wrapX(raw.gx), wy: wrapY(raw.gy) };
};

const setCameraFromMinimapPointer = (clientX: number, clientY: number): void => {
  const rect = miniMapEl.getBoundingClientRect();
  const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const py = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const nx = rect.width <= 0 ? 0 : px / rect.width;
  const ny = rect.height <= 0 ? 0 : py / rect.height;
  state.camX = wrapX(Math.floor(nx * WORLD_WIDTH));
  state.camY = wrapY(Math.floor(ny * WORLD_HEIGHT));
  requestViewRefresh(2, true);
  window.setTimeout(() => requestViewRefresh(2, true), 120);
};

let minimapDragging = false;
miniMapEl.addEventListener("mousedown", (ev) => {
  minimapDragging = true;
  setCameraFromMinimapPointer(ev.clientX, ev.clientY);
});
window.addEventListener("mousemove", (ev) => {
  if (!minimapDragging) return;
  setCameraFromMinimapPointer(ev.clientX, ev.clientY);
});
window.addEventListener("mouseup", () => {
  minimapDragging = false;
});
miniMapEl.addEventListener(
  "touchstart",
  (ev) => {
    const t = ev.touches[0];
    if (!t) return;
    setCameraFromMinimapPointer(t.clientX, t.clientY);
  },
  { passive: true }
);

canvas.addEventListener("click", (ev) => {
  const { wx, wy } = worldTileFromPointer(ev.offsetX, ev.offsetY);
  handleTileSelection(wx, wy, ev.clientX, ev.clientY);
});

let dragActive = false;
let dragLastKey = "";
let suppressNextClick = false;
let boxSelectionEngaged = false;
let boxSelectionMode = false;
let mousePanStart: { x: number; y: number; camX: number; camY: number } | undefined;
let mousePanMoved = false;
let holdOpenTimer: number | undefined;
let holdActivated = false;
let touchHoldStart: { x: number; y: number } | undefined;
let touchTapCandidate: { x: number; y: number } | undefined;
const HOLD_OPEN_MS = 420;
const HOLD_MOVE_CANCEL_PX = 10;
const TOUCH_TAP_MAX_MOVE_PX = 12;
const MOUSE_PAN_THRESHOLD_PX = 4;
const clearHoldOpenTimer = (): void => {
  if (holdOpenTimer !== undefined) window.clearTimeout(holdOpenTimer);
  holdOpenTimer = undefined;
};
const scheduleHoldBuildMenu = (clientX: number, clientY: number, offsetX: number, offsetY: number): void => {
  clearHoldOpenTimer();
  holdActivated = false;
  holdOpenTimer = window.setTimeout(() => {
    if (!dragActive || boxSelectionEngaged) return;
    const { wx, wy } = worldTileFromPointer(offsetX, offsetY);
    const tile = state.tiles.get(key(wx, wy));
    if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") return;
    holdActivated = true;
    suppressNextClick = true;
    showHoldBuildMenu(wx, wy, clientX, clientY);
  }, HOLD_OPEN_MS);
};

canvas.addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;
  dragActive = true;
  mousePanMoved = false;
  boxSelectionMode = ev.shiftKey;
  boxSelectionEngaged = false;
  hideHoldBuildMenu();
  mousePanStart = { x: ev.clientX, y: ev.clientY, camX: state.camX, camY: state.camY };
  const raw = worldTileRawFromPointer(ev.offsetX, ev.offsetY);
  if (boxSelectionMode) {
    state.boxSelectStart = raw;
    state.boxSelectCurrent = raw;
    dragLastKey = key(wrapX(raw.gx), wrapY(raw.gy));
    computeDragPreview();
  } else {
    state.boxSelectStart = undefined;
    state.boxSelectCurrent = undefined;
    state.dragPreviewKeys.clear();
    dragLastKey = "";
  }
  if (!boxSelectionMode) {
    scheduleHoldBuildMenu(ev.clientX, ev.clientY, ev.offsetX, ev.offsetY);
  } else {
    clearHoldOpenTimer();
  }
});
canvas.addEventListener("mousemove", (ev) => {
  if (!dragActive) return;
  if (!boxSelectionMode && mousePanStart) {
    const dx = ev.clientX - mousePanStart.x;
    const dy = ev.clientY - mousePanStart.y;
    if (Math.abs(dx) > MOUSE_PAN_THRESHOLD_PX || Math.abs(dy) > MOUSE_PAN_THRESHOLD_PX) {
      clearHoldOpenTimer();
      mousePanMoved = true;
      suppressNextClick = true;
    }
    if (mousePanMoved) {
      state.camX = wrapX(Math.round(mousePanStart.camX - dx / state.zoom));
      state.camY = wrapY(Math.round(mousePanStart.camY - dy / state.zoom));
      maybeRefreshForCamera(false);
    }
    return;
  }
  const raw = worldTileRawFromPointer(ev.offsetX, ev.offsetY);
  const k = key(wrapX(raw.gx), wrapY(raw.gy));
  if (k === dragLastKey) return;
  clearHoldOpenTimer();
  dragLastKey = k;
  boxSelectionEngaged = true;
  state.boxSelectCurrent = raw;
  computeDragPreview();
});
window.addEventListener("mouseup", (ev) => {
  clearHoldOpenTimer();
  if (dragActive && boxSelectionMode && boxSelectionEngaged) {
    const dragKeys = [...state.dragPreviewKeys];
    if (dragKeys.length > 0) {
      const neutralKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.fogged && !t.ownerId;
      });
      const enemyKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.fogged && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
      });
      const ownedYieldKeys = dragKeys.filter((k) => {
        const t = state.tiles.get(k);
        if (!t || t.ownerId !== state.me) return false;
        const y = (t as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
        return Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
      });

      if (neutralKeys.length > 0 && enemyKeys.length === 0 && ownedYieldKeys.length === 0) {
        const out = queueSpecificTargets(neutralKeys, "normal");
        if (out.queued > 0) processActionQueue();
        pushFeed(`Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "info");
      } else {
        openBulkTileActionMenu(dragKeys, ev.clientX, ev.clientY);
      }
    }
    suppressNextClick = true;
  }
  dragActive = false;
  boxSelectionMode = false;
  boxSelectionEngaged = false;
  mousePanStart = undefined;
  mousePanMoved = false;
  dragLastKey = "";
  state.boxSelectStart = undefined;
  state.boxSelectCurrent = undefined;
  state.dragPreviewKeys.clear();
});
window.addEventListener("contextmenu", (ev) => {
  const target = ev.target as Node | null;
  if (target && (canvas.contains(target) || tileActionMenuEl.contains(target))) {
    ev.preventDefault();
    hideTileActionMenu();
    hideHoldBuildMenu();
  }
});

let touchPanStart: { x: number; y: number; camX: number; camY: number } | undefined;
let pinchStart: { distance: number; zoom: number } | undefined;

canvas.addEventListener(
  "touchstart",
  (ev) => {
    if (ev.touches.length === 1) {
      const t = ev.touches[0];
      if (!t) return;
      hideHoldBuildMenu();
      touchPanStart = { x: t.clientX, y: t.clientY, camX: state.camX, camY: state.camY };
      touchHoldStart = { x: t.clientX, y: t.clientY };
      touchTapCandidate = { x: t.clientX, y: t.clientY };
      const rect = canvas.getBoundingClientRect();
      scheduleHoldBuildMenu(t.clientX, t.clientY, t.clientX - rect.left, t.clientY - rect.top);
      pinchStart = undefined;
    } else if (ev.touches.length === 2) {
      const a = ev.touches[0];
      const b = ev.touches[1];
      if (!a || !b) return;
      clearHoldOpenTimer();
      touchHoldStart = undefined;
      touchTapCandidate = undefined;
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
      if (touchHoldStart) {
        const moved = Math.hypot(t.clientX - touchHoldStart.x, t.clientY - touchHoldStart.y);
        if (moved > HOLD_MOVE_CANCEL_PX) clearHoldOpenTimer();
        if (moved > TOUCH_TAP_MAX_MOVE_PX) touchTapCandidate = undefined;
      }
      const dx = t.clientX - touchPanStart.x;
      const dy = t.clientY - touchPanStart.y;
      state.camX = wrapX(Math.round(touchPanStart.camX - dx / state.zoom));
      state.camY = wrapY(Math.round(touchPanStart.camY - dy / state.zoom));
      maybeRefreshForCamera(false);
      return;
    }
    if (ev.touches.length === 2 && pinchStart) {
      touchTapCandidate = undefined;
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
    if (touchTapCandidate && !holdActivated && !pinchStart) {
      const rect = canvas.getBoundingClientRect();
      const offsetX = touchTapCandidate.x - rect.left;
      const offsetY = touchTapCandidate.y - rect.top;
      const { wx, wy } = worldTileFromPointer(offsetX, offsetY);
      suppressNextClick = true;
      handleTileSelection(wx, wy, touchTapCandidate.x, touchTapCandidate.y);
    }
    clearHoldOpenTimer();
    touchHoldStart = undefined;
    touchTapCandidate = undefined;
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
  requestAttackPreviewForHover();
});
