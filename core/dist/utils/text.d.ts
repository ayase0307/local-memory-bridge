export declare function messageText(message: unknown): string;
/** Return only the newest user turn because DeepSeek stores prior turns server-side. */
export declare function latestUserText(items: unknown[]): string;
/** Normalize Responses, Chat Completions, and prompt-style input into one prompt. */
export declare function extractInputText(body: Record<string, unknown>): string;
export declare function normalizeText(value: unknown): string;
//# sourceMappingURL=text.d.ts.map