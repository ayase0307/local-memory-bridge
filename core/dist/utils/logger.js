function write(level, message, fields) {
    const suffix = fields ? ` ${JSON.stringify(fields)}` : "";
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
    if (level === "error")
        console.error(line);
    else if (level === "warn")
        console.warn(line);
    else
        console.log(line);
}
/** Create a logger whose debug output is explicitly opt-in. */
export function createLogger(debugEnabled = false) {
    return {
        debug: (message, fields) => {
            if (debugEnabled)
                write("debug", message, fields);
        },
        info: (message, fields) => write("info", message, fields),
        warn: (message, fields) => write("warn", message, fields),
        error: (message, fields) => write("error", message, fields),
    };
}
//# sourceMappingURL=logger.js.map