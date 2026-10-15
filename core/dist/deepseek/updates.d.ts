export type DeepSeekUpdate = {
    type: "ready";
    requestMessageId: string | number | null;
    responseMessageId: string | number | null;
} | {
    type: "title";
    title: string;
} | {
    type: "reasoning";
    delta: string;
} | {
    type: "output";
    delta: string;
} | {
    type: "tokens";
    value: number;
} | {
    type: "close";
};
/**
 * Track the active fragment type so content-only APPEND patches stay in the correct channel.
 * This is what prevents reasoning text from leaking into final output text.
 */
export declare function iterDeepSeekUpdates(response: Response): AsyncGenerator<DeepSeekUpdate>;
//# sourceMappingURL=updates.d.ts.map