import type { MessageTurn } from "./types.js";
export declare function fingerprint(turns: MessageTurn[]): string;
export declare function fpKey(value: string): string;
export declare function turnsEqual(left: MessageTurn[], right: MessageTurn[]): boolean;
export declare function turnsPrefix(left: MessageTurn[], right: MessageTurn[]): boolean;
export declare function turnsSuffix(shorter: MessageTurn[], longer: MessageTurn[]): boolean;
//# sourceMappingURL=sessionTurns.d.ts.map