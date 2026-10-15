/** Repairs and locates JSON objects emitted by the text tool protocol. */
export interface JsonObjectCandidate {
    start: number;
    end: number;
    raw: string;
    value: unknown | null;
}
/** Repair only structurally truncated objects; never guess unfinished string contents. */
export declare function repairJson(raw: string): unknown | null;
/** Locate complete or repairable standalone tool-shaped JSON objects in one text segment. */
export declare function collectJsonObjects(text: string, allowAnyFirstObject?: boolean): JsonObjectCandidate[];
export declare function looksLikeToolJson(text: string): boolean;
//# sourceMappingURL=toolCallJson.d.ts.map