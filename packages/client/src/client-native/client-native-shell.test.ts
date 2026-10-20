// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureNativeLogin, externalNativeUrl, installNativeShell } from "./client-native-shell.js";
import { Browser } from "@capacitor/browser";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
const native = vi.hoisted(() => ({ stateListener: undefined as ((event: { isActive: boolean }) => void) | undefined }));
vi.mock("@capacitor/app", () => ({ App: {
  addListener: vi.fn(async (_name: string, callback: (event: { isActive: boolean }) => void) => {
    native.stateListener = callback;
    return { remove: vi.fn() };
  })
} }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn(async () => undefined) } }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(), sendPasswordResetEmail: vi.fn(async () => undefined) }));

describe("native shell", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  it("opens bundled legal links at their public URLs on iOS and Android", () => {
    expect(externalNativeUrl("/privacy.html", "capacitor://localhost/index.html")).toBe("https://play.borderempires.com/privacy.html");
    expect(externalNativeUrl("/terms.html", "https://localhost/index.html")).toBe("https://play.borderempires.com/terms.html");
    expect(externalNativeUrl("https://discord.gg/example", "capacitor://localhost/")).toBe("https://discord.gg/example");
    expect(externalNativeUrl("blob:https://localhost/123", "https://localhost/")).toBeUndefined();
  });
  it("waits for the asynchronous game mount and exposes password login only once", () => {
    expect(configureNativeLogin()).toBe(false);
    document.body.innerHTML = '<div class="auth-login-state"></div><div class="auth-legacy-controls" hidden><input id="auth-password"></div>';
    expect(configureNativeLogin()).toBe(true);
    expect(document.querySelector<HTMLElement>(".auth-legacy-controls")?.hidden).toBe(false);
    expect(document.querySelector(".auth-login-state #auth-password")).not.toBeNull();
    configureNativeLogin();
    expect(document.querySelectorAll("button")).toHaveLength(1);
  });
  it("intercepts legal links and forwards native resume to existing reconnect handling", async () => {
    document.body.innerHTML = '<div class="auth-login-state"></div><div class="auth-legacy-controls"></div><a href="https://discord.gg/example">Discord</a>';
    installNativeShell();
    document.querySelector("a")?.click();
    expect(Browser.open).toHaveBeenCalledWith({ url: "https://discord.gg/example" });
    const resume = vi.fn();
    document.addEventListener("resume", resume, { once: true });
    const callback = native.stateListener;
    if (typeof callback !== "function") throw new Error("Missing native state listener");
    callback({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();
  });
});
