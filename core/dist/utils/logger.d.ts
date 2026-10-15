/** Minimal structured logger used to avoid an additional runtime dependency. */
export interface Logger {
    debug(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
}
/** Create a logger whose debug output is explicitly opt-in. */
export declare function createLogger(debugEnabled?: boolean): Logger;
//# sourceMappingURL=logger.d.ts.map