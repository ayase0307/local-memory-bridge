/** Routes the small OpenAI-compatible HTTP surface without a framework dependency. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerDependencies } from "./types.js";
/** Apply CORS and authentication before dispatching exact method/path pairs. */
export declare function routeRequest(request: IncomingMessage, response: ServerResponse, dependencies: ServerDependencies): Promise<void>;
/** Avoid writing a second JSON header after a streaming response has started. */
export declare function handleRouteError(response: ServerResponse, error: unknown, debug: boolean): void;
//# sourceMappingURL=routes.d.ts.map