import { ResponseEventWriter } from "./responseEvents.js";
import { canonicalParsedAssistantText, parseToolCalls } from "./toolCalls.js";
import { EMPTY_TOOL_RESPONSE_TEXT, resolveToolTurn } from "./toolOutcome.js";
import { iterDeepSeekUpdates } from "./updates.js";
function responseBase(id, publicModel, sessionId, createdAt) {
    return {
        id,
        object: "response",
        created_at: createdAt,
        status: "in_progress",
        model: publicModel,
        output: [],
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        metadata: { chat_session_id: sessionId, source: "chat.deepseek.com" },
    };
}
/** Consume one upstream stream while building both live events and the final response. */
export async function consumeResponses(input) {
    const id = `resp_${input.sessionId}`;
    const writer = new ResponseEventWriter(input.emit, `${id}_reasoning`, `${id}_message`);
    const createdAt = Math.floor(Date.now() / 1000);
    writer.start(responseBase(id, input.publicModel, input.sessionId, createdAt));
    let reasoning = "";
    let outputText = "";
    let title = null;
    let tokens = 0;
    let requestMessageId = null;
    let responseMessageId = null;
    for await (const update of iterDeepSeekUpdates(input.upstream)) {
        if (update.type === "ready") {
            requestMessageId = update.requestMessageId ?? requestMessageId;
            responseMessageId = update.responseMessageId ?? responseMessageId;
        }
        else if (update.type === "title")
            title = update.title;
        else if (update.type === "tokens")
            tokens = update.value;
        else if (update.type === "reasoning" && update.delta) {
            reasoning += update.delta;
            if (!input.toolCompatibilityEnabled && writer.messageOpened && writer.reasoningOpened) {
                writer.emitReasoningDelta(update.delta);
            }
        }
        else if (update.type === "output" && update.delta) {
            outputText += update.delta;
            if (!input.toolCompatibilityEnabled) {
                if (!writer.messageOpened && reasoning)
                    writer.emitReasoningDelta(reasoning);
                writer.emitOutputDelta(update.delta);
            }
        }
    }
    const toolOutcome = input.toolCompatibilityEnabled
        ? resolveToolTurn(outputText, reasoning, id, input.emptyToolResponseText ?? EMPTY_TOOL_RESPONSE_TEXT)
        : null;
    const parsed = toolOutcome?.parsed ?? { content: outputText, toolCalls: [] };
    const hasToolCalls = parsed.toolCalls.length > 0;
    const hasResponseText = outputText.trim().length > 0;
    const visibleText = input.toolCompatibilityEnabled
        ? parsed.content
        : hasResponseText
            ? outputText
            : reasoning;
    const reasoningVisible = hasToolCalls
        ? input.toolReasoning === "clean"
            ? parseToolCalls(reasoning).content
            : ""
        : input.toolCompatibilityEnabled
            ? toolOutcome?.promotedReasoning
                ? ""
                : hasResponseText
                    ? reasoning
                    : ""
            : hasResponseText
                ? reasoning
                : "";
    const shouldIncludeMessage = !hasToolCalls || visibleText.length > 0;
    if (reasoningVisible && !writer.reasoningOpened)
        writer.emitReasoningDelta(reasoningVisible);
    if (shouldIncludeMessage && !writer.messageOpened && visibleText)
        writer.emitOutputDelta(visibleText);
    if (shouldIncludeMessage && !writer.messageOpened)
        writer.emitOutputDelta("");
    const output = [];
    writer.finishReasoning(reasoningVisible, output);
    writer.finishMessage(visibleText, output);
    for (const call of parsed.toolCalls) {
        const item = {
            type: "function_call",
            id: `fc_${call.id.slice(5)}`,
            call_id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
            status: "completed",
        };
        const outputIndex = output.length;
        output.push(item);
        writer.emitFunctionCall(item, outputIndex);
    }
    const final = {
        id,
        object: "response",
        created_at: createdAt,
        status: "completed",
        model: input.publicModel,
        output,
        output_text: visibleText,
        ...(title ? { title } : {}),
        usage: { input_tokens: 0, output_tokens: tokens, total_tokens: tokens },
        metadata: {
            chat_session_id: input.sessionId,
            source: "chat.deepseek.com",
            title,
            thinking_enabled: input.thinkingEnabled,
            search_enabled: input.searchEnabled,
            model_type: input.modelType,
            request_message_id: requestMessageId,
            response_message_id: responseMessageId,
            thinking_levels_supported: false,
            tool_compatibility: input.toolCompatibilityEnabled,
            ...(input.modelType === "expert"
                ? { search_note: "expert mode does not support search on web" }
                : {}),
        },
    };
    writer.emit("response.completed", { type: "response.completed", response: final });
    const rawForSession = hasToolCalls ? canonicalParsedAssistantText(parsed) : visibleText;
    return {
        response: final,
        requestMessageId,
        responseMessageId,
        rawOutputText: rawForSession,
        diagnostics: {
            reasoningChars: reasoning.length,
            outputChars: outputText.length,
            toolCallCount: parsed.toolCalls.length,
            emptyUpstream: toolOutcome?.emptyUpstream ?? (!reasoning.trim() && !outputText.trim()),
            recoverableEmpty: toolOutcome?.recoverableEmpty ?? false,
            promotedReasoning: toolOutcome?.promotedReasoning ?? false,
        },
    };
}
//# sourceMappingURL=mapResponses.js.map