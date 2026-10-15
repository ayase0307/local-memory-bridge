/** Creates the Node HTTP server and centralizes asynchronous route error handling. */
import http, {} from "node:http";
import { handleRouteError, routeRequest } from "./routes.js";
/** Build an unbound server so tests and the CLI can choose the listen address. */
export function createServer(dependencies) {
    return http.createServer((request, response) => {
        void routeRequest(request, response, dependencies).catch((error) => {
            handleRouteError(response, error, dependencies.debug);
        });
    });
}
//# sourceMappingURL=createServer.js.map