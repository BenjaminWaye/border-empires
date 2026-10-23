import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.borderempires.game",
  appName: "Border Empires",
  webDir: "www",
  backgroundColor: "#060c16",
  // Ship the reviewed bundle in the binary. Never set server.url for release.
  server: { androidScheme: "https", hostname: "localhost", cleartext: false },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  // GameViewController contains iOS content inside the native safe-area guides.
  ios: { contentInset: "never", webContentsDebuggingEnabled: false },
  plugins: { SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "contain" } }
};

export default config;
