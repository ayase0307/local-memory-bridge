/** Creates the Node HTTP server and centralizes asynchronous route error handling. */
import { type Server } from "node:http";
import type { ServerDependencies } from "./types.js";
/** Build an unbound server so tests and the CLI can choose the listen address. */
export declare function createServer(dependencies: ServerDependencies): Server;
//# sourceMappingURL=createServer.d.ts.map