import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { initProject, buildContext, remember, recordTurn, withProjectLock } from './memory.js';
import { complete } from './transport.js';
import { createBridgeServer } from './server.js';
import { runFileAgent } from './file-agent.js';

const help = `Local Memory Bridge (Node.js >=22)
  init     --project PATH
  pack     --project PATH --message TEXT
  remember --project PATH --text TEXT
  record   --project PATH --message TEXT --reply-file PATH
  chat     --project PATH --message TEXT --base-url http://127.0.0.1:18787/v1 --model MODEL
  agent    --project PATH --message TEXT --base-url URL --model MODEL [--max-steps 12]
  serve    --project PATH --base-url URL --model MODEL [--port 8790]

BRIDGE_UPSTREAM_KEY: upstream key (environment only).
BRIDGE_API_KEY: server key, at least 16 characters.
pack/record operate offline. chat/serve send context through your configured local upstream.
The HTTP endpoint supports one user message, stream:false, and no tools/history.
`;
const allowed = {
  init: ['project'], pack: ['project', 'message'], remember: ['project', 'text'],
  record: ['project', 'message', 'reply-file'],
  chat: ['project', 'message', 'base-url', 'model'], serve: ['project', 'base-url', 'model', 'port'],
  agent: ['project', 'message', 'base-url', 'model', 'max-steps']
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') { process.stdout.write(help); return; }
  if (!allowed[command]) throw new Error('Unknown command; use --help');
  const options = Object.fromEntries(allowed[command].map(name => [name, { type: 'string' }]));
  const { values } = parseArgs({ args, options, strict: true, allowPositionals: false });
  for (const name of allowed[command].filter(name => !['port', 'max-steps'].includes(name))) {
    if (!values[name]?.trim()) throw new Error(`Missing --${name}`);
  }
  const project = path.resolve(values.project);
  if (command === 'init') { await initProject(project); process.stdout.write('Project initialized; existing memory preserved.\n'); return; }
  if (command === 'pack') {
    const packet = await buildContext(project, values.message);
    process.stdout.write(packet.prompt + '\n');
    process.stderr.write(`contextHash=${packet.contextHash}\n`);
    return;
  }
  if (command === 'remember') { await remember(project, values.text); process.stdout.write('Memory appended.\n'); return; }
  if (command === 'record') {
    if ((await stat(values['reply-file'])).size > 1048576) throw new Error('Reply file exceeds 1 MiB');
    const bytes = await readFile(values['reply-file']);
    if (bytes.byteLength > 1048576) throw new Error('Reply file exceeds 1 MiB');
    let assistant;
    try { assistant = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Reply file must contain valid UTF-8'); }
    await withProjectLock(project, async () => {
      const { contextHash } = await buildContext(project, values.message);
      await recordTurn(project, { user: values.message, assistant, contextHash });
    });
    process.stdout.write('Manual reply recorded; hash reflects context at import time.\n'); return;
  }
  const upstream = { baseUrl: values['base-url'], model: values.model, apiKey: process.env.BRIDGE_UPSTREAM_KEY };
  if (command === 'agent') {
    const result = await runFileAgent({ project, user: values.message, upstream,
      maxSteps: values['max-steps'] === undefined ? 12 : Number(values['max-steps']),
      onStep: ({ step, tool }) => process.stderr.write(`Step ${step}: ${tool}\n`) });
    process.stdout.write(result.content + '\n'); return;
  }
  if (command === 'chat') {
    const assistant = await withProjectLock(project, async () => {
      const { prompt, contextHash } = await buildContext(project, values.message);
      const reply = await complete({ ...upstream, prompt });
      await recordTurn(project, { user: values.message, assistant: reply, contextHash });
      return reply;
    });
    process.stdout.write(assistant + '\n'); return;
  }
  const port = values.port === undefined ? 8790 : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
  await buildContext(project, 'startup check');
  const server = createBridgeServer({ project, apiKey: process.env.BRIDGE_API_KEY, upstream });
  server.on('error', () => { process.stderr.write('Cannot listen on the configured loopback port.\n'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Listening at http://127.0.0.1:${port}; upstream has not been verified.\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}

main().catch(failure => {
  process.stderr.write(`Error: ${failure.message}\n`);
  process.exitCode = 1;
});
