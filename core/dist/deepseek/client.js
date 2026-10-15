import { HttpError } from "../utils/errors.js";
import { consumeToolChat, emitToolChat, streamPlainChat, toolDiagnostics, } from "./chatStream.js";
import { openCompletionStream } from "./completion.js";
import { consumeResponses, } from "./mapResponses.js";
import { resolveModel, resolveSearch, resolveThinking } from "./models.js";
import { prepareCompletion } from "./pow.js";
import { buildDeepSeekPrompt, buildToolRecoveryPrompt } from "./promptBuild.js";
import { canonicalAssistantText } from "./toolCalls.js";
import { EMPTY_TOOL_RESPONSE_TEXT } from "./toolOutcome.js";
export class DeepSeekClient {
    config;
    login;
    sessions;
    logger;
    constructor(config, login, sessions, logger) {
        this.config = config;
        this.login = login;
        this.sessions = sessions;
        this.logger = logger;
    }
    async initialize() {
        await this.login.ensureLoggedIn();
    }
    async completeResponses(body, emit) {
        const initialRun = await this.prepare(body);
        if (!initialRun.hasTools) {
            const result = await consumeResponses({
                ...this.responseInput(initialRun),
                ...(emit ? { emit } : {}),
            });
            this.logAttempt(initialRun, result.diagnostics);
            this.remember(initialRun, result.responseMessageId, result.rawOutputText);
            this.setResponseMetadata(result, initialRun, 0);
            return result;
        }
        const completed = await this.withToolRecovery(body, initialRun, async (run, _retry, final) => {
            const events = [];
            const result = await consumeResponses({
                ...this.responseInput(run),
                emptyToolResponseText: final ? EMPTY_TOOL_RESPONSE_TEXT : "",
                emit: (event, data) => events.push({ event, data }),
            });
            return { value: { result, events }, diagnostics: result.diagnostics };
        });
        for (const event of completed.value.events)
            emit?.(event.event, event.data);
        if (!completed.diagnostics.recoverableEmpty) {
            this.remember(completed.run, completed.value.result.responseMessageId, completed.value.result.rawOutputText);
        }
        this.setResponseMetadata(completed.value.result, completed.run, completed.retry);
        return completed.value.result;
    }
    async streamChat(body, emit) {
        const initialRun = await this.prepare(body);
        if (!initialRun.hasTools) {
            const result = await streamPlainChat(initialRun, emit);
            this.logAttempt(initialRun, result.diagnostics);
            this.remember(initialRun, result.responseMessageId, result.finalText);
            return;
        }
        const completed = await this.withToolRecovery(body, initialRun, async (run, _retry, final) => {
            const value = await consumeToolChat(run, final ? EMPTY_TOOL_RESPONSE_TEXT : "");
            return { value, diagnostics: toolDiagnostics(value.outcome) };
        });
        const sessionText = emitToolChat(completed.run, completed.value, this.config.toolReasoning, emit);
        if (!completed.diagnostics.recoverableEmpty) {
            this.remember(completed.run, completed.value.responseMessageId, sessionText);
        }
    }
    async withToolRecovery(body, initialRun, execute) {
        const first = await execute(initialRun, 0, false);
        this.logAttempt(initialRun, first.diagnostics);
        if (!first.diagnostics.recoverableEmpty)
            return { ...first, run: initialRun, retry: 0 };
        this.logger.info("Retrying unusable DeepSeek tool response", this.logFields(initialRun, first.diagnostics));
        const retryRun = await this.prepare(body, initialRun);
        const second = await execute(retryRun, 1, true);
        this.logAttempt(retryRun, second.diagnostics);
        if (second.diagnostics.recoverableEmpty) {
            this.logger.warn("DeepSeek tool response remained unusable after retry", {
                ...this.logFields(retryRun, second.diagnostics),
                fallbackVisible: true,
            });
        }
        else {
            this.logger.info("DeepSeek tool response recovered", this.logFields(retryRun, second.diagnostics));
        }
        return { ...second, run: retryRun, retry: 1 };
    }
    /** Resolve trusted request options and preserve the last good parent across an empty retry. */
    async prepare(body, retryFrom) {
        const { modelType, publicModel } = resolveModel(body);
        const thinking = resolveThinking(body);
        const search = resolveSearch(body, modelType);
        const conversation = retryFrom ? null : this.sessions.resolve(body);
        const reusedSession = retryFrom
            ? false
            : Boolean(conversation?.sessionId && this.sessions.has(conversation.sessionId));
        const previous = !retryFrom && reusedSession && conversation?.sessionId
            ? this.sessions.get(conversation.sessionId)
            : undefined;
        const built = retryFrom
            ? null
            : buildDeepSeekPrompt(body, { reusedSession, ...(previous ? { previous } : {}) });
        const prompt = retryFrom
            ? buildToolRecoveryPrompt(body, retryFrom.requestTurns, retryFrom.latestUserText).trim()
            : built?.prompt.trim() ?? "";
        if (!prompt)
            throw new HttpError(400, "empty input");
        const auth = await this.login.dumpCurrent();
        const page = await this.login.page();
        const prepared = await prepareCompletion({
            page,
            powWorkerUrl: this.config.powWorkerUrl,
            modelType,
            fallbackToken: auth.token,
            sessionId: retryFrom ? null : reusedSession ? conversation?.sessionId ?? null : null,
            reuseSession: retryFrom ? false : reusedSession,
        });
        const parentMessageId = retryFrom
            ? null
            : reusedSession
                ? conversation?.parentMessageId ?? this.sessions.get(prepared.sessionId)?.lastResponseMessageId ?? null
                : null;
        const currentAuth = await this.login.dumpCurrent();
        const upstream = await openCompletionStream(this.config.baseUrl, currentAuth, {
            token: prepared.token,
            powHeader: prepared.powHeader,
            sessionId: prepared.sessionId,
            modelType,
            prompt,
            thinking,
            search,
            parentMessageId,
        });
        const retry = retryFrom ? retryFrom.retry + 1 : 0;
        this.logger.debug("DeepSeek completion prepared", {
            sessionId: prepared.sessionId,
            reused: reusedSession,
            parentMessageId,
            promptChars: prompt.length,
            retry,
            modelType,
            thinking,
            search,
        });
        return {
            upstream,
            prompt,
            sessionId: prepared.sessionId,
            parentMessageId,
            modelType,
            publicModel,
            thinking,
            search,
            reusedSession,
            convKey: retryFrom
                ? retryFrom.convKey
                : conversation?.key ?? conversation?.pendingFingerprint ?? null,
            requestTurns: retryFrom ? retryFrom.requestTurns : built?.requestTurns ?? [],
            instructionFingerprint: retryFrom
                ? retryFrom.instructionFingerprint
                : built?.instructionFingerprint ?? "",
            toolsFingerprint: retryFrom ? retryFrom.toolsFingerprint : built?.toolsFingerprint ?? "",
            latestUserText: retryFrom ? retryFrom.latestUserText : built?.latestUserText ?? "",
            hasTools: retryFrom ? retryFrom.hasTools : built?.hasTools ?? false,
            retry,
        };
    }
    responseInput(run) {
        return {
            upstream: run.upstream,
            publicModel: run.publicModel,
            modelType: run.modelType,
            sessionId: run.sessionId,
            thinkingEnabled: run.thinking,
            searchEnabled: run.search,
            toolCompatibilityEnabled: run.hasTools,
            toolReasoning: this.config.toolReasoning,
        };
    }
    setResponseMetadata(result, run, retry) {
        result.response.metadata.reused_session = run.reusedSession;
        result.response.metadata.parent_message_id = run.parentMessageId;
        result.response.metadata.empty_response_retry = retry;
    }
    logAttempt(run, diagnostics) {
        const fields = this.logFields(run, diagnostics);
        this.logger.debug("DeepSeek completion result", fields);
        if (diagnostics.emptyUpstream)
            this.logger.info("DeepSeek upstream returned empty channels", fields);
    }
    logFields(run, diagnostics) {
        return {
            sessionId: run.sessionId,
            reused: run.reusedSession,
            parentMessageId: run.parentMessageId,
            promptChars: run.prompt.length,
            reasoningChars: diagnostics.reasoningChars,
            outputChars: diagnostics.outputChars,
            toolCallCount: diagnostics.toolCallCount,
            emptyUpstream: diagnostics.emptyUpstream,
            retry: run.retry,
        };
    }
    remember(run, responseMessageId, responseText) {
        const canonical = canonicalAssistantText(responseText);
        if (!canonical.trim()) {
            this.logger.warn("Skipping empty assistant response", {
                sessionId: run.sessionId,
                responseMessageId,
                retry: run.retry,
            });
            return;
        }
        this.sessions.remember({
            sessionId: run.sessionId,
            modelType: run.modelType,
            responseMessageId,
            convKey: run.convKey,
            prompt: run.prompt,
            responseText: canonical,
            requestTurns: run.requestTurns,
            instructionFingerprint: run.instructionFingerprint,
            toolsFingerprint: run.toolsFingerprint,
        });
    }
}
//# sourceMappingURL=client.js.map