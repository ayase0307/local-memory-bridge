/** Error helpers keep transport status separate from internal failure details. */
export declare class HttpError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(status: number, message: string, code?: string);
}
export declare function errorMessage(error: unknown): string;
export declare function errorStatus(error: unknown): number;
//# sourceMappingURL=errors.d.ts.map