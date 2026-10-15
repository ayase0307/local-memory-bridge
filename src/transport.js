const MAX_CONTEXT_CHARS = 32_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 600_000;

class ResponseReadError extends Error {}

function validateArguments({ baseUrl, apiKey, model, prompt, timeoutMs }) {
  if (typeof baseUrl !== 'string') {
    throw new TypeError('baseUrl must be an HTTP loopback URL ending in /v1.');
  }

  const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/v1$/.exec(baseUrl);
  const port = match ? Number(match[2]) : NaN;
  if (!match || !Number.isInteger(port) || port > 65_535) {
    throw new TypeError('baseUrl must use HTTP, a literal loopback host, an explicit valid port, and the exact /v1 path.');
  }

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || apiKey.length > 8_192 || /[\r\n]/.test(apiKey)) {
    throw new TypeError('apiKey must be a non-empty string without line breaks.');
  }
  if (typeof model !== 'string' || model.trim().length === 0 || model.length > 256 || /[\r\n]/.test(model)) {
    throw new TypeError('model must be a non-empty string of at most 256 characters.');
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > MAX_CONTEXT_CHARS) {
    throw new TypeError(`prompt must be non-empty and no longer than ${MAX_CONTEXT_CHARS} characters.`);
  }
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS)) {
    throw new TypeError(`timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore cancellation errors so upstream details never escape through an error.
  }
}

async function readLimitedBody(response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      await cancelBody(response);
      throw new ResponseReadError('Upstream returned an invalid response size.');
    }
    if (declaredBytes > MAX_RESPONSE_BYTES) {
      await cancelBody(response);
      throw new ResponseReadError('Upstream response exceeded the 1 MiB limit.');
    }
  }

  if (!response.body) {
    throw new ResponseReadError('Upstream returned an invalid response body.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation is the useful error; discard cancellation failures.
        }
        throw new ResponseReadError('Upstream response exceeded the 1 MiB limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ResponseReadError('Upstream returned an invalid response body.');
  }
}

function extractCompletion(jsonText) {
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error('Upstream returned invalid JSON.');
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.choices)) {
    throw new Error('Upstream returned an unsupported response shape.');
  }
  const choice = payload.choices[0];
  if (choice === null || typeof choice !== 'object' || Array.isArray(choice)) {
    throw new Error('Upstream returned an unsupported response shape.');
  }
  if (choice.finish_reason === 'length') {
    throw new Error('Upstream response is incomplete (finish_reason=length).');
  }
  if (choice.finish_reason !== 'stop') {
    throw new Error('Upstream response is incomplete or unsupported.');
  }

  const content = choice.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Upstream returned an unsupported response shape.');
  }
  if (content.trim().length === 0) {
    throw new Error('Upstream returned an empty response.');
  }
  return content;
}

export async function complete(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object.');
  }

  const {
    baseUrl,
    apiKey,
    model,
    prompt,
    timeoutMs = 120_000,
  } = options;
  validateArguments({ baseUrl, apiKey, model, prompt, timeoutMs });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      });
    } catch {
      if (controller.signal.aborted) {
        throw new Error('Upstream request timed out.');
      }
      throw new Error('Unable to reach the upstream adapter.');
    }

    if (response.status >= 300 && response.status < 400) {
      await cancelBody(response);
      throw new Error('Upstream redirected the request.');
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new Error(`Upstream request failed (HTTP ${response.status}).`);
    }

    let jsonText;
    try {
      jsonText = await readLimitedBody(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Upstream request timed out.');
      }
      if (error instanceof ResponseReadError) {
        throw error;
      }
      throw new Error('Unable to read the upstream response.');
    }
    return extractCompletion(jsonText);
  } finally {
    clearTimeout(timer);
  }
}
