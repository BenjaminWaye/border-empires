// Client entrypoint:
// 1. install the global error guard first (must be the first import so its
//    listeners are registered before any other module's top-level code runs)
// 2. load global client styles
// 3. hand app assembly to the client app module
// 4. keep implementation details out of this file
import "./client-global-error-guard/client-global-error-guard.js";
import "./style.css";
import "./client-placement-overlay-style.css";
import "./client-victory-alert-style.css";
import "./client-ally-alert-style.css";
import "./client-dev-queue-state-style.css";
import "./client-capture-mustering-style.css";
import "./client-town-stat-grid-style.css";
import "./client-rush-buy-style.css";
import "./client-season-lobby-style.css";
import "./client-rally-link-settings-style.css";
import "./client-bug-report-style.css";
import "./client-hud-settings-discord-style.css";
import "./client-founding-engineer-style.css";
import "./client-tile-progress-queued-next-style.css";
import "./client-app/client-app.js";
