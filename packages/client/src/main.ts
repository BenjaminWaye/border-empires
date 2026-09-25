// Client entrypoint:
// 1. install the global error guard first (must be the first import so its
//    listeners are registered before any other module's top-level code runs)
// 2. load global client styles
// 3. hand app assembly to the client app module
// 4. keep implementation details out of this file
import "./client-global-error-guard/client-global-error-guard.js";
import "./style.css";
import "./client-player-name-link-style.css";
import "./client-placement-overlay-style.css";
import "./client-victory-alert-style.css";
import "./client-player-profile-style.css";
import "./client-ally-alert-style.css";
import "./client-dev-queue-state-style.css";
import "./client-capture-mustering-style.css";
import "./client-capture-goto-style.css";
import "./client-town-stat-grid-style.css";
import "./client-feed-unread-style.css";
import "./client-rush-buy-style.css";
import "./client-season-lobby-style.css";
import "./client-rally-link-settings-style.css";
import "./client-bug-report-style.css";
import "./client-hud-settings-discord-style.css";
import "./client-founding-engineer-style.css";
import "./client-duke-title-style.css";
import "./client-tile-progress-queued-next-style.css";
import "./client-season-end-score-graph.css";
import "./client-tile-progress-battle-style.css";
import "./client-resource-discovery-info-style.css";
import "./client-steampunk-theme-style.css";
import "./client-steampunk-panels-style.css";
import "./client-steampunk-modals-style.css";
import "./client-steampunk-settings-style.css";
import "./client-steampunk-economy-domain-tech-style.css";
import "./client-steampunk-alliance-style.css";
import "./client-steampunk-tile-menu-style.css";
import "./client-tile-ownership-help-style.css";
import "./client-activity-dashboard-style.css";
import "./client-app/client-app.js";
