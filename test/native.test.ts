import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { createTools, domainKey, type BrowserRuntime } from '../src/tools.ts';
import { trustedRequest } from '../src/routes.ts';
import * as plugin from '../src/index.ts';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setup(t: any) {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime, { mode: 'native' });
  return ctx;
}
function execute(ctx: Context, name: string, args: unknown = {}) {
  return ctx.tools.execute({ name: 'tiehua_browser_' + name, arguments: args, callId: 'call-1' as never,
    agent: { session: { header: { id: 'session-123' } }, options: {} } as never, signal: new AbortController().signal });
}
test('all 23 tools register in the actual DSH 0.2.1-rc.3 runtime and validate arguments', async t => {
  const ctx = await setup(t);
  const runtime: BrowserRuntime = { config: { enabled: true, port: 17891, allowEval: false, dataDir: '' }, dataDir: '/unused', lastError: '' };
  for (const tool of createTools(ctx, runtime)) ctx.tools.register(tool);
  assert.equal(ctx.tools.schemas().filter(x => x.name.startsWith('tiehua_browser_')).length, 23);
  assert.equal((await execute(ctx, 'status')).isError, false);
  const invalid = await execute(ctx, 'type', { text: 22 }); assert.equal(invalid.isError, true);
  assert.match(JSON.stringify(invalid), /INVALID_ARGUMENTS/);
  const noBrowser = await execute(ctx, 'snapshot'); assert.match(JSON.stringify(noBrowser), /NOT_READY/);
  assert.match(JSON.stringify(await execute(ctx, 'eval', { expr: '1+1' })), /EVAL_DISABLED/);
});
test('native tools send DSH session identity and persist screenshots through the attachment service', async t => {
  const ctx = await setup(t); const calls: any[] = [];
  ctx.provide('attachments', { async saveImage(image: any) {
    assert.equal(image.mediaType, 'image/png'); assert.equal(image.data.toString(), 'synthetic image bytes');
    return { attachmentId: 'test-image', mediaType: 'image/png', width: 1, height: 1, bytes: 21 };
  } } as never);
  const runtime: BrowserRuntime = { config: { enabled: true, port: 17891, allowEval: false, dataDir: '' }, dataDir: '/unused', lastError: '',
    bridge: { call: async (cmd: string, args: any, options: any) => { calls.push({ cmd, args, options }); return cmd === 'screenshot'
      ? { dataUrl: 'data:image/png;base64,' + Buffer.from('synthetic image bytes').toString('base64') } : { text: 'content' }; } } as never };
  for (const tool of createTools(ctx, runtime)) ctx.tools.register(tool);
  const result = await execute(ctx, 'screenshot', { tabId: 17 });
  assert.equal(result.isError, false); assert.equal(result.content[1].type, 'image');
  assert.equal(calls[0].options.sessionId, 'tiehua:session-123');
  assert.equal(calls[0].args.tabId, 17);
});
test('plugin loads and disposes in a real Cordis scope without an MCP dependency', async t => {
  const ctx = await setup(t); const dir = await mkdtemp(path.join(tmpdir(), 'tiehua-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const oldKey = path.join(dir, 'pairing.key');
  await writeFile(oldKey, 'obsolete-legacy-key');
  // Disabled fixture does not touch the daily DSH profile or bind a real configured port.
  const fiber = ctx.plugin(plugin, { enabled: false, port: 17891, allowEval: false, dataDir: dir });
  await fiber;
  assert.ok(ctx.tools.get('tiehua_browser_status'));
  assert.match(JSON.stringify(await execute(ctx, 'snapshot')), /DISABLED/);
  assert.equal(ctx.tiehuaBrowser.config.enabled, false);
  assert.equal(ctx.tiehuaBrowser.bridge, undefined);
  assert.equal(await readFile(oldKey, 'utf8'), 'obsolete-legacy-key');
  await fiber.dispose();
  assert.equal(ctx.tools.get('tiehua_browser_status'), undefined);
});
test('settings provenance accepts local web or desktop proxy requests and rejects page origins', () => {
  const req = (headers: any, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } }) as never;
  assert.equal(trustedRequest(req({ host: '127.0.0.1:1234', origin: 'https://evil.test', 'x-tiehua-ui': '1' })), false);
  assert.equal(trustedRequest(req({ host: 'evil.test:1234', origin: 'http://evil.test:1234', 'x-tiehua-ui': '1' })), false);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', origin: 'http://localhost:1234', 'x-tiehua-ui': '1' })), true);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', 'sec-fetch-site': 'same-origin', 'x-tiehua-ui': '1' })), true);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', 'x-tiehua-ui': '1' })), true);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', origin: 'null', 'x-tiehua-ui': '1' })), false);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', 'sec-fetch-site': 'cross-site', 'x-tiehua-ui': '1' })), false);
  assert.equal(trustedRequest(req({ host: 'localhost:1234', 'x-tiehua-ui': '1' }, '192.168.1.4')), false);
});
test('site note keys cannot escape the notes directory', () => {
  assert.equal(domainKey('https://BI.Example.com/report'), 'bi.example.com');
  assert.throws(() => domainKey('../..')); assert.throws(() => domainKey('file:///C:/secrets'));
});
