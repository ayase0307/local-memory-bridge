/** Small boundary guards for data received from JSON and browser evaluation. */
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function asString(value) {
    return typeof value === "string" ? value : undefined;
}
export function asBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
//# sourceMappingURL=json.js.map