export class ResponseEventWriter {
    emitEvent;
    reasoningId;
    messageId;
    reasoningOpened = false;
    messageOpened = false;
    sequence = 0;
    constructor(emitEvent, reasoningId, messageId) {
        this.emitEvent = emitEvent;
        this.reasoningId = reasoningId;
        this.messageId = messageId;
    }
    emit(event, data) {
        this.emitEvent?.(event, { ...data, sequence_number: this.sequence++ });
    }
    start(response) {
        this.emit("response.created", { type: "response.created", response });
        this.emit("response.in_progress", { type: "response.in_progress", response });
    }
    emitReasoningDelta(delta) {
        this.ensureReasoning();
        this.emit("response.reasoning_text.delta", {
            type: "response.reasoning_text.delta",
            item_id: this.reasoningId,
            output_index: 0,
            content_index: 0,
            delta,
        });
    }
    emitOutputDelta(delta) {
        this.ensureMessage();
        this.emit("response.output_text.delta", {
            type: "response.output_text.delta",
            item_id: this.messageId,
            output_index: this.reasoningOpened ? 1 : 0,
            content_index: 0,
            delta,
        });
    }
    finishReasoning(text, output) {
        if (!this.reasoningOpened)
            return;
        this.emit("response.reasoning_text.done", {
            type: "response.reasoning_text.done",
            item_id: this.reasoningId,
            output_index: 0,
            content_index: 0,
            text,
        });
        const item = {
            type: "reasoning",
            id: this.reasoningId,
            summary: [{ type: "summary_text", text }],
            content: [{ type: "reasoning_text", text }],
        };
        output.push(item);
        this.emit("response.output_item.done", {
            type: "response.output_item.done",
            output_index: 0,
            item,
        });
    }
    finishMessage(text, output) {
        if (!this.messageOpened)
            return;
        const outputIndex = output.length;
        this.emit("response.output_text.done", {
            type: "response.output_text.done",
            item_id: this.messageId,
            output_index: outputIndex,
            content_index: 0,
            text,
        });
        this.emit("response.content_part.done", {
            type: "response.content_part.done",
            item_id: this.messageId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: "output_text", text },
        });
        const item = {
            type: "message",
            id: this.messageId,
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text }],
        };
        output.push(item);
        this.emit("response.output_item.done", {
            type: "response.output_item.done",
            output_index: outputIndex,
            item,
        });
    }
    emitFunctionCall(item, outputIndex) {
        this.emit("response.output_item.added", {
            type: "response.output_item.added",
            output_index: outputIndex,
            item: { ...item, arguments: "", status: "in_progress" },
        });
        this.emit("response.function_call_arguments.delta", {
            type: "response.function_call_arguments.delta",
            item_id: item.id,
            output_index: outputIndex,
            delta: item.arguments,
        });
        this.emit("response.function_call_arguments.done", {
            type: "response.function_call_arguments.done",
            item_id: item.id,
            output_index: outputIndex,
            arguments: item.arguments,
        });
        this.emit("response.output_item.done", {
            type: "response.output_item.done",
            output_index: outputIndex,
            item,
        });
    }
    ensureReasoning() {
        if (this.reasoningOpened)
            return;
        this.reasoningOpened = true;
        this.emit("response.output_item.added", {
            type: "response.output_item.added",
            output_index: 0,
            item: { type: "reasoning", id: this.reasoningId, summary: [], content: [] },
        });
        this.emit("response.content_part.added", {
            type: "response.content_part.added",
            item_id: this.reasoningId,
            output_index: 0,
            content_index: 0,
            part: { type: "reasoning_text", text: "" },
        });
    }
    ensureMessage() {
        if (this.messageOpened)
            return;
        this.messageOpened = true;
        const outputIndex = this.reasoningOpened ? 1 : 0;
        this.emit("response.output_item.added", {
            type: "response.output_item.added",
            output_index: outputIndex,
            item: { type: "message", id: this.messageId, role: "assistant", status: "in_progress", content: [] },
        });
        this.emit("response.content_part.added", {
            type: "response.content_part.added",
            item_id: this.messageId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: "output_text", text: "" },
        });
    }
}
//# sourceMappingURL=responseEvents.js.map