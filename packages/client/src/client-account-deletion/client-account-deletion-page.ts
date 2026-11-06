import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { openAccountDeletion } from "./client-account-deletion.js";
import "./client-account-deletion.css";

// This page needs authentication only: it does not initialize game telemetry,
// analytics, a game socket, guest registration or account creation.
const app = getApps()[0] ?? initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? (["play.borderempires.com", "staging.borderempires.com"].includes(location.hostname) ? location.hostname : "border-empires.firebaseapp.com"),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "border-empires",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:979056688511:web:d0af9a130d6eabacf36e4a"
});
const auth = getAuth(app);
const wsUrl = (import.meta.env.VITE_GATEWAY_WS_URL as string | undefined) ??
  (location.hostname === "staging.borderempires.com" ? "wss://api-staging.borderempires.com/ws" : "wss://api.borderempires.com/ws");
const form = document.querySelector<HTMLFormElement>("#deletion-sign-in")!;
const social = document.querySelector<HTMLElement>("#deletion-social")!;
const status = document.querySelector<HTMLElement>("#deletion-status")!;
const open = document.querySelector<HTMLButtonElement>("#deletion-open")!;
onAuthStateChanged(auth, (user) => {
  form.hidden = Boolean(user);
  social.hidden = Boolean(user);
  open.hidden = !user;
  status.textContent = user ? "You’re signed in. Continue below to confirm deletion." : "Sign in to verify ownership. No support call or email is required.";
});
form.onsubmit = async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  try {
    await signInWithEmailAndPassword(auth, String(fields.get("email")), String(fields.get("password")));
    form.reset();
  } catch { status.textContent = "Could not sign in. Check your email/password and connection."; }
};
social.querySelectorAll<HTMLButtonElement>("[data-provider]").forEach((button) => {
  button.onclick = async () => {
    const id = button.dataset.provider;
    if (!id) return;
    const provider = id === "google.com" ? new GoogleAuthProvider() : new OAuthProvider(id);
    if (id === "oidc.twitch") { provider.addScope("openid"); provider.addScope("user:read:email"); }
    if (id === "oidc.discord") { provider.addScope("openid"); provider.addScope("identify"); provider.addScope("email"); }
    try { await signInWithPopup(auth, provider); }
    catch { status.textContent = "Sign-in did not complete. Please try again."; }
  };
});
open.onclick = () => openAccountDeletion(auth, wsUrl);
