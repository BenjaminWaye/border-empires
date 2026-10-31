import "./client-muster-combat-reports/client-muster-combat-reports-style.css";
// Client entrypoint:
// 1. install the global error guard first (must be the first import so its
//    listeners are registered before any other module's top-level code runs)
// 2. load global client styles
// 3. hand app assembly to the client app module
// 4. keep implementation details out of this file
import "./client-global-error-guard/client-global-error-guard.js";
import "./client-styles.js";
import "./client-app/client-app.js";
