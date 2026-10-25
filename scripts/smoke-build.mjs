// Exercise the distributed bundle against real DSH services and a synthetic extension.
// Does not launch Chrome or modify a desktop DSH profile.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { WebSocket } from 'ws';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as Connection from '@deepseek-ai/dsh-client-connection';
import * as plugin from '../lib/index.js';

const directory = await mkdtemp(path.join(tmpdir(), 'tiehua-build-smoke-'));
const ctx = new Context();
const routes = [];
let ws;
const server = createServer((req, res) => {
  if (new URL(req.url, 'http://fixture').pathname === '/') {
    if (ctx.connection.authorizeIndex(req, res)) res.end('authenticated fixture');
    return;
  }
  const route = routes.find(r => r.path === req.url);
  if (route) void Promise.resolve(route.handler(req, res)).catch(e => { res.statusCode = 500; res.end(String(e)); });
  else { res.statusCode = 404; res.end(); }
});
try {
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  ctx.provide('webServer', { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1); } });
  // Ephemeral credentials belong only to this fixture, never the user's profile.
  ctx.provide('credentials', { async modifyRecord(_key, mutate) { return mutate(undefined); } });
  await ctx.plugin(Connection);
  const probe = createProbe(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const fiber = ctx.plugin(plugin, { enabled: true, port, allowEval: false, dataDir: directory });
  await fiber;
  const runtime = ctx.tiehuaBrowser;
  assert.ok(runtime.bridge?.port > 0, runtime.lastError);
  assert.equal(ctx.tools.schemas().filter(x => x.name.startsWith('tiehua_browser_')).length, 23);
  await assert.rejects(stat(path.join(directory, 'pairing.key')), { code: 'ENOENT' });
  ws = new WebSocket(`ws://127.0.0.1:${runtime.bridge.port}`, { origin: 'chrome-extension://' + 'a'.repeat(32) });
  await once(ws, 'open');
  const welcome = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'hello', role: 'extension', v: 1, extId: 'a'.repeat(32), instanceId: 'smoke-browser', version: '0.1.0-alpha.13' }));
  assert.equal(JSON.parse((await welcome)[0].toString()).type, 'welcome');
  const commands = [];
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type !== 'cmd') return;
    commands.push(msg);
    ws.send(JSON.stringify({ type: 'res', ok: true, __k: msg.__k, data: { text: 'synthetic page content' } }));
  });
  const run = (name, args) => ctx.tools.execute({ name: `tiehua_browser_${name}`, arguments: args, callId: 'smoke-call',
    agent: { session: { header: { id: 'smoke-session' } }, options: {} }, signal: new AbortController().signal });
  for (const tabId of [11, 22]) assert.equal((await run('read_text', { tabId })).isError, false);
  assert.deepEqual(commands.map(m => m.tabId), [11, 22]);
  assert.ok(commands.every(m => m.sid === 'tiehua:smoke-session'));
  assert.equal(routes.filter(r => r.path === '/api/tiehua-browser').length, 1);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(ctx.connection.authenticatedUrl(base), { redirect: 'manual' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  // Desktop forwards the signed cookie, but strips Origin and Sec-Fetch-Site.
  const response = await fetch(base + '/api/tiehua-browser', { headers: { cookie, 'x-tiehua-ui': '1' } });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.pairingToken, undefined);
  assert.equal(status.connectionMode, 'local-extension');
  assert.ok((await stat(path.join(status.extensionPath, 'manifest.json'))).isFile());
  const blocked = await fetch(base + '/api/tiehua-browser', { headers: { cookie, origin: 'https://page.example', 'x-tiehua-ui': '1' } });
  assert.equal(blocked.status, 403);
  const anonymous = await fetch(base + '/api/tiehua-browser', { headers: { 'x-tiehua-ui': '1' } });
  assert.equal(anonymous.status, 401);
  const released = await fetch(base + '/api/tiehua-browser', { method: 'POST',
    headers: { cookie, 'x-tiehua-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'release', sessionId: 'tiehua:smoke-session' }) });
  assert.equal(released.status, 200);
  assert.equal(commands.at(-1).params.action, 'release');
  assert.equal(runtime.bridge.status().sessions.length, 0);

  // Validate the actual DSH ModuleLoader envelope and settings contribution.
  let clientModule;
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { clientModule = value; } } },
  });
  assert.equal(clientModule.id, 'tiehua-dsh-browser');
  const client = clientModule.factory(createRequire(import.meta.url));
  const disposers = [], slots = [];
  const form = { getSnapshot: () => ({ status: 'ready', writable: true, value: {} }), subscribe: () => () => {}, set: async () => true };
  client.apply({
    effect(fn) { disposers.push(fn()); },
    locale: { register() { return () => {}; } },
    configForms: { get(ns) { assert.equal(ns, 'tiehua-browser'); return form; }, whileServed(_ns, fn) { return fn(); } },
    slots: { register(spec, component) { slots.push({ spec, component }); return () => {}; } },
  });
  assert.equal(slots[0].spec.name, 'settings.plugins.tab');
  assert.equal(slots[0].spec.inject().form, form);
  assert.equal(typeof slots[0].component, 'function');
  for (const dispose of disposers.reverse()) dispose();
  await fiber.dispose();
  assert.equal(ctx.tools.get('tiehua_browser_status'), undefined);
  assert.equal(routes.filter(r => r.path === '/api/tiehua-browser').length, 0);
  console.log('PASS: compiled native plugin, 23 tools, token-free local WebSocket, two tabs, settings HTTP boundary, release acknowledgement, client loader and lifecycle.');
} finally {
  ws?.terminate();
  await ctx.fiber.dispose();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  const target = path.resolve(directory);
  assert.equal(path.dirname(target).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
  assert.ok(path.basename(target).startsWith('tiehua-build-smoke-'));
  await rm(target, { recursive: true, force: true });
}
