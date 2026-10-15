/** HTTP primitives shared by the dependency-free Node server. */
import type { IncomingMessage, ServerResponse } from "node:http";
export declare function writeJson(response: ServerResponse, status: number, body: unknown): void;
export declare function writeSseHeaders(response: ServerResponse): void;
export declare function writeSse(response: ServerResponse, event: string, data: unknown): void;
/** Read a bounded JSON object so malformed or oversized bodies fail predictably. */
export declare function readJsonBody(request: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
export declare function writeCorsPreflight(response: ServerResponse): void;
//# sourceMappingURL=http.d.ts.map