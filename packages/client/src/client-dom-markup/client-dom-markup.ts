export const hudMarkup = `
  <div id="top-strip">
    <div id="stats-chips"></div>
    <div id="panel-actions">
      <button class="icon-btn icon-only" hidden data-panel="missions" title="Missions" aria-label="Missions"><span class="tab-icon">◎</span></button>
      <button class="icon-btn icon-only" data-panel="tech" title="Tech" aria-label="Tech"><span class="tab-icon">⚡</span></button>
      <button class="icon-btn icon-only" data-panel="alliance" title="Allies" aria-label="Allies"><span class="tab-icon">👥</span></button>
      <button class="icon-btn icon-only" data-panel="leaderboard" title="Ranks" aria-label="Ranks"><span class="tab-icon">🏆</span></button>
      <button class="icon-btn icon-only" data-panel="feed" title="Alerts" aria-label="Alerts"><span class="tab-icon">🔔</span></button>
      <button class="icon-btn icon-only" data-open-activity-dashboard title="Activity" aria-label="Activity"><span class="tab-icon">📜</span></button>
      <button class="icon-btn icon-only" data-panel="domains" title="Sharding" aria-label="Sharding"><span class="tab-icon">✦</span></button> <button class="icon-btn icon-only" data-panel="settings" title="Settings" aria-label="Settings"><span class="tab-icon">⚙</span></button>
    </div>
  </div>

  <div id="floating-info">
    <div id="selected"></div>
    <div id="hover"></div>
    <div class="row">
      <!-- Former "Center" button, kept under its id for layout/onboarding; now jumps to the home AFC. -->
      <button id="center-me-desktop" class="panel-btn utility-btn" type="button">
        <span class="utility-btn-icon" aria-hidden="true">⬢</span>
        <span class="utility-btn-copy"><strong>AFC</strong><small>Open your fabrication complex</small></span>
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
        <button id="capture-goto" class="capture-goto-btn" type="button" style="display:none">Center</button>
        <button id="capture-download-debug" class="capture-debug-btn" type="button">Download debug log</button>
      </div>
      <button id="capture-cancel" class="capture-cancel-btn" title="Cancel capture">Cancel</button>
      <button id="capture-dismiss" class="capture-dismiss-btn" type="button" title="Hide this progress bar">Dismiss</button>
    </div>
  </div>

  <div id="placement-overlay" style="display:none">
    <span id="placement-label"></span>
    <button id="placement-cancel" class="placement-btn placement-cancel-btn" type="button">Cancel</button>
    <button id="placement-confirm" class="placement-btn placement-confirm-btn" type="button">Confirm</button>
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

  <div id="victory-alert-overlay" style="display:none">
    <div id="victory-alert-card">
      <div id="victory-alert-head">
        <div id="victory-alert-title"></div>
        <button id="victory-alert-collapse" class="victory-alert-collapse-btn" type="button" title="Minimize" aria-label="Minimize">✕</button>
      </div>
      <div id="victory-alert-detail"></div>
    </div>
    <button id="victory-alert-banner" class="victory-alert-banner-btn" type="button"></button>
  </div>

  <div id="map-loading-overlay">
    <div id="map-loading-row">
      <div id="map-loading-spinner" aria-hidden="true"></div>
      <div id="map-loading-copy">
        <div id="map-loading-title">Loading world...</div>
        <div id="map-loading-meta">Preparing map data...</div>
      </div>
    </div>
    <div id="map-loading-actions">
      <button id="map-loading-retry" class="panel-btn map-loading-btn" type="button">Retry now</button>
      <button id="map-loading-reload" class="panel-btn map-loading-btn map-loading-btn-secondary" type="button">Reload</button>
      <button id="map-loading-diagnostics" class="panel-btn map-loading-btn map-loading-btn-secondary" type="button">Download diagnostics</button>
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
          <button id="auth-play-now" class="panel-btn auth-primary-sso auth-play-now-cta" data-emphasis="primary">Play now</button>
          <div class="auth-divider"><span>Or sign in</span></div>
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
          <button id="auth-twitch" class="panel-btn auth-twitch-btn auth-primary-sso">
            <span class="auth-twitch-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path fill="currentColor" d="M11.57 4.71h1.72v5.15h-1.72Zm4.72 0H18v5.15h-1.71ZM6 0 1.71 4.29v15.42h5.15V24l4.28-4.29h3.43L22.29 12V0Zm14.57 11.14-3.43 3.43h-3.43l-3 3v-3H6.86V1.71h13.71Z"></path>
              </svg>
            </span>
            <span>Continue with Twitch</span>
          </button>
          <button id="auth-discord" class="panel-btn auth-discord-btn auth-primary-sso">
            <span class="auth-sso-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.12l.37-.3a.07.07 0 0 1 .08 0c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"></path>
              </svg>
            </span>
            <span>Continue with Discord</span>
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
              <button type="button" class="auth-color-swatch"></button>
              <button type="button" class="auth-color-swatch"></button>
              <button type="button" class="auth-color-swatch"></button>
              <button type="button" class="auth-color-swatch"></button>
              <button type="button" class="auth-color-swatch"></button>
              <button type="button" class="auth-color-swatch"></button>
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
        <div id="auth-debug-route"></div>
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
          <div id="auth-busy-progress" class="auth-busy-progress" role="progressbar" aria-label="World download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><div class="auth-busy-progress-fill"></div></div>
          <button id="auth-busy-diagnostics" class="panel-btn map-loading-btn map-loading-btn-secondary" type="button" style="display:none;">Download diagnostics</button>
          <button id="auth-busy-season-full-notify" class="panel-btn" type="button" style="display:none;">Alert me when next season starts</button>
        </div>
      </div>
    </div>
  </div>

  <div id="tile-action-menu" style="display:none;"></div>
  <div id="targeting-overlay" style="display:none;"></div>
  <div id="activity-dashboard-overlay" style="display:none;"></div>
  <div id="respawn-overlay" style="display:none;"></div>
  <div id="join-season-overlay" style="display:none;"></div>
  <div id="season-end-overlay" style="display:none;"></div>
  <div id="intel-overlay" style="display:none;"></div>
  <div id="player-profile-overlay" style="display:none;"></div>
  <div id="renderer-prompt-overlay" style="display:none;"></div>
  <div id="structure-info-overlay" style="display:none;"></div>
  <div id="tech-detail-overlay" style="display:none;"></div>

  <div id="mobile-nav">
    <button data-mobile-panel="core" title="Core" aria-label="Core"><span class="tab-icon">⌂</span></button>
    <button hidden data-mobile-panel="missions" title="Missions" aria-label="Missions"><span class="tab-icon">◎</span></button>
    <button data-mobile-panel="tech" title="Tech" aria-label="Tech"><span class="tab-icon">⚡</span></button>
    <button data-mobile-panel="domains" title="Sharding" aria-label="Sharding"><span class="tab-icon">✦</span></button>
    <button data-mobile-panel="leaderboard" title="Leaderboard" aria-label="Leaderboard"><span class="tab-icon">🏆</span></button>
    <button data-mobile-panel="social" title="Social" aria-label="Social"><span class="tab-icon">👥</span></button>
    <button data-mobile-panel="feed" title="Alerts" aria-label="Alerts"><span class="tab-icon">🔔</span></button>
    <button data-open-activity-dashboard title="Activity" aria-label="Activity"><span class="tab-icon">📜</span></button>
    <button data-mobile-panel="settings" title="Settings" aria-label="Settings"><span class="tab-icon">⚙</span></button>
  </div>

  <div id="mobile-core" class="mobile-panel">
    <div id="mobile-core-help" class="card mobile-context-card"></div>
    <div class="row mobile-utility-row">
      <button id="center-me" class="panel-btn utility-btn utility-btn-mobile" type="button">
        <span class="utility-btn-icon" aria-hidden="true">⬢</span>
        <span class="utility-btn-copy"><strong>AFC</strong><small>Modules</small></span>
      </button>
    </div>
  </div>

  <aside id="side-panel">
    <div id="side-panel-head">
      <h3 id="panel-title">Panel</h3>
      <button id="panel-close">Close</button>
    </div>
    <div id="side-panel-body">
      <section id="panel-missions" class="panel-body" hidden></section>
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
      <section id="panel-alliance" class="panel-body alliance-panel">
        <div class="alliance-form-section">
          <input id="alliance-target" placeholder="ally player name" list="alliance-target-options" autocomplete="off" />
          <button id="alliance-send" class="panel-btn" type="button">Send</button>
        </div>
        <datalist id="alliance-target-options"></datalist>
        <div id="allies-list" class="alliance-section-stack"></div>
        <div id="alliance-requests" class="alliance-section-stack"></div>
        <div id="alliance-player-inspect" class="alliance-player-inspect-slot"></div>
      </section>
      <section id="panel-defensibility" class="panel-body"></section>
      <section id="panel-economy" class="panel-body"></section>
      <section id="panel-manpower" class="panel-body"></section>
      <section id="panel-development" class="panel-body"></section>
      <section id="panel-leaderboard" class="panel-body">
        <div id="leaderboard"></div>
      </section>
      <section id="panel-feed" class="panel-body">
        <div id="feed"></div>
      </section> <section id="panel-settings" class="panel-body"></section>
    </div>
  </aside>

  <div id="mobile-sheet">
    <div id="mobile-sheet-head">Panel</div>
    <section id="mobile-panel-missions" class="mobile-panel" hidden></section>
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
    <section id="mobile-panel-social" class="mobile-panel alliance-panel">
      <div class="alliance-form-section">
        <input id="mobile-alliance-target" placeholder="ally player name" list="alliance-target-options" autocomplete="off" />
        <button id="mobile-alliance-send" class="panel-btn" type="button">Send</button>
      </div>
      <div id="mobile-allies-list" class="alliance-section-stack"></div>
      <div id="mobile-alliance-requests" class="alliance-section-stack"></div>
      <div id="mobile-alliance-player-inspect" class="alliance-player-inspect-slot"></div>
    </section>
    <section id="mobile-panel-defensibility" class="mobile-panel"></section>
    <section id="mobile-panel-economy" class="mobile-panel"></section>
    <section id="mobile-panel-manpower" class="mobile-panel"></section>
    <section id="mobile-panel-development" class="mobile-panel"></section>
    <section id="mobile-panel-leaderboard" class="mobile-panel">
      <div id="mobile-leaderboard"></div>
    </section>
    <section id="mobile-panel-feed" class="mobile-panel">
      <div id="mobile-feed"></div>
    </section> <section id="mobile-panel-settings" class="mobile-panel"></section>
    <section id="mobile-panel-core" class="mobile-panel"></section>
  </div>
`;
