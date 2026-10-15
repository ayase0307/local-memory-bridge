import type { Logger } from "../utils/logger.js";
import type { MessageTurn, ModelType, RequestBody } from "./types.js";
export type MessageId = string | number | null;
export interface SessionEntry {
    lastResponseMessageId: MessageId;
    lastModelType?: ModelType;
    modelType?: ModelType;
    instructionFingerprint?: string;
    toolsFingerprint?: string;
    updatedAt: number;
    turns: MessageTurn[];
}
export interface ConversationResolution {
    sessionId: string | null;
    parentMessageId: MessageId;
    key: string | null;
    pendingFingerprint?: string;
    createIfMissing?: boolean;
}
/** Public session index used by every completion path. */
export declare class SessionStore {
    private readonly file?;
    private readonly logger?;
    private readonly sessions;
    private readonly convIndex;
    constructor(file?: string | undefined, logger?: Logger | undefined);
    has(sessionId: string): boolean;
    get(sessionId: string): SessionEntry | undefined;
    /** Resolve explicit IDs first, then previous response IDs, then history fingerprints. */
    resolve(body: RequestBody): ConversationResolution;
    /** Save the response message ID required as the next parent_message_id. */
    remember(input: {
        sessionId: string;
        modelType: ModelType;
        responseMessageId: MessageId;
        convKey?: string | null;
        prompt: string;
        responseText: string;
        requestTurns?: MessageTurn[];
        instructionFingerprint?: string;
        toolsFingerprint?: string;
    }): void;
    private resolveExplicit;
    private requestMessages;
    /** Use exact fingerprints before conservative equality, prefix, and assistant-tail matches. */
    private resolveHistory;
    private found;
    private findLegacy;
    private load;
    private save;
}
//# sourceMappingURL=sessionStore.d.ts.map