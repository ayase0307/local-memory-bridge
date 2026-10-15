/** Solves DeepSeekHashV1 in the authenticated page and creates sessions only when needed. */
import type { Page } from "playwright-core";
import type { ModelType } from "./types.js";
export interface PreparedCompletion {
    token: string;
    powHeader: string;
    sessionId: string;
    modelType: ModelType;
    reused: boolean;
}
/**
 * Prepare one completion with a fresh PoW proof. Existing known sessions are reused;
 * otherwise the page creates exactly one new DeepSeek session.
 */
export declare function prepareCompletion(input: {
    page: Page;
    powWorkerUrl: string;
    modelType: ModelType;
    fallbackToken: string;
    sessionId: string | null;
    reuseSession: boolean;
}): Promise<PreparedCompletion>;
//# sourceMappingURL=pow.d.ts.map