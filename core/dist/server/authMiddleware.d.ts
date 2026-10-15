import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
export interface ApiKeyInfo {
    keys: string[];
    source: "env" | "file" | "generated";
}
/** Split DS_API_KEY on commas/whitespace; file keys are one per line. */
export declare function parseApiKeys(raw: string, mode: "env" | "file"): string[];
/** Reuse environment/file keys or generate one persistent owner-only key. */
export declare function loadApiKey(file: string, envKey?: string | undefined): ApiKeyInfo;
export declare function extractApiKey(headers: IncomingHttpHeaders): string;
/** Use constant-time comparison after checking length to reduce timing leakage. */
export declare function apiKeysEqual(actual: string, expected: string): boolean;
export declare function isApiKeyAuthorized(headers: IncomingHttpHeaders, expected: string | readonly string[]): boolean;
/** Write the OpenAI-style 401 response when request authentication fails. */
export declare function requireApiKey(request: IncomingMessage, response: ServerResponse, expected: string | readonly string[]): boolean;
//# sourceMappingURL=authMiddleware.d.ts.map