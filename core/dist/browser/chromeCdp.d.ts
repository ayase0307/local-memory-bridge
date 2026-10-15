export declare function localDebugPort(endpoint: string): number | null;
export declare function cdpVersionOk(endpoint: string): Promise<boolean>;
/**
 * Playwright crashes on chrome-extension service_worker targets.
 * Only reuse a CDP endpoint when it has no extension targets.
 */
export declare function cdpIsExtensionFree(endpoint: string): Promise<boolean>;
export declare function waitForCdp(endpoint: string, timeoutMs?: number): Promise<void>;
export declare function freePort(): Promise<number>;
/** Recover CDP URL from a live Chrome that already owns chromeProfileDir. */
export declare function existingManagedEndpoint(profileDir: string): string | null;
/** Drop Singleton* files only when the owning PID is dead. */
export declare function clearStaleProfileLocks(profileDir: string): void;
export declare function readSavedCdp(file: string): string | null;
export declare function writeSavedCdp(file: string, endpoint: string): void;
//# sourceMappingURL=chromeCdp.d.ts.map