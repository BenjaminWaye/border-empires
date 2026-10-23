import { Capacitor } from "@capacitor/core";

// Extracted out of client-map-3d.ts (500-line file cap, AGENTS.md): the
// localhost-only "[3d-ownership-debug]" console/window probe for the
// selected tile's ownership tint is a self-contained debug concern, not part
// of the terrain/overlay rebuild around it.

type OwnershipDebugWindow = Window & { __be3dOwnershipDebug?: unknown };

const ownershipDebugWindow = (): OwnershipDebugWindow | undefined =>
  typeof window !== "undefined" ? (window as OwnershipDebugWindow) : undefined;

const shouldDebugOwnership = (): boolean =>
  !Capacitor.isNativePlatform() && typeof window !== "undefined" && window.location.hostname === "localhost";

/** Returns an emitter that logs a payload once per distinct value, on localhost only. */
export const createOwnershipDebugEmitter = (): ((payload: Record<string, unknown>) => void) => {
  let lastOwnershipDebugSignature = "";
  return (payload) => {
    if (!shouldDebugOwnership()) return;
    const signature = JSON.stringify(payload);
    if (signature === lastOwnershipDebugSignature) return;
    lastOwnershipDebugSignature = signature;
    const debugTarget = ownershipDebugWindow();
    if (debugTarget) debugTarget.__be3dOwnershipDebug = payload;
    console.info("[3d-ownership-debug]", payload);
  };
};
