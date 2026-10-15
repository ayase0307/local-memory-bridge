/** Validates and reuses DeepSeek login state, waiting for interactive login only when required. */
import type { Page } from "playwright-core";
import type { AppConfig } from "../config/env.js";
import type { DeepSeekAuth } from "../deepseek/types.js";
import type { Logger } from "../utils/logger.js";
import type { ChromeManager } from "./chrome.js";
/** Coordinates login probing, user-visible waiting, and auth snapshot refreshes. */
export declare class LoginManager {
    private readonly chrome;
    private readonly config;
    private readonly logger;
    private cachedAuth;
    private hydrated;
    constructor(chrome: ChromeManager, config: AppConfig, logger: Logger);
    /**
     * Prefer saved auth.json without opening a browser.
     * Only open a visible DeepSeek window when interactive login is required.
     */
    ensureLoggedIn(): Promise<DeepSeekAuth>;
    /** Prefer cached/file auth; browser dump is best-effort and never clobbers a good snapshot. */
    dumpCurrent(): Promise<DeepSeekAuth>;
    /** Headless page for PoW; injects auth.json so empty profiles still work. */
    page(): Promise<Page>;
    /** Write token + cookies into the managed browser once per connection. */
    private hydrate;
    private probe;
}
//# sourceMappingURL=login.d.ts.map