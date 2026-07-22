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
import "./client-app/client-app.js";
