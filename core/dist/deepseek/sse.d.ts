import type { DeepSeekSseEvent } from "./types.js";
/** Stateful parser because network chunks may split an SSE block at any byte. */
export declare class SseParser {
    private buffer;
    push(chunk: string): DeepSeekSseEvent[];
    /** Flush a valid final block even when the upstream omits the trailing blank line. */
    finish(): DeepSeekSseEvent[];
}
/** Convert a Fetch Response body into validated DeepSeek SSE events. */
export declare function iterDeepSeekSse(response: Response): AsyncGenerator<DeepSeekSseEvent>;
//# sourceMappingURL=sse.d.ts.map