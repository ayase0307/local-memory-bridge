/** Maps public model and feature options to DeepSeek Web boolean capabilities. */
import type { ModelResolution, ModelType, RequestBody } from "./types.js";
export declare function resolveModel(body: RequestBody): ModelResolution;
/** DeepSeek Web exposes only an on/off switch, not distinct reasoning levels. */
export declare function resolveThinking(body: RequestBody): boolean;
/** Expert mode cannot search on the Web client, so the trusted server forces it off. */
export declare function resolveSearch(body: RequestBody, modelType: ModelType): boolean;
//# sourceMappingURL=models.d.ts.map