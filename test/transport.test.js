import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { complete } from '../src/transport.js';

const RESPONSE_LIMIT = 1024 * 1024;

async function startServer(handler, host = '127.0.0.1') {
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => handler(request, response, Buffer.concat(chunks)));
  });

  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  const formattedHost = host.includes(':') ? `[${host}]` : host;
  return {
    baseUrl: `http://${formattedHost}:${address.port}/v1`,
    server,
  };
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

function okResponse(content = 'answer', finishReason = 'stop') {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
  };
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function withServer(handler, callback, host = '127.0.0.1') {
  const { baseUrl, server } = await startServer(handler, host);
  try {
    return await callback(baseUrl, server);
  } finally {
    await closeServer(server);
  }
}

test('posts exactly one non-streaming user prompt and returns completed text', async () => {
  await withServer((request, response, body) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer local-test-key');
    assert.equal(request.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(body.toString('utf8')), {
      model: 'test-model',
      messages: [{ role: 'user', content: 'keep this prompt verbatim' }],
      stream: false,
    });
    sendJson(response, okResponse('  answer with spacing  '));
  }, async (baseUrl) => {
    const result = await complete({
      baseUrl,
      apiKey: 'local-test-key',
      model: 'test-model',
      prompt: 'keep this prompt verbatim',
    });
    assert.equal(result, '  answer with spacing  ');
  });
});

test('accepts an IPv6 loopback URL', async () => {
  await withServer((request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    sendJson(response, okResponse('ipv6 answer'));
  }, async (baseUrl) => {
    assert.equal(await complete({
      baseUrl,
      apiKey: 'key',
      model: 'model',
      prompt: 'hello',
    }), 'ipv6 answer');
  }, '::1');
});

test('rejects URLs outside the exact HTTP loopback /v1 boundary before sending', async () => {
  const invalidUrls = [
    'https://127.0.0.1:8787/v1',
    'http://localhost:8787/v1',
    'http://127.0.0.2:8787/v1',
    'http://127.1:8787/v1',
    'http://2130706433:8787/v1',
    'http://0x7f000001:8787/v1',
    'http://127.0.0.1/v1',
    'http://127.0.0.1:8787/v1/',
    'http://127.0.0.1:8787/v1/chat/completions',
    'http://user:pass@127.0.0.1:8787/v1',
    'http://127.0.0.1:8787/v1?x=1',
    'http://127.0.0.1:8787/v1#fragment',
    'http://[::ffff:127.0.0.1]:8787/v1',
  ];

  for (const baseUrl of invalidUrls) {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
      /baseUrl/,
      baseUrl,
    );
  }
});

test('validates argument types, ranges, and the full-context character limit', async () => {
  const valid = {
    baseUrl: 'http://127.0.0.1:8787/v1',
    apiKey: 'key',
    model: 'model',
    prompt: 'hello',
  };
  const invalidArguments = [
    [{ ...valid, apiKey: '' }, /apiKey/],
    [{ ...valid, apiKey: 'x'.repeat(8193) }, /apiKey/],
    [{ ...valid, apiKey: 'bad\nkey' }, /apiKey/],
    [{ ...valid, model: '  ' }, /model/],
    [{ ...valid, model: 'm'.repeat(257) }, /model/],
    [{ ...valid, prompt: ' ' }, /prompt/],
    [{ ...valid, prompt: 'x'.repeat(32001) }, /prompt/],
    [{ ...valid, timeoutMs: 0 }, /timeoutMs/],
    [{ ...valid, timeoutMs: 600001 }, /timeoutMs/],
    [{ ...valid, timeoutMs: '1000' }, /timeoutMs/],
    [{ ...valid, timeoutMs: Number.NaN }, /timeoutMs/],
  ];

  await assert.rejects(complete(null), /options/i);
  await assert.rejects(complete(), /options/i);

  for (const [args, expected] of invalidArguments) {
    await assert.rejects(complete(args), expected);
  }
  await withServer((request, response) => sendJson(response, okResponse('ok')), async (baseUrl) => {
    assert.equal(await complete({
      ...valid,
      baseUrl,
      prompt: 'x'.repeat(32000),
    }), 'ok');
  });
});

test('turns upstream HTTP failures into generic errors without exposing body or key', async () => {
  for (const status of [401, 403, 429, 500, 502]) {
    await withServer((request, response) => {
      response.writeHead(status, { 'content-type': 'text/plain' });
      response.end('private upstream detail');
    }, async (baseUrl) => {
      await assert.rejects(
        complete({ baseUrl, apiKey: 'never-echo-this-key', model: 'model', prompt: 'hello' }),
        (error) => {
          assert.match(error.message, new RegExp(String(status)));
          assert.doesNotMatch(error.message, /private upstream detail|never-echo-this-key/);
          return true;
        },
      );
    });
  }
});

test('rejects redirects without following their Location', async () => {
  let requests = 0;
  await withServer((request, response) => {
    requests += 1;
    response.writeHead(302, { location: '/v1/other', 'content-type': 'text/plain' });
    response.end('redirect detail');
  }, async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
      /redirect/i,
    );
    assert.equal(requests, 1);
  });
});

test('rejects empty and whitespace-only completion content', async () => {
  for (const content of ['', ' \n\t ']) {
    await withServer((request, response) => sendJson(response, okResponse(content)), async (baseUrl) => {
      await assert.rejects(
        complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
        /empty/i,
      );
    });
  }
});

test('reports finish_reason length as an incomplete response', async () => {
  await withServer((request, response) => sendJson(response, okResponse('partial', 'length')), async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
      /incomplete|truncated|length/i,
    );
  });
});

test('rejects malformed JSON and invalid completion shapes without leaking response text', async () => {
  const bodies = [
    'not-json: private detail',
    JSON.stringify({ choices: [] }),
    JSON.stringify({ choices: [{ message: { content: 123 }, finish_reason: 'stop' }] }),
    JSON.stringify({ choices: [{ message: { content: 'text' }, finish_reason: 'tool_calls' }] }),
  ];

  for (const body of bodies) {
    await withServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body);
    }, async (baseUrl) => {
      await assert.rejects(
        complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
        (error) => {
          assert.doesNotMatch(error.message, /private detail|not-json/);
          return true;
        },
      );
    });
  }
});

test('timeout covers a response body that never completes', async () => {
  await withServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"choices":');
  }, async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello', timeoutMs: 40 }),
      /timed out/i,
    );
  });
});

test('maps a response-body network failure to a generic error', async () => {
  await withServer((request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': '100',
    });
    response.write('{');
    setTimeout(() => response.socket.destroy(), 10);
  }, async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'never-echo-this-key', model: 'model', prompt: 'hello' }),
      (error) => {
        assert.equal(error.message, 'Unable to read the upstream response.');
        assert.doesNotMatch(error.message, /never-echo-this-key|127\.0\.0\.1|ECONNRESET/);
        return true;
      },
    );
  });
});

test('rejects an oversized Content-Length before reading the response body', async () => {
  await withServer((request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(RESPONSE_LIMIT + 1),
    });
    response.write('{');
  }, async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
      /1 MiB|size limit|too large/i,
    );
  });
});

test('rejects chunked response bodies that exceed 1 MiB', async () => {
  await withServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(Buffer.alloc(RESPONSE_LIMIT + 1, 0x20));
  }, async (baseUrl) => {
    await assert.rejects(
      complete({ baseUrl, apiKey: 'key', model: 'model', prompt: 'hello' }),
      /1 MiB|size limit|too large/i,
    );
  });
});

test('maps network failures to a generic error', async () => {
  const { baseUrl, server } = await startServer(() => {});
  const { port } = server.address();
  await closeServer(server);

  await assert.rejects(
    complete({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'never-echo-this-key',
      model: 'model',
      prompt: 'hello',
      timeoutMs: 1000,
    }),
    (error) => {
      assert.match(error.message, /upstream|network|connect/i);
      assert.doesNotMatch(error.message, /127\.0\.0\.1|never-echo-this-key|ECONNREFUSED/);
      return true;
    },
  );
});



