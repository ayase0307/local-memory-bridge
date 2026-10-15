/** Maps normalized DeepSeek updates to OpenAI Responses objects and SSE events. */
import type { ToolReasoningMode } from "../config/env.js";
import { type ResponseEmitter } from "./responseEvents.js";
import type { MessageId } from "./sessionStore.js";
import type { ModelType, PublicModel } from "./types.js";
export type { ResponseEmitter } from "./responseEvents.js";
export interface ResponseMetadata extends Record<string, unknown> {
    chat_session_id: string;
    source: "chat.deepseek.com";
    thinking_enabled?: boolean;
    search_enabled?: boolean;
    model_type?: ModelType;
}
export interface OpenAIResponse {
    id: string;
    object: "response";
    created_at: number;
    status: "in_progress" | "completed";
    model: PublicModel;
    output: Array<Record<string, unknown>>;
    output_text?: string;
    title?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
    metadata: ResponseMetadata;
}
export interface CompletionDiagnostics {
    reasoningChars: number;
    outputChars: number;
    toolCallCount: number;
    emptyUpstream: boolean;
    recoverableEmpty: boolean;
    promotedReasoning: boolean;
}
export interface MappedResponseResult {
    response: OpenAIResponse;
    requestMessageId: MessageId;
    responseMessageId: MessageId;
    rawOutputText: string;
    diagnostics: CompletionDiagnostics;
}
/** Consume one upstream stream while building both live events and the final response. */
export declare function consumeResponses(input: {
    upstream: Response;
    publicModel: PublicModel;
    modelType: ModelType;
    sessionId: string;
    thinkingEnabled: boolean;
    searchEnabled: boolean;
    toolCompatibilityEnabled: boolean;
    toolReasoning: ToolReasoningMode;
    emptyToolResponseText?: string;
    emit?: ResponseEmitter;
}): Promise<MappedResponseResult>;
//# sourceMappingURL=mapResponses.d.ts.map