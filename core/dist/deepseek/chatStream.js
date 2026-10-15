import { canonicalParsedAssistantText, parseToolCalls } from "./toolCalls.js";
import { resolveToolTurn } from "./toolOutcome.js";
import { iterDeepSeekUpdates } from "./updates.js";
function chatChunk(run, created, delta, finishReason) {
    return {
        id: `chatcmpl_${run.sessionId}`,
        object: "chat.completion.chunk",
        created,
        model: run.publicModel,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
}
function finalChunk(run, created, finishReason) {
    return {
        ...chatChunk(run, created, {}, finishReason),
        conversation: run.sessionId,
        previous_response_id: `resp_${run.sessionId}`,
    };
}
export async function streamPlainChat(run, emit) {
    const created = Math.floor(Date.now() / 1000);
    let responseText = "";
    let reasoningText = "";
    let responseMessageId = null;
    let roleSent = false;
    let reasoningSent = false;
    const writeDelta = (delta) => {
        const withRole = roleSent ? delta : { role: "assistant", ...delta };
        roleSent = true;
        emit(chatChunk(run, created, withRole, null));
    };
    for await (const update of iterDeepSeekUpdates(run.upstream)) {
        if (update.type === "ready") {
            responseMessageId = update.responseMessageId ?? responseMessageId;
        }
        else if (update.type === "reasoning" && update.delta) {
            reasoningText += update.delta;
            if (responseText && reasoningSent)
                writeDelta({ reasoning_content: update.delta });
        }
        else if (update.type === "output" && update.delta) {
            responseText += update.delta;
            if (!reasoningSent && reasoningText) {
                writeDelta({ reasoning_content: reasoningText });
                reasoningSent = true;
            }
            writeDelta({ content: update.delta });
        }
    }
    const finalText = responseText.trim() ? responseText : reasoningText;
    if (!responseText.trim() && reasoningText)
        writeDelta({ content: reasoningText });
    emit(finalChunk(run, created, "stop"));
    return {
        responseMessageId,
        finalText,
        diagnostics: {
            reasoningChars: reasoningText.length,
            outputChars: responseText.length,
            toolCallCount: 0,
            emptyUpstream: !reasoningText.trim() && !responseText.trim(),
            recoverableEmpty: false,
            promotedReasoning: !responseText.trim() && Boolean(reasoningText.trim()),
        },
    };
}
export async function consumeToolChat(run, emptyFallback) {
    let responseText = "";
    let reasoningText = "";
    let responseMessageId = null;
    for await (const update of iterDeepSeekUpdates(run.upstream)) {
        if (update.type === "ready") {
            responseMessageId = update.responseMessageId ?? responseMessageId;
        }
        else if (update.type === "reasoning" && update.delta)
            reasoningText += update.delta;
        else if (update.type === "output" && update.delta)
            responseText += update.delta;
    }
    return {
        outcome: resolveToolTurn(responseText, reasoningText, `chatcmpl_${run.sessionId}`, emptyFallback),
        responseMessageId,
    };
}
export function toolDiagnostics(outcome) {
    return {
        reasoningChars: outcome.reasoningText.length,
        outputChars: outcome.outputText.length,
        toolCallCount: outcome.parsed.toolCalls.length,
        emptyUpstream: outcome.emptyUpstream,
        recoverableEmpty: outcome.recoverableEmpty,
        promotedReasoning: outcome.promotedReasoning,
    };
}
/** Emit one buffered tool-compatible result after retry selection. */
export function emitToolChat(run, result, toolReasoning, emit) {
    const created = Math.floor(Date.now() / 1000);
    const parsed = result.outcome.parsed;
    let roleSent = false;
    const writeDelta = (delta) => {
        const withRole = roleSent ? delta : { role: "assistant", ...delta };
        roleSent = true;
        emit(chatChunk(run, created, withRole, null));
    };
    const finishReason = parsed.toolCalls.length > 0 ? "tool_calls" : "stop";
    if (parsed.toolCalls.length > 0) {
        if (toolReasoning === "clean") {
            const cleanedReason = parseToolCalls(result.outcome.reasoningText).content;
            if (cleanedReason)
                writeDelta({ reasoning_content: cleanedReason });
        }
        if (parsed.content)
            writeDelta({ content: parsed.content });
        writeDelta({ tool_calls: parsed.toolCalls.map((call, index) => ({ index, ...call })) });
    }
    else {
        if (result.outcome.reasoningText && result.outcome.outputText.trim()) {
            writeDelta({ reasoning_content: result.outcome.reasoningText });
        }
        writeDelta({ content: parsed.content });
    }
    emit(finalChunk(run, created, finishReason));
    return parsed.toolCalls.length > 0 ? canonicalParsedAssistantText(parsed) : parsed.content;
}
//# sourceMappingURL=chatStream.js.map