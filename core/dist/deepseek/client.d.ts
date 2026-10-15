/** Orchestrates login state, session reuse, PoW, upstream streaming, and persistence. */
import type { LoginManager } from "../browser/login.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../utils/logger.js";
import { type ChatStreamChunk } from "./chatStream.js";
import { type MappedResponseResult, type ResponseEmitter } from "./mapResponses.js";
import type { SessionStore } from "./sessionStore.js";
import type { RequestBody } from "./types.js";
export type { ChatStreamChunk } from "./chatStream.js";
export declare class DeepSeekClient {
    private readonly config;
    private readonly login;
    private readonly sessions;
    private readonly logger;
    constructor(config: AppConfig, login: LoginManager, sessions: SessionStore, logger: Logger);
    initialize(): Promise<void>;
    completeResponses(body: RequestBody, emit?: ResponseEmitter): Promise<MappedResponseResult>;
    streamChat(body: RequestBody, emit: (chunk: ChatStreamChunk) => void): Promise<void>;
    private withToolRecovery;
    /** Resolve trusted request options and preserve the last good parent across an empty retry. */
    private prepare;
    private responseInput;
    private setResponseMetadata;
    private logAttempt;
    private logFields;
    private remember;
}
//# sourceMappingURL=client.d.ts.map