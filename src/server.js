import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { buildContext, recordTurn, withProjectLock } from './memory.js';
import { complete } from './transport.js';

const error = (status, message) => Object.assign(new Error(message), { bridgeStatus: status });
function json(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function authorized(header, key) {
  if (typeof header !== 'string') return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${key}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) { reject(error(413, 'Request exceeds 64 KiB')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(error(400, 'Invalid JSON')); }
    });
    req.on('error', () => reject(error(400, 'Request interrupted')));
    req.on('aborted', () => reject(error(400, 'Request interrupted')));
  });
}
function validate(body, model) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Expected a JSON object');
  if (Object.keys(body).some(key => !['model', 'messages', 'stream'].includes(key))) throw error(400, 'Unsupported request field');
  if (body.stream !== undefined && body.stream !== false) throw error(400, 'Only stream:false is supported');
  if (body.model !== undefined && body.model !== model) throw error(400, 'Model differs from configured model');
  if (!Array.isArray(body.messages) || body.messages.length !== 1) throw error(400, 'Send exactly one user message');
  const message = body.messages[0];
  if (!message || message.role !== 'user' || typeof message.content !== 'string' || !message.content.trim() || Object.keys(message).some(key => !['role', 'content'].includes(key))) {
    throw error(400, 'Expected one text user message');
  }
  return message.content;
}

export function createBridgeServer({ project, apiKey, upstream }) {
  if (typeof project !== 'string' || !project || typeof apiKey !== 'string' || apiKey.length < 16 || /[\r\n]/.test(apiKey)) {
    throw new Error('Set a project and BRIDGE_API_KEY of at least 16 characters');
  }
  if (!upstream || typeof upstream.model !== 'string' || !upstream.model.trim()) throw new Error('Configure an upstream model');
  const server = http.createServer(async (req, res) => {
    try {
      const allowedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== allowedHost || req.headers.origin !== undefined) throw error(403, 'Host or Origin rejected');
      if (req.method === 'GET' && req.url === '/health') {
        json(res, 200, { status: 'ok', upstreamVerified: false }); return;
      }
      if (!authorized(req.headers.authorization, apiKey)) throw error(401, 'Invalid API key');
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') throw error(404, 'Route not found');
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw error(415, 'Use application/json');
      if (Number(req.headers['content-length']) > 65536) { req.resume(); throw error(413, 'Request exceeds 64 KiB'); }
      const user = validate(await readBody(req), upstream.model);
      const assistant = await withProjectLock(project, async () => {
        const { prompt, contextHash } = await buildContext(project, user);
        const reply = await complete({ ...upstream, prompt });
        await recordTurn(project, { user, assistant: reply, contextHash });
        return reply;
      });
      json(res, 200, {
        id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000),
        model: upstream.model, choices: [{ index: 0, message: { role: 'assistant', content: assistant }, finish_reason: 'stop' }]
      });
    } catch (failure) {
      const status = failure.bridgeStatus ?? (failure.code === 'PROJECT_BUSY' ? 409 : failure.code === 'INVALID_INPUT' ? 400 : 502);
      const message = status === 502 ? 'Upstream or local storage failed; request was not retried. Check local state before resending.' : status === 409 ? 'Project is busy' : status === 400 ? 'Invalid request or context exceeds limit' : failure.message;
      json(res, status, { error: { message, type: 'bridge_error' } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.timeout = 150000;
  return server;
}
