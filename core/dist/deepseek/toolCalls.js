/** Parses the text protocol used to emulate OpenAI function calling. */
import { createHash } from "node:crypto";
import { isRecord } from "../utils/json.js";
import { collectJsonObjects, looksLikeToolJson } from "./toolCallJson.js";
const TOOL_TAG = /<\s*(\/?)\s*(tool[_-]?call|_?call)\b([^>]*)>/gi;
function stableValue(value) {
    if (Array.isArray(value))
        return value.map(stableValue);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]));
}
export function stableJson(value, pretty = false) {
    return JSON.stringify(stableValue(value), null, pretty ? 2 : undefined) ?? "";
}
function argumentObject(value) {
    if (isRecord(value)) {
        if (isRecord(value.arguments) && Object.keys(value).length === 1) {
            return argumentObject(value.arguments);
        }
        return value;
    }
    if (typeof value !== "string")
        return value === undefined ? {} : null;
    try {
        return argumentObject(JSON.parse(value));
    }
    catch {
        return null;
    }
}
function callPayload(value, attributeName = "") {
    if (!isRecord(value))
        return null;
    const nested = isRecord(value.function) ? value.function : value;
    const name = (typeof nested.name === "string" ? nested.name.trim() : "") ||
        (typeof value.name === "string" ? value.name.trim() : "") ||
        attributeName.trim();
    let argumentsValue = argumentObject(nested.arguments);
    if (!argumentsValue) {
        const rest = Object.fromEntries(Object.entries(nested).filter(([key]) => key !== "name" && key !== "function"));
        argumentsValue = Object.keys(rest).length > 0 ? argumentObject(rest) : null;
    }
    return name && argumentsValue ? { name, arguments: argumentsValue } : null;
}
function callId(seed, index, payload) {
    const digest = createHash("sha256").update(`${seed}:${index}:${payload}`).digest("hex").slice(0, 24);
    return `call_${digest}`;
}
export function formatToolCall(name, argumentsValue) {
    const argumentsObject = argumentObject(argumentsValue);
    if (!name.trim() || !argumentsObject)
        return null;
    return `<tool_call>\n${stableJson({ name: name.trim(), arguments: argumentsObject })}\n</tool_call>`;
}
function attributeName(attributes) {
    return attributes.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";
}
function tagBlocks(text) {
    TOOL_TAG.lastIndex = 0;
    const tags = [...text.matchAll(TOOL_TAG)].map((match) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        closing: Boolean(match[1]),
        attributes: match[3] ?? "",
    }));
    const blocks = [];
    for (let index = 0; index < tags.length; index += 1) {
        const open = tags[index];
        if (!open || open.closing)
            continue;
        const next = tags[index + 1];
        if (next && !next.closing)
            continue;
        blocks.push({
            start: open.start,
            end: next?.end ?? text.length,
            bodyStart: open.end,
            bodyEnd: next?.start ?? text.length,
            attributes: open.attributes,
        });
        if (next)
            index += 1;
    }
    return blocks;
}
function overlaps(range, blocked) {
    return blocked.some((item) => range.start < item.end && range.end > item.start);
}
function removeRanges(text, ranges) {
    const sorted = [...ranges]
        .filter((range) => range.end > range.start)
        .sort((left, right) => left.start - right.start || right.end - left.end);
    let content = "";
    let cursor = 0;
    for (const range of sorted) {
        if (range.end <= cursor)
            continue;
        content += text.slice(cursor, Math.max(cursor, range.start));
        cursor = range.end;
    }
    return content + text.slice(cursor);
}
function withoutToolTags(text) {
    TOOL_TAG.lastIndex = 0;
    return text.replace(TOOL_TAG, "");
}
function protocolOnly(text, ranges) {
    return withoutToolTags(removeRanges(text, ranges)).trim().length === 0;
}
function pushUnique(toolCalls, seed, payload, seen) {
    const argumentsText = stableJson(payload.arguments);
    const key = `${payload.name}\0${argumentsText}`;
    if (seen.has(key))
        return;
    seen.add(key);
    toolCalls.push({
        id: callId(seed, toolCalls.length, `${payload.name}:${argumentsText}`),
        type: "function",
        function: { name: payload.name, arguments: argumentsText },
    });
}
function taggedCandidates(text, blocks) {
    const calls = [];
    const artifacts = [];
    for (const block of blocks) {
        const body = text.slice(block.bodyStart, block.bodyEnd);
        const name = attributeName(block.attributes);
        const objects = collectJsonObjects(body, Boolean(name));
        let valid = false;
        for (const object of objects) {
            const payload = callPayload(object.value, name);
            if (!payload)
                continue;
            valid = true;
            calls.push({ order: block.bodyStart + object.start, consume: block, payload });
        }
        if (!valid && (looksLikeToolJson(body) || (name && /"arguments"\s*:/.test(body)))) {
            artifacts.push(block);
        }
    }
    return { calls, artifacts };
}
/** Parse model tool-call text into OpenAI-compatible calls and cleaned content. */
export function parseToolCalls(text, seed = "tool") {
    const blocks = tagBlocks(text);
    const tagged = taggedCandidates(text, blocks);
    const bareObjects = collectJsonObjects(text).filter((object) => !overlaps({ start: object.start, end: object.end }, blocks));
    const bareRanges = bareObjects
        .filter((object) => looksLikeToolJson(object.raw))
        .map((object) => ({ start: object.start, end: object.end }));
    const bareContext = protocolOnly(text, [...blocks, ...bareRanges]);
    const bareCalls = bareContext
        ? bareObjects.flatMap((object) => {
            const payload = callPayload(object.value);
            return payload
                ? [{ order: object.start, consume: { start: object.start, end: object.end }, payload }]
                : [];
        })
        : [];
    const candidates = [...tagged.calls, ...bareCalls].sort((left, right) => left.order - right.order);
    const toolCalls = [];
    const seen = new Set();
    for (const candidate of candidates)
        pushUnique(toolCalls, seed, candidate.payload, seen);
    const artifactRanges = [...tagged.artifacts, ...bareRanges];
    const isProtocolOnly = artifactRanges.length > 0 && protocolOnly(text, [...blocks, ...bareRanges]);
    if (toolCalls.length === 0 && !isProtocolOnly)
        return { content: text, toolCalls };
    const consumed = candidates.map((candidate) => candidate.consume);
    const cleaned = withoutToolTags(removeRanges(text, [
        ...consumed,
        ...(toolCalls.length > 0 ? blocks : []),
        ...(bareContext || isProtocolOnly ? artifactRanges : []),
    ]))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { content: cleaned, toolCalls };
}
/** Prefer valid output calls, then promote calls leaked into reasoning. */
export function parseToolCallsFromParts(outputText, reasoningText, seed = "tool") {
    const fromOutput = parseToolCalls(outputText, seed);
    if (fromOutput.toolCalls.length > 0)
        return fromOutput;
    const fromReasoning = parseToolCalls(reasoningText, seed);
    if (fromReasoning.toolCalls.length > 0) {
        return { content: fromOutput.content, toolCalls: fromReasoning.toolCalls };
    }
    return outputText.trim() ? fromOutput : fromReasoning;
}
export function canonicalParsedAssistantText(parsed) {
    const calls = parsed.toolCalls
        .map((call) => formatToolCall(call.function.name, call.function.arguments))
        .filter((call) => call !== null);
    return [parsed.content, ...calls].filter(Boolean).join("\n");
}
/** Store a canonical assistant turn so structured client history can match it later. */
export function canonicalAssistantText(text) {
    const parsed = parseToolCalls(text);
    return parsed.toolCalls.length > 0 ? canonicalParsedAssistantText(parsed) : parsed.content;
}
//# sourceMappingURL=toolCalls.js.map