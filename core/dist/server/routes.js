import { handleChatCompletions } from "../api/chatCompletions.js";
import { handleModels } from "../api/models.js";
import { handleResponses } from "../api/responses.js";
import { errorMessage, errorStatus } from "../utils/errors.js";
import { readJsonBody, writeCorsPreflight, writeJson } from "../utils/http.js";
import { requireApiKey } from "./authMiddleware.js";
function pathname(request) {
    return new URL(request.url || "/", "http://localhost").pathname;
}
/** Apply CORS and authentication before dispatching exact method/path pairs. */
export async function routeRequest(request, response, dependencies) {
    if (request.method === "OPTIONS") {
        writeCorsPreflight(response);
        return;
    }
    const path = pathname(request);
    if (request.method === "GET" && path === "/health") {
        writeJson(response, 200, { ok: true });
        return;
    }
    if (path.startsWith("/v1/") && !requireApiKey(request, response, dependencies.apiKeys))
        return;
    if (request.method === "GET" && path === "/v1/models") {
        handleModels(response);
        return;
    }
    if (request.method === "POST" && path === "/v1/responses") {
        const body = await readJsonBody(request);
        await handleResponses(response, body, dependencies.client);
        return;
    }
    if (request.method === "POST" && path === "/v1/chat/completions") {
        const body = await readJsonBody(request);
        await handleChatCompletions(response, body, dependencies.client);
        return;
    }
    writeJson(response, 404, { error: { message: "not found" } });
}
/** Avoid writing a second JSON header after a streaming response has started. */
export function handleRouteError(response, error, debug) {
    if (response.headersSent) {
        response.end();
        return;
    }
    writeJson(response, errorStatus(error), {
        error: {
            message: errorMessage(error),
            ...(debug && error instanceof Error ? { stack: error.stack } : {}),
        },
    });
}
//# sourceMappingURL=routes.js.map