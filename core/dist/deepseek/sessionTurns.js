/** Matches normalized conversation windows across full and truncated client histories. */
import { normalizeText } from "../utils/text.js";
export function fingerprint(turns) {
    return turns.map((turn) => `${turn.role}:${turn.content}`).join("\n---\n");
}
export function fpKey(value) {
    return `fp:${value}`;
}
export function turnsEqual(left, right) {
    if (left.length === 0 || left.length !== right.length)
        return false;
    return left.every((turn, index) => turn.role === right[index]?.role && normalizeText(turn.content) === normalizeText(right[index]?.content));
}
export function turnsPrefix(left, right) {
    if (left.length === 0 || right.length === 0)
        return false;
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        if (left[index]?.role !== right[index]?.role)
            return false;
        if (normalizeText(left[index]?.content) !== normalizeText(right[index]?.content))
            return false;
    }
    return true;
}
export function turnsSuffix(shorter, longer) {
    if (shorter.length === 0 || shorter.length > longer.length)
        return false;
    const offset = longer.length - shorter.length;
    return shorter.every((turn, index) => {
        const candidate = longer[offset + index];
        return turn.role === candidate?.role && normalizeText(turn.content) === normalizeText(candidate.content);
    });
}
//# sourceMappingURL=sessionTurns.js.map