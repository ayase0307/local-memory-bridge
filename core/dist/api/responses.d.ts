/** HTTP adapter for OpenAI Responses, including named SSE event framing. */
import type { ServerResponse } from "node:http";
import type { DeepSeekClient } from "../deepseek/client.js";
import type { RequestBody } from "../deepseek/types.js";
export declare function responsesErrorEvent(error: unknown): Record<string, unknown>;
/** Stream when requested; otherwise return the fully accumulated response object. */
export declare function handleResponses(response: ServerResponse, body: RequestBody, client: DeepSeekClient): Promise<void>;
//# sourceMappingURL=responses.d.ts.map