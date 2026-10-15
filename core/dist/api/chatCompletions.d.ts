/** HTTP adapter for OpenAI Chat Completions stream and object formats. */
import type { ServerResponse } from "node:http";
import type { DeepSeekClient } from "../deepseek/client.js";
import type { OpenAIResponse } from "../deepseek/mapResponses.js";
import type { RequestBody } from "../deepseek/types.js";
export declare function responseChatChoice(result: OpenAIResponse): {
    index: number;
    message: {
        tool_calls?: Record<string, unknown>[];
        reasoning_content?: string;
        role: string;
        content: string | null;
    };
    finish_reason: string;
};
/** Preserve reasoning_content as a separate field in both response modes. */
export declare function handleChatCompletions(response: ServerResponse, body: RequestBody, client: DeepSeekClient): Promise<void>;
//# sourceMappingURL=chatCompletions.d.ts.map