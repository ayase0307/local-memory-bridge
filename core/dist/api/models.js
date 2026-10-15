import { writeJson } from "../utils/http.js";
export function handleModels(response) {
    writeJson(response, 200, {
        object: "list",
        data: [
            { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek-web" },
            { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek-web" },
        ],
    });
}
//# sourceMappingURL=models.js.map