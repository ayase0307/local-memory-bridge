import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { BrowserContext, Page } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config/env.js";
import { ChromeManager } from "../../src/browser/chrome.js";
import { LoginManager } from "../../src/browser/login.js";
import type { ChromeManager as ChromeManagerType } from "../../src/browser/chrome.js";
import { createLogger } from "../../src/utils/logger.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function appConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8787,
    host: "127.0.0.1",
    cdpEndpoint: "http://127.0.0.1:9333",
    dataDir: tmpdir(),
    authFile: path.join(tmpdir(), "browser-navigation-auth.json"),
    apiKeyFile: path.join(tmpdir(), ".api-key"),
    sessionsFile: path.join(tmpdir(), "sessions.json"),
    chromeProfileDir: path.join(tmpdir(), "chrome-profile"),
    powWorkerUrl: "https://example.test/pow.js",
    baseUrl: "https://chat.deepseek.com",
    debug: false,
    toolReasoning: "hidden",
    showBrowser: false,
    ...overrides,
  };
}

describe("ChromeManager navigation races", () => {
  it("waits for the expected origin after a duplicate initial navigation is interrupted", async () => {
    const config = appConfig();
    const goto = vi.fn().mockRejectedValue(
      new Error(`page.goto: Navigation to "${config.baseUrl}/" is interrupted by another navigation`),
    );
    const waitForURL = vi.fn(async (_matcher: unknown, _options: unknown) => undefined);
    const page = { url: () => "about:blank", goto, waitForURL } as unknown as Page;
    const context = { pages: () => [page] } as unknown as BrowserContext;
    const manager = new ChromeManager(config, createLogger());
    vi.spyOn(manager, "context").mockResolvedValue(context);

    await expect(manager.deepSeekPage()).resolves.toBe(page);

    expect(goto).toHaveBeenCalledWith(config.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(waitForURL).toHaveBeenCalledWith(expect.any(Function), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const matcher = waitForURL.mock.calls[0]?.[0];
    expect(typeof matcher).toBe("function");
    if (typeof matcher === "function") {
      expect(matcher(new URL("https://chat.deepseek.com/login"))).toBe(true);
      expect(matcher(new URL("https://chat.deepseek.com.evil.test/login"))).toBe(false);
      expect(matcher(new URL("https://chat.deepseek.com:444/login"))).toBe(false);
    }
  });

  it("propagates unexpected goto errors", async () => {
    const failure = new Error("net::ERR_CERT_AUTHORITY_INVALID");
    const page = {
      url: () => "about:blank",
      goto: vi.fn().mockRejectedValue(failure),
      waitForURL: vi.fn(),
    } as unknown as Page;
    const context = { pages: () => [page] } as unknown as BrowserContext;
    const manager = new ChromeManager(appConfig(), createLogger());
    vi.spyOn(manager, "context").mockResolvedValue(context);

    await expect(manager.deepSeekPage()).rejects.toBe(failure);
    expect(page.waitForURL).not.toHaveBeenCalled();
  });

  it("propagates target closure while waiting for the interrupted navigation", async () => {
    const failure = new Error("Target closed");
    const config = appConfig();
    const page = {
      url: () => "about:blank",
      goto: vi.fn().mockRejectedValue(
        new Error(`Navigation to "${config.baseUrl}/" is interrupted by another navigation`),
      ),
      waitForURL: vi.fn().mockRejectedValue(failure),
    } as unknown as Page;
    const context = { pages: () => [page] } as unknown as BrowserContext;
    const manager = new ChromeManager(config, createLogger());
    vi.spyOn(manager, "context").mockResolvedValue(context);

    await expect(manager.deepSeekPage()).rejects.toBe(failure);
  });
});

describe("LoginManager navigation races", () => {
  it("continues probing after navigation destroys the page execution context", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "browser-navigation-"));
    temporaryDirectories.push(directory);
    const authFile = path.join(directory, "auth.json");
    const config = appConfig({ authFile });
    const page = {
      url: () => `${config.baseUrl}/`,
      bringToFront: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockRejectedValueOnce(new Error("Execution context was destroyed, most likely because of a navigation."))
        .mockResolvedValueOnce("fake-token")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce("fake-token"),
    } as unknown as Page;
    const context = {
      cookies: vi.fn().mockResolvedValue([{ name: "ds_session_id", value: "fake-cookie" }]),
    } as unknown as BrowserContext;
    const chrome = {
      deepSeekPage: vi.fn().mockResolvedValue(page),
      context: vi.fn().mockResolvedValue(context),
    } as unknown as ChromeManagerType;
    const login = new LoginManager(chrome, config, createLogger());

    await expect(login.ensureLoggedIn()).resolves.toMatchObject({ token: "fake-token" });
    expect(page.waitForTimeout).toHaveBeenCalledOnce();
    expect(page.evaluate).toHaveBeenCalledTimes(4);
  });

  it("propagates a closed target instead of treating it as a navigation retry", async () => {
    const config = appConfig();
    const failure = new Error("Target closed");
    const page = {
      url: () => `${config.baseUrl}/`,
      bringToFront: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn().mockRejectedValue(failure),
    } as unknown as Page;
    const chrome = {
      deepSeekPage: vi.fn().mockResolvedValue(page),
    } as unknown as ChromeManagerType;
    const login = new LoginManager(chrome, config, createLogger());

    await expect(login.ensureLoggedIn()).rejects.toBe(failure);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it("propagates execution-context errors without the confirmed navigation message", async () => {
    const config = appConfig();
    const failure = new Error("Execution context was destroyed because the target became unavailable.");
    const page = {
      url: () => `${config.baseUrl}/`,
      bringToFront: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn().mockRejectedValue(failure),
    } as unknown as Page;
    const chrome = {
      deepSeekPage: vi.fn().mockResolvedValue(page),
    } as unknown as ChromeManagerType;
    const login = new LoginManager(chrome, config, createLogger());

    await expect(login.ensureLoggedIn()).rejects.toBe(failure);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});
