/// <reference types="@capacitor-firebase/authentication" />
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
  plugins: {
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "contain" },
    // Native Google/Apple/Twitch/Discord sign-in. The web Firebase SDK stays the
    // game's session; the native SDK only produces credentials for it
    // (client-native-sso). authDomain matches the web client's Firebase handler.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ["google.com", "apple.com"], authDomain: "play.borderempires.com" }
  },
  // Only the Google Sign-In SDK: the plugin's default iOS traits also link the
  // Facebook SDK, which the game does not use and would add tracking declarations.
  experimental: { ios: { spm: { packageTraits: { "@capacitor-firebase/authentication": ["Google"] } } } }
};

export default config;
