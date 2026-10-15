import type { BrowserContext, Page } from "playwright-core";
import type { DeepSeekAuth } from "../deepseek/types.js";
export declare function readUserToken(page: Page): Promise<string | null>;
/** Export the current token and cookie header with owner-only file permissions. */
export declare function dumpAuth(context: BrowserContext, page: Page, file: string, baseUrl: string): Promise<DeepSeekAuth>;
/** Validate a persisted auth snapshot before using it at a trust boundary. */
export declare function loadAuth(file: string): DeepSeekAuth;
/** Return null instead of throwing when auth is missing or invalid. */
export declare function tryLoadAuth(file: string): DeepSeekAuth | null;
//# sourceMappingURL=authDump.d.ts.map