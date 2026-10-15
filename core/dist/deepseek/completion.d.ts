import type { DeepSeekAuth, ModelType } from "./types.js";
import type { MessageId } from "./sessionStore.js";
export interface CompletionRequest {
    token: string;
    powHeader: string;
    sessionId: string;
    modelType: ModelType;
    prompt: string;
    thinking: boolean;
    search: boolean;
    parentMessageId: MessageId;
}
/** Send the compatibility prompt and stored parent message ID to preserve lineage. */
export declare function openCompletionStream(baseUrl: string, auth: DeepSeekAuth, input: CompletionRequest): Promise<Response>;
//# sourceMappingURL=completion.d.ts.map