export type ToolReasoningMode = "hidden" | "clean";
export interface AppConfig {
    port: number;
    host: string;
    cdpEndpoint: string;
    dataDir: string;
    authFile: string;
    apiKeyFile: string;
    sessionsFile: string;
    chromeProfileDir: string;
    chromePath?: string;
    powWorkerUrl: string;
    baseUrl: string;
    debug: boolean;
    toolReasoning: ToolReasoningMode;
    /** Show Chrome UI. Default false (headless). Login always opens a visible window when needed. */
    showBrowser: boolean;
}
/** Load KEY=VALUE lines from .env without overriding existing process.env. */
export declare function loadDotEnv(cwd?: string): void;
/** Build a validated configuration; loads .env once if present. */
export declare function loadConfig(cwd?: string): AppConfig;
//# sourceMappingURL=env.d.ts.map