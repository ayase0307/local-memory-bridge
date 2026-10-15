/** Emits ordered OpenAI Responses SSE events while tracking opened output items. */
export type ResponseEmitter = (event: string, data: Record<string, unknown>) => void;
export declare class ResponseEventWriter {
    private readonly emitEvent;
    private readonly reasoningId;
    private readonly messageId;
    reasoningOpened: boolean;
    messageOpened: boolean;
    private sequence;
    constructor(emitEvent: ResponseEmitter | undefined, reasoningId: string, messageId: string);
    emit(event: string, data: Record<string, unknown>): void;
    start(response: unknown): void;
    emitReasoningDelta(delta: string): void;
    emitOutputDelta(delta: string): void;
    finishReasoning(text: string, output: Array<Record<string, unknown>>): void;
    finishMessage(text: string, output: Array<Record<string, unknown>>): void;
    emitFunctionCall(item: Record<string, unknown>, outputIndex: number): void;
    private ensureReasoning;
    private ensureMessage;
}
//# sourceMappingURL=responseEvents.d.ts.map