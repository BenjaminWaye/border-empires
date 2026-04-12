const hudMarkup = `
  <div id="top-strip">
    <div id="stats-chips"></div>
    <div id="panel-actions">
      <button class="icon-btn icon-only" data-panel="missions" title="Missions" aria-label="Missions"><span class="tab-icon">◎</span></button>
      <button class="icon-btn icon-only" data-panel="tech" title="Tech" aria-label="Tech"><span class="tab-icon">⚡</span></button>
      <button class="icon-btn icon-only" data-panel="alliance" title="Allies" aria-label="Allies"><span class="tab-icon">👥</span></button>
      <button class="icon-btn icon-only" data-panel="leaderboard" title="Ranks" aria-label="Ranks"><span class="tab-icon">🏆</span></button>
      <button class="icon-btn icon-only" data-panel="feed" title="Feed" aria-label="Feed"><span class="tab-icon">🔔</span></button>
      <button class="icon-btn icon-only" data-panel="domains" title="Sharding" aria-label="Sharding"><span class="tab-icon">✦</span></button>
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
        <span class="utility-btn-copy"><strong>Collect</strong><small id="collect-visible-desktop-meta">Gather visible yield</small></span>
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
          <div id="capture-head-actions">
            <div id="capture-time"></div>
            <button id="capture-close" class="capture-close-btn" type="button" title="Close result" aria-label="Close result">✕</button>
          </div>
        </div>
        <div id="capture-wrap">
          <div id="capture-bar"></div>
        </div>
        <div id="capture-target"></div>
        <button id="capture-download-debug" class="capture-debug-btn" type="button">Download debug log</button>
      </div>
      <button id="capture-cancel" class="capture-cancel-btn" title="Cancel capture">Cancel</button>
    </div>
  </div>

  <div id="shard-alert-overlay">
    <div id="shard-alert-card">
      <div id="shard-alert-head">
        <div id="shard-alert-title"></div>
        <button id="shard-alert-close" class="shard-alert-close-btn" type="button" title="Close shard alert" aria-label="Close shard alert">✕</button>
      </div>
      <div id="shard-alert-detail"></div>
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
      <div id="auth-busy-modal" aria-live="polite" aria-hidden="true">
        <div class="auth-busy-card">
          <div class="auth-busy-spinner" aria-hidden="true"></div>
          <div class="auth-busy-eyebrow">Securing session</div>
          <strong id="auth-busy-title">Connecting your empire...</strong>
          <p id="auth-busy-copy">Please wait while we finish sign-in and sync your starting state.</p>
        </div>
      </div>
    </div>
  </div>

  <div id="hold-build-menu" style="display:none;"></div>
  <div id="tile-action-menu" style="display:none;"></div>
  <div id="targeting-overlay" style="display:none;"></div>
  <div id="guide-overlay" style="display:none;"></div>
  <div id="structure-info-overlay" style="display:none;"></div>
  <div id="tech-detail-overlay" style="display:none;"></div>

  <div id="mobile-nav">
    <button data-mobile-panel="core" title="Core" aria-label="Core"><span class="tab-icon">⌂</span></button>
    <button data-mobile-panel="missions" title="Missions" aria-label="Missions"><span class="tab-icon">◎</span></button>
    <button data-mobile-panel="tech" title="Tech" aria-label="Tech"><span class="tab-icon">⚡</span></button>
    <button data-mobile-panel="domains" title="Sharding" aria-label="Sharding"><span class="tab-icon">✦</span></button>
    <button data-mobile-panel="leaderboard" title="Leaderboard" aria-label="Leaderboard"><span class="tab-icon">🏆</span></button>
    <button data-mobile-panel="social" title="Social" aria-label="Social"><span class="tab-icon">👥</span></button>
    <button data-mobile-panel="feed" title="Log" aria-label="Log"><span class="tab-icon">🔔</span></button>
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
        <span class="utility-btn-copy"><strong>Collect</strong><small id="collect-visible-mobile-meta">Visible yield</small></span>
      </button>
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
        <div class="tech-section-tabs tech-section-tabs-single">
          <button id="tech-tree-expand-toggle" class="panel-btn tech-tree-expand-toggle" type="button">Expand Tree</button>
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
      </section>
      <section id="panel-domains" class="panel-body">
        <div id="panel-domains-content"></div>
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
        <div id="alliance-player-inspect"></div>
      </section>
      <section id="panel-defensibility" class="panel-body"></section>
      <section id="panel-economy" class="panel-body"></section>
      <section id="panel-manpower" class="panel-body"></section>
      <section id="panel-leaderboard" class="panel-body">
        <div id="leaderboard"></div>
      </section>
      <section id="panel-feed" class="panel-body">
        <div id="feed"></div>
      </section>
    </div>
  </aside>

  <div id="mobile-sheet">
    <div id="mobile-sheet-head">Panel</div>
    <section id="mobile-panel-missions" class="mobile-panel"></section>
    <section id="mobile-panel-tech" class="mobile-panel">
      <div class="tech-section-tabs tech-section-tabs-single">
        <button id="mobile-tech-tree-expand-toggle" class="panel-btn tech-tree-expand-toggle" type="button">Expand Tree</button>
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
    </section>
    <section id="mobile-panel-domains" class="mobile-panel"></section>
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
      <div id="mobile-alliance-player-inspect"></div>
    </section>
    <section id="mobile-panel-defensibility" class="mobile-panel"></section>
    <section id="mobile-panel-economy" class="mobile-panel"></section>
    <section id="mobile-panel-manpower" class="mobile-panel"></section>
    <section id="mobile-panel-leaderboard" class="mobile-panel">
      <div id="mobile-leaderboard"></div>
    </section>
    <section id="mobile-panel-feed" class="mobile-panel">
      <div id="mobile-feed"></div>
    </section>
    <section id="mobile-panel-core" class="mobile-panel"></section>
  </div>
`;

const requireElement = <T extends Element>(selector: string, root: ParentNode = document): T => {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`missing required element: ${selector}`);
  return element as T;
};

export const initClientDom = () => {
  const canvas = requireElement<HTMLCanvasElement>("#game");
  const hud = requireElement<HTMLDivElement>("#hud");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("missing 2d context");
  hud.innerHTML = hudMarkup;

  const statsChipsEl = requireElement<HTMLDivElement>("#stats-chips");
  const selectedEl = requireElement<HTMLDivElement>("#selected");
  const hoverEl = requireElement<HTMLDivElement>("#hover");
  const mobileCoreHelpEl = requireElement<HTMLDivElement>("#mobile-core-help");
  const miniMapWrapEl = requireElement<HTMLDivElement>("#mini-map-wrap");
  const miniMapEl = requireElement<HTMLCanvasElement>("#mini-map");
  const miniMapLabelEl = requireElement<HTMLDivElement>("#mini-map-label");
  const captureCancelBtn = requireElement<HTMLButtonElement>("#capture-cancel");
  const captureCloseBtn = requireElement<HTMLButtonElement>("#capture-close");
  const captureDownloadDebugBtn = requireElement<HTMLButtonElement>("#capture-download-debug");
  const captureCardEl = requireElement<HTMLDivElement>("#capture-card");
  const captureWrapEl = requireElement<HTMLDivElement>("#capture-wrap");
  const captureBarEl = requireElement<HTMLDivElement>("#capture-bar");
  const captureTitleEl = requireElement<HTMLDivElement>("#capture-title");
  const captureTimeEl = requireElement<HTMLDivElement>("#capture-time");
  const captureTargetEl = requireElement<HTMLDivElement>("#capture-target");
  const shardAlertOverlayEl = requireElement<HTMLDivElement>("#shard-alert-overlay");
  const shardAlertCardEl = requireElement<HTMLDivElement>("#shard-alert-card");
  const shardAlertTitleEl = requireElement<HTMLDivElement>("#shard-alert-title");
  const shardAlertDetailEl = requireElement<HTMLDivElement>("#shard-alert-detail");
  const shardAlertCloseBtn = requireElement<HTMLButtonElement>("#shard-alert-close");
  const mapLoadingOverlayEl = requireElement<HTMLDivElement>("#map-loading-overlay");
  const mapLoadingRowEl = requireElement<HTMLDivElement>("#map-loading-row");
  const mapLoadingSpinnerEl = requireElement<HTMLDivElement>("#map-loading-spinner");
  const mapLoadingTitleEl = requireElement<HTMLDivElement>("#map-loading-title");
  const mapLoadingMetaEl = requireElement<HTMLDivElement>("#map-loading-meta");
  const authOverlayEl = requireElement<HTMLDivElement>("#auth-overlay");
  const authDisplayNameEl = requireElement<HTMLInputElement>("#auth-display-name");
  const authEmailEl = requireElement<HTMLInputElement>("#auth-email");
  const authPasswordEl = requireElement<HTMLInputElement>("#auth-password");
  const authLoginBtn = requireElement<HTMLButtonElement>("#auth-login");
  const authRegisterBtn = requireElement<HTMLButtonElement>("#auth-register");
  const authEmailLinkBtn = requireElement<HTMLButtonElement>("#auth-email-link");
  const authGoogleBtn = requireElement<HTMLButtonElement>("#auth-google");
  const authStatusEl = requireElement<HTMLDivElement>("#auth-status");
  const authPanelEl = requireElement<HTMLElement>(".auth-panel");
  const authBusyModalEl = requireElement<HTMLDivElement>("#auth-busy-modal");
  const authBusyTitleEl = requireElement<HTMLElement>("#auth-busy-title");
  const authBusyCopyEl = requireElement<HTMLParagraphElement>("#auth-busy-copy");
  const authEmailSentAddressEl = requireElement<HTMLSpanElement>("#auth-email-sent-address");
  const authEmailResetBtn = requireElement<HTMLButtonElement>("#auth-email-reset");
  const authProfileNameEl = requireElement<HTMLInputElement>("#auth-profile-name");
  const authProfileColorEl = requireElement<HTMLInputElement>("#auth-profile-color");
  const authProfileSaveBtn = requireElement<HTMLButtonElement>("#auth-profile-save");
  const authColorPresetButtons = document.querySelectorAll<HTMLButtonElement>("#auth-color-presets .auth-color-swatch");
  const holdBuildMenuEl = requireElement<HTMLDivElement>("#hold-build-menu");
  const tileActionMenuEl = requireElement<HTMLDivElement>("#tile-action-menu");
  const targetingOverlayEl = requireElement<HTMLDivElement>("#targeting-overlay");
  const sidePanelEl = requireElement<HTMLElement>("#side-panel");
  const sidePanelBodyEl = requireElement<HTMLDivElement>("#side-panel-body");
  const panelTitleEl = requireElement<HTMLHeadingElement>("#panel-title");
  const panelCloseBtn = requireElement<HTMLButtonElement>("#panel-close");
  const panelActionButtons = document.querySelectorAll<HTMLButtonElement>("#panel-actions button[data-panel]");
  const panelMissionsEl = requireElement<HTMLDivElement>("#panel-missions");
  const panelTechEl = requireElement<HTMLDivElement>("#panel-tech");
  const panelAllianceEl = requireElement<HTMLDivElement>("#panel-alliance");
  const panelDefensibilityEl = requireElement<HTMLDivElement>("#panel-defensibility");
  const panelEconomyEl = requireElement<HTMLDivElement>("#panel-economy");
  const panelManpowerEl = requireElement<HTMLDivElement>("#panel-manpower");
  const panelLeaderboardEl = requireElement<HTMLDivElement>("#panel-leaderboard");
  const panelFeedEl = requireElement<HTMLDivElement>("#panel-feed");
  const panelDomainsEl = requireElement<HTMLDivElement>("#panel-domains");
  const panelDomainsContentEl = requireElement<HTMLDivElement>("#panel-domains-content");
  const feedEl = requireElement<HTMLDivElement>("#feed");
  const techPickEl = requireElement<HTMLSelectElement>("#tech-pick");
  const techPointsEl = requireElement<HTMLDivElement>("#tech-points");
  const techCurrentModsEl = requireElement<HTMLDivElement>("#tech-current-mods");
  const techChoicesGridEl = requireElement<HTMLDivElement>("#tech-choices-grid");
  const techDetailCardEl = requireElement<HTMLDivElement>("#tech-detail-card");
  const techOwnedEl = requireElement<HTMLDivElement>("#tech-owned");
  const techChoiceDetailsEl = requireElement<HTMLDivElement>("#tech-choice-details");
  const allianceTargetEl = requireElement<HTMLInputElement>("#alliance-target");
  const allianceBreakIdEl = requireElement<HTMLInputElement>("#alliance-break-id");
  const alliesListEl = requireElement<HTMLDivElement>("#allies-list");
  const allianceRequestsEl = requireElement<HTMLDivElement>("#alliance-requests");
  const alliancePlayerInspectEl = requireElement<HTMLDivElement>("#alliance-player-inspect");
  const missionsEl = requireElement<HTMLDivElement>("#panel-missions");
  const leaderboardEl = requireElement<HTMLDivElement>("#leaderboard");
  const allianceSendBtn = requireElement<HTMLButtonElement>("#alliance-send");
  const allianceBreakBtn = requireElement<HTMLButtonElement>("#alliance-break");
  const techChooseBtn = requireElement<HTMLButtonElement>("#tech-choose");
  const techTreeExpandToggleEl = requireElement<HTMLButtonElement>("#tech-tree-expand-toggle");
  const mobileSheetEl = requireElement<HTMLDivElement>("#mobile-sheet");
  const mobileSheetHeadEl = requireElement<HTMLDivElement>("#mobile-sheet-head");
  const mobileCoreEl = requireElement<HTMLDivElement>("#mobile-core");
  const mobilePanelCoreEl = requireElement<HTMLDivElement>("#mobile-panel-core");
  const mobilePanelMissionsEl = requireElement<HTMLDivElement>("#mobile-panel-missions");
  const mobilePanelTechEl = requireElement<HTMLDivElement>("#mobile-panel-tech");
  const mobilePanelDomainsEl = requireElement<HTMLDivElement>("#mobile-panel-domains");
  const mobilePanelSocialEl = requireElement<HTMLDivElement>("#mobile-panel-social");
  const mobilePanelDefensibilityEl = requireElement<HTMLDivElement>("#mobile-panel-defensibility");
  const mobilePanelEconomyEl = requireElement<HTMLDivElement>("#mobile-panel-economy");
  const mobilePanelManpowerEl = requireElement<HTMLDivElement>("#mobile-panel-manpower");
  const mobilePanelLeaderboardEl = requireElement<HTMLDivElement>("#mobile-panel-leaderboard");
  const mobilePanelFeedEl = requireElement<HTMLDivElement>("#mobile-panel-feed");
  const mobileFeedEl = requireElement<HTMLDivElement>("#mobile-feed");
  const mobileLeaderboardEl = requireElement<HTMLDivElement>("#mobile-leaderboard");
  const mobileTechPickEl = requireElement<HTMLSelectElement>("#mobile-tech-pick");
  const mobileTechChooseBtn = requireElement<HTMLButtonElement>("#mobile-tech-choose");
  const mobileTechTreeExpandToggleEl = requireElement<HTMLButtonElement>("#mobile-tech-tree-expand-toggle");
  const mobileTechPointsEl = requireElement<HTMLDivElement>("#mobile-tech-points");
  const mobileTechCurrentModsEl = requireElement<HTMLDivElement>("#mobile-tech-current-mods");
  const mobileTechChoicesGridEl = requireElement<HTMLDivElement>("#mobile-tech-choices-grid");
  const mobileTechDetailCardEl = requireElement<HTMLDivElement>("#mobile-tech-detail-card");
  const mobileTechOwnedEl = requireElement<HTMLDivElement>("#mobile-tech-owned");
  const mobileTechChoiceDetailsEl = requireElement<HTMLDivElement>("#mobile-tech-choice-details");
  const mobileAllianceTargetEl = requireElement<HTMLInputElement>("#mobile-alliance-target");
  const mobileAllianceBreakIdEl = requireElement<HTMLInputElement>("#mobile-alliance-break-id");
  const mobileAllianceSendBtn = requireElement<HTMLButtonElement>("#mobile-alliance-send");
  const mobileAllianceBreakBtn = requireElement<HTMLButtonElement>("#mobile-alliance-break");
  const mobileAllianceRequestsEl = requireElement<HTMLDivElement>("#mobile-alliance-requests");
  const mobileAlliesListEl = requireElement<HTMLDivElement>("#mobile-allies-list");
  const mobileAlliancePlayerInspectEl = requireElement<HTMLDivElement>("#mobile-alliance-player-inspect");
  const centerMeBtn = requireElement<HTMLButtonElement>("#center-me");
  const collectVisibleMobileBtn = requireElement<HTMLButtonElement>("#collect-visible-mobile");
  const centerMeDesktopBtn = requireElement<HTMLButtonElement>("#center-me-desktop");
  const collectVisibleDesktopBtn = requireElement<HTMLButtonElement>("#collect-visible-desktop");
  const collectVisibleDesktopMetaEl = requireElement<HTMLSpanElement>("#collect-visible-desktop-meta");
  const collectVisibleMobileMetaEl = requireElement<HTMLSpanElement>("#collect-visible-mobile-meta");
  const guideOverlayEl = requireElement<HTMLDivElement>("#guide-overlay");
  const structureInfoOverlayEl = requireElement<HTMLDivElement>("#structure-info-overlay");
  const techDetailOverlayEl = requireElement<HTMLDivElement>("#tech-detail-overlay");
  const miniMapCtx = miniMapEl.getContext("2d");
  if (!miniMapCtx) throw new Error("missing minimap context");
  const miniMapBase = document.createElement("canvas");

  return {
    allianceBreakBtn,
    allianceBreakIdEl,
    alliancePlayerInspectEl,
    allianceRequestsEl,
    allianceSendBtn,
    allianceTargetEl,
    alliesListEl,
    authColorPresetButtons,
    authDisplayNameEl,
    authEmailEl,
    authEmailLinkBtn,
    authEmailResetBtn,
    authEmailSentAddressEl,
    authGoogleBtn,
    authLoginBtn,
    authBusyCopyEl,
    authBusyModalEl,
    authBusyTitleEl,
    authOverlayEl,
    authPanelEl,
    authPasswordEl,
    authProfileColorEl,
    authProfileNameEl,
    authProfileSaveBtn,
    authRegisterBtn,
    authStatusEl,
    canvas,
    captureBarEl,
    captureCancelBtn,
    captureCloseBtn,
    captureDownloadDebugBtn,
    captureCardEl,
    captureTargetEl,
    captureTimeEl,
    captureTitleEl,
    captureWrapEl,
    centerMeBtn,
    centerMeDesktopBtn,
    collectVisibleDesktopBtn,
    collectVisibleDesktopMetaEl,
    collectVisibleMobileBtn,
    collectVisibleMobileMetaEl,
    ctx,
    feedEl,
    guideOverlayEl,
    holdBuildMenuEl,
    hoverEl,
    hud,
    leaderboardEl,
    mapLoadingMetaEl,
    mapLoadingOverlayEl,
    mapLoadingRowEl,
    mapLoadingSpinnerEl,
    mapLoadingTitleEl,
    miniMapBase,
    miniMapCtx,
    miniMapEl,
    miniMapLabelEl,
    miniMapWrapEl,
    missionsEl,
    mobileAllianceBreakBtn,
    mobileAllianceBreakIdEl,
    mobileAlliancePlayerInspectEl,
    mobileAllianceRequestsEl,
    mobileAllianceSendBtn,
    mobileAllianceTargetEl,
    mobileAlliesListEl,
    mobileCoreEl,
    mobileCoreHelpEl,
    mobilePanelDefensibilityEl,
    mobilePanelFeedEl,
    mobileFeedEl,
    mobileLeaderboardEl,
    mobilePanelCoreEl,
    mobilePanelEconomyEl,
    mobilePanelLeaderboardEl,
    mobilePanelManpowerEl,
    mobilePanelMissionsEl,
    mobilePanelSocialEl,
    mobilePanelTechEl,
    mobilePanelDomainsEl,
    mobileSheetEl,
    mobileSheetHeadEl,
    mobileTechChoiceDetailsEl,
    mobileTechChoicesGridEl,
    mobileTechChooseBtn,
    mobileTechCurrentModsEl,
    mobileTechDetailCardEl,
    mobileTechOwnedEl,
    mobileTechPickEl,
    mobileTechPointsEl,
    panelActionButtons,
    panelAllianceEl,
    panelCloseBtn,
    panelDefensibilityEl,
    panelEconomyEl,
    panelManpowerEl,
    panelFeedEl,
    panelLeaderboardEl,
    panelDomainsContentEl,
    panelDomainsEl,
    panelMissionsEl,
    panelTechEl,
    panelTitleEl,
    selectedEl,
    shardAlertCardEl,
    shardAlertCloseBtn,
    shardAlertDetailEl,
    shardAlertOverlayEl,
    shardAlertTitleEl,
    sidePanelBodyEl,
    sidePanelEl,
    statsChipsEl,
    structureInfoOverlayEl,
    techDetailOverlayEl,
    targetingOverlayEl,
    techChoiceDetailsEl,
    techChoicesGridEl,
    techChooseBtn,
    techCurrentModsEl,
    techDetailCardEl,
    techTreeExpandToggleEl,
    techOwnedEl,
    techPickEl,
    techPointsEl,
    tileActionMenuEl,
    mobileTechTreeExpandToggleEl
  };
};
