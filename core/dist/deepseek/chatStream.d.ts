/** Maps DeepSeek updates to OpenAI-compatible Chat Completions chunks. */
import type { ToolReasoningMode } from "../config/env.js";
import type { CompletionDiagnostics } from "./mapResponses.js";
import type { MessageId } from "./sessionStore.js";
import { type ToolTurnOutcome } from "./toolOutcome.js";
import type { PublicModel } from "./types.js";
export interface ChatRun {
    upstream: Response;
    sessionId: string;
    publicModel: PublicModel;
}
export interface ChatStreamChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: PublicModel;
    choices: Array<{
        index: number;
        delta: Record<string, unknown>;
        finish_reason: "stop" | "tool_calls" | null;
    }>;
    conversation?: string;
    previous_response_id?: string;
}
export interface PlainChatResult {
    responseMessageId: MessageId;
    finalText: string;
    diagnostics: CompletionDiagnostics;
}
export interface ToolChatResult {
    outcome: ToolTurnOutcome;
    responseMessageId: MessageId;
}
export declare function streamPlainChat(run: ChatRun, emit: (chunk: ChatStreamChunk) => void): Promise<PlainChatResult>;
export declare function consumeToolChat(run: ChatRun, emptyFallback: string): Promise<ToolChatResult>;
export declare function toolDiagnostics(outcome: ToolTurnOutcome): CompletionDiagnostics;
/** Emit one buffered tool-compatible result after retry selection. */
export declare function emitToolChat(run: ChatRun, result: ToolChatResult, toolReasoning: ToolReasoningMode, emit: (chunk: ChatStreamChunk) => void): string;
//# sourceMappingURL=chatStream.d.ts.map