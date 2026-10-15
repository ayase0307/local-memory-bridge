/** Repairs and locates JSON objects emitted by the text tool protocol. */
const TOOL_FIRST_KEY = /^\{\s*"(?:name|arguments|function)"\s*:/;
const MAX_MISSING_CLOSERS = 8;
function parseObject(text) {
    try {
        const value = JSON.parse(text);
        return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
function scanClosers(text) {
    const closers = [];
    let inString = false;
    let escape = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escape)
                escape = false;
            else if (char === "\\")
                escape = true;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"')
            inString = true;
        else if (char === "{")
            closers.push("}");
        else if (char === "[")
            closers.push("]");
        else if (char === "}" || char === "]") {
            if (closers.at(-1) !== char)
                return { end: null, missing: null };
            closers.pop();
            if (closers.length === 0)
                return { end: index + 1, missing: [] };
        }
    }
    if (inString || escape)
        return { end: null, missing: null };
    return { end: null, missing: closers.reverse() };
}
function withoutTrailingCommas(text) {
    return text.replace(/,\s*([}\]])/g, "$1").replace(/,\s*$/, "");
}
/** Repair only structurally truncated objects; never guess unfinished string contents. */
export function repairJson(raw) {
    const text = raw.trim();
    if (!text.startsWith("{"))
        return null;
    const direct = parseObject(text);
    if (direct)
        return direct;
    const scan = scanClosers(text);
    if (scan.end !== null)
        return parseObject(withoutTrailingCommas(text.slice(0, scan.end)));
    if (!scan.missing || scan.missing.length === 0 || scan.missing.length > MAX_MISSING_CLOSERS) {
        return null;
    }
    return parseObject(withoutTrailingCommas(text) + scan.missing.join(""));
}
function isStandaloneStart(text, index) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    return text.slice(lineStart, index).trim().length === 0;
}
function candidateStarts(text, allowAnyFirstObject) {
    const starts = [];
    const firstObject = text.indexOf("{");
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] !== "{" || !isStandaloneStart(text, index))
            continue;
        if (TOOL_FIRST_KEY.test(text.slice(index)) || (allowAnyFirstObject && index === firstObject)) {
            starts.push(index);
        }
    }
    return starts;
}
/** Locate complete or repairable standalone tool-shaped JSON objects in one text segment. */
export function collectJsonObjects(text, allowAnyFirstObject = false) {
    const starts = candidateStarts(text, allowAnyFirstObject);
    const candidates = [];
    let coveredUntil = 0;
    for (let position = 0; position < starts.length; position += 1) {
        const start = starts[position] ?? 0;
        if (start < coveredUntil)
            continue;
        const remainder = text.slice(start);
        const completeEnd = scanClosers(remainder).end;
        const boundary = completeEnd !== null ? start + completeEnd : starts[position + 1] ?? text.length;
        const raw = text.slice(start, boundary).trimEnd();
        const end = start + raw.length;
        const value = repairJson(raw);
        candidates.push({ start, end, raw, value });
        if (completeEnd !== null)
            coveredUntil = start + completeEnd;
    }
    return candidates;
}
export function looksLikeToolJson(text) {
    return /"name"\s*:/.test(text) && /"arguments"\s*:/.test(text);
}
//# sourceMappingURL=toolCallJson.js.map