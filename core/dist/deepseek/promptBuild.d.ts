import type { MessageTurn, RequestBody } from "./types.js";
interface PreviousPromptState {
    turns?: readonly MessageTurn[];
    instructionFingerprint?: string;
    toolsFingerprint?: string;
}
export interface PromptBuildOptions {
    reusedSession: boolean;
    previous?: PreviousPromptState;
}
export interface BuiltPrompt {
    prompt: string;
    requestTurns: MessageTurn[];
    latestUserText: string;
    instructionFingerprint: string;
    toolsFingerprint: string;
    hasTools: boolean;
}
export declare function requestConversationTurns(body: RequestBody): MessageTurn[];
/** Retry an empty tool turn in a fresh session with only essential continuation context. */
export declare function buildToolRecoveryPrompt(body: RequestBody, requestTurns: MessageTurn[], latestUserText: string): string;
export declare function buildDeepSeekPrompt(body: RequestBody, options: PromptBuildOptions): BuiltPrompt;
export {};
//# sourceMappingURL=promptBuild.d.ts.map