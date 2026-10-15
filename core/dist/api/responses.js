import { errorMessage, errorStatus } from "../utils/errors.js";
import { writeJson, writeSse, writeSseHeaders } from "../utils/http.js";
export function responsesErrorEvent(error) {
    return {
        type: "error",
        code: "deepseek_web_error",
        message: errorMessage(error),
        param: null,
    };
}
/** Stream when requested; otherwise return the fully accumulated response object. */
export async function handleResponses(response, body, client) {
    if (body.stream === true) {
        writeSseHeaders(response);
        try {
            await client.completeResponses(body, (event, data) => writeSse(response, event, data));
            response.write("data: [DONE]\n\n");
            response.end();
        }
        catch (error) {
            writeSse(response, "error", responsesErrorEvent(error));
            response.end();
        }
        return;
    }
    try {
        const result = await client.completeResponses(body);
        writeJson(response, 200, result.response);
    }
    catch (error) {
        writeJson(response, errorStatus(error), { error: { message: errorMessage(error) } });
    }
}
//# sourceMappingURL=responses.js.map