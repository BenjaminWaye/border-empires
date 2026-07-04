#!/usr/bin/env node
/**
 * Shared helper: exchange a Firebase refresh token for a fresh ID token.
 * Used by any script that needs to authenticate against staging/production
 * as a real Firebase user (rewrite-load-harness.mjs, staging-login-latency-probe.mjs).
 *
 * The API key below is Firebase's public client-side identifier for this
 * project (not a secret — safe to embed; Firebase API keys only select which
 * project a request targets, they do not grant access on their own). Only
 * the refresh token itself is sensitive.
 */
const FIREBASE_API_KEY = "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";

export const refreshFirebaseAuthToken = async (refreshToken) => {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  if (!response.ok) throw new Error(`firebase token refresh failed: ${response.status}`);
  const data = await response.json();
  return data.id_token;
};
