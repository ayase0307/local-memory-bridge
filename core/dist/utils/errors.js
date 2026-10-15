/** Error helpers keep transport status separate from internal failure details. */
export class HttpError extends Error {
    status;
    code;
    constructor(status, message, code) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        if (code !== undefined)
            this.code = code;
    }
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function errorStatus(error) {
    return error instanceof HttpError ? error.status : 500;
}
//# sourceMappingURL=errors.js.map