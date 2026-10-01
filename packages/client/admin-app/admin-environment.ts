// Which backend the admin page talks to. Mirrors the gateway defaults in
// src/client-app-runtime-env/client-app-runtime-env.ts (createClientSocketSetup)
// without opening a game socket: staging.borderempires.com -> the staging
// gateway, localhost -> the local gateway, everything else -> production.
import { isStagingHostname } from "../src/client-backend-selector/client-backend-selector.js";
import { serverHttpOriginFromWsUrl } from "../src/client-debug-bundle/client-debug-bundle.js";

export type AdminEnvironment = {
  label: "Production" | "Staging" | "Local";
  gatewayOrigin: string;
  // The same admin page on the other deployment, for the environment switch.
  otherAdminUrl: string | undefined;
};

export const PRODUCTION_ADMIN_URL = "https://play.borderempires.com/admin";
export const STAGING_ADMIN_URL = "https://staging.borderempires.com/admin";

export const resolveAdminEnvironment = (hostnameRaw: string, configuredGatewayWsUrl: string | undefined): AdminEnvironment => {
  const hostname = hostnameRaw.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  const isStaging = !isLocal && isStagingHostname(hostname);
  const defaultWsUrl = isLocal
    ? "ws://127.0.0.1:3101/ws"
    : isStaging
      ? "wss://border-empires-combined-staging.fly.dev/ws"
      : "wss://border-empires-combined.fly.dev/ws";
  return {
    label: isLocal ? "Local" : isStaging ? "Staging" : "Production",
    gatewayOrigin: serverHttpOriginFromWsUrl(configuredGatewayWsUrl ?? defaultWsUrl),
    otherAdminUrl: isLocal ? undefined : isStaging ? PRODUCTION_ADMIN_URL : STAGING_ADMIN_URL
  };
};
