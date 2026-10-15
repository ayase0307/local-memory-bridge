/** Normalizes tool-compatible upstream text without exposing protocol garbage. */
import type { ParsedToolCalls } from "./toolCalls.js";
export declare const EMPTY_TOOL_RESPONSE_TEXT = "DeepSeek Web did not produce a usable tool call or final answer after one automatic retry. Please retry this turn.";
export interface ToolTurnOutcome {
    parsed: ParsedToolCalls;
    reasoningText: string;
    outputText: string;
    promotedReasoning: boolean;
    recoverableEmpty: boolean;
    emptyUpstream: boolean;
}
/** Promote reasoning-only prose, preserve tool calls, and identify responses that need one retry. */
export declare function resolveToolTurn(outputText: string, reasoningText: string, idSeed: string, emptyFallback?: string): ToolTurnOutcome;
//# sourceMappingURL=toolOutcome.d.ts.map