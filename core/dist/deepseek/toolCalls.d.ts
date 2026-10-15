export interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}
export interface ParsedToolCalls {
    content: string;
    toolCalls: OpenAIToolCall[];
}
export declare function stableJson(value: unknown, pretty?: boolean): string;
export declare function formatToolCall(name: string, argumentsValue: unknown): string | null;
/** Parse model tool-call text into OpenAI-compatible calls and cleaned content. */
export declare function parseToolCalls(text: string, seed?: string): ParsedToolCalls;
/** Prefer valid output calls, then promote calls leaked into reasoning. */
export declare function parseToolCallsFromParts(outputText: string, reasoningText: string, seed?: string): ParsedToolCalls;
export declare function canonicalParsedAssistantText(parsed: ParsedToolCalls): string;
/** Store a canonical assistant turn so structured client history can match it later. */
export declare function canonicalAssistantText(text: string): string;
//# sourceMappingURL=toolCalls.d.ts.map