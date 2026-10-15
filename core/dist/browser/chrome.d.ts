import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../utils/logger.js";
export { findChromeExecutable } from "./chromePaths.js";
export interface ConnectOptions {
    /** Force a visible window for interactive login. */
    visible?: boolean;
    /** Open chat.deepseek.com after connect (login UX only). */
    openDeepSeek?: boolean;
}
/** Owns the reusable CDP connection and DeepSeek page selection. */
export declare class ChromeManager {
    private readonly config;
    private readonly logger;
    private browser;
    private launchedVisible;
    private cdpEndpoint;
    private readonly cdpFile;
    constructor(config: AppConfig, logger: Logger);
    /**
     * Connect order:
     * 1) already-connected instance
     * 2) saved managed CDP (data/chrome.cdp)
     * 3) live process holding chrome-profile SingletonLock
     * 4) clean configured DS_CDP
     * 5) launch new managed Chrome (never against a foreign locked profile)
     */
    connect(options?: ConnectOptions): Promise<Browser>;
    context(options?: ConnectOptions): Promise<BrowserContext>;
    deepSeekPage(options?: ConnectOptions): Promise<Page>;
    isConnected(): boolean;
    disconnect(): Promise<void>;
    private candidateEndpoints;
    private ensureManagedChrome;
    private launchManagedChrome;
}
//# sourceMappingURL=chrome.d.ts.map