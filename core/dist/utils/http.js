import { HttpError } from "./errors.js";
import { isRecord } from "./json.js";
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
};
export function writeJson(response, status, body) {
    response.writeHead(status, {
        ...CORS_HEADERS,
        "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(body));
}
export function writeSseHeaders(response) {
    response.writeHead(200, {
        ...CORS_HEADERS,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
    });
    response.flushHeaders();
}
export function writeSse(response, event, data) {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
}
/** Read a bounded JSON object so malformed or oversized bodies fail predictably. */
export async function readJsonBody(request, maxBytes = 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes)
            throw new HttpError(413, "request body too large");
        chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";
    try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
            throw new HttpError(400, "JSON body must be an object");
        }
        return parsed;
    }
    catch (error) {
        if (error instanceof HttpError)
            throw error;
        throw new HttpError(400, "invalid JSON body");
    }
}
export function writeCorsPreflight(response) {
    response.writeHead(204, {
        ...CORS_HEADERS,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization,x-api-key",
    });
    response.end();
}
//# sourceMappingURL=http.js.map