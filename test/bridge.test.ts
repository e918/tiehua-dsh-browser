import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { BrowserBridge, trustedExtensionRequest } from '../src/bridge.ts';
const extId = 'a'.repeat(32);
const origin = 'chrome-extension://' + extId;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function setup(t: any) {
  const bridge = new BrowserBridge({ port: 0 }); await bridge.start();
  t.after(() => bridge.stop());
  return bridge;
}
async function extension(bridge: BrowserBridge, id = 'browser-one', legacyToken?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { origin });
  await once(ws, 'open');
  const message = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'hello', role: 'extension', v: 1, extId, token: legacyToken, instanceId: id, version: '0.1.0-alpha.12' }));
  await message;
  return ws;
}
test('local extension connects without a token and receives native commands with task identity', async t => {
  const bridge = await setup(t); const ws = await extension(bridge);
  ws.on('message', bytes => {
    const m = JSON.parse(bytes.toString());
    if (m.type === 'cmd') {
      assert.equal(m.sid, 'task-A'); assert.equal(m.tabId, 11);
      ws.send(JSON.stringify({ type: 'res', __k: m.__k, ok: true, data: { text: '查询结果' } }));
    }
  });
  assert.deepEqual(await bridge.call('read_text', { tabId: 11 }, { sessionId: 'task-A' }), { text: '查询结果' });
  assert.equal(bridge.status().connectionMode, 'local-extension');
});
test('rejects a handshake identity that disagrees with the extension origin', async t => {
  const bridge = await setup(t);
  const bad = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { origin });
  await once(bad, 'open');
  const closed = once(bad, 'close');
  bad.send(JSON.stringify({ type: 'hello', role: 'extension', v: 1, extId: 'b'.repeat(32), instanceId: 'browser-two' }));
  assert.equal((await closed)[0], 1008);
  assert.equal(bridge.status().browsers.length, 0);
});
test('rejects normal pages, missing or malformed origins, and rebound hosts', async t => {
  const bridge = await setup(t);
  for (const options of [{ origin: 'https://example.com' }, {}, { origin: 'null' },
    { origin: 'chrome-extension://invalid' }, { origin, headers: { Host: 'evil.test' } }]) {
    const page = new WebSocket(`ws://127.0.0.1:${bridge.port}`, options);
    const [error] = await once(page, 'error'); assert.match(error.message, /403/);
  }
});
test('local connection gate rejects non-loopback sockets and accepts loopback addresses', () => {
  const req = (remoteAddress: string) => ({ socket: { remoteAddress }, headers: { origin, host: '127.0.0.1:17891' } }) as never;
  assert.equal(trustedExtensionRequest(req('192.168.1.20')), false);
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(trustedExtensionRequest(req(address)), true);
});
test('legacy saved pairing tokens no longer gate a valid local extension', async t => {
  const bridge = await setup(t); await extension(bridge, 'legacy-browser', 'old-unused-pairing-code');
  assert.equal(bridge.status().browsers[0].connected, true);
});
test('requires browser choice when two profiles are connected; never silently switches a task', async t => {
  const bridge = await setup(t); const a = await extension(bridge); await extension(bridge, 'browser-two');
  await assert.rejects(bridge.call('snapshot', {}, { sessionId: 'A' }), /CHOOSE_BROWSER/);
  a.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.type === 'cmd') a.send(JSON.stringify({ type: 'res', __k: m.__k, ok: true, data: 'A' })); });
  await bridge.call('snapshot', {}, { sessionId: 'A', browserId: 'browser-one' });
  a.close(); await once(a, 'close'); await wait(10);
  await assert.rejects(bridge.call('snapshot', {}, { sessionId: 'A' }), /BROWSER_OFFLINE/);
});
test('one task can address multiple tabs and per-browser commands remain ordered', async t => {
  const bridge = await setup(t); const ws = await extension(bridge); const tabs: number[] = [];
  let active = 0;
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString()); if (m.type !== 'cmd') return;
    assert.equal(++active, 1); tabs.push(m.tabId);
    setTimeout(() => { active--; ws.send(JSON.stringify({ type: 'res', __k: m.__k, ok: true, data: 'ok' })); }, 15);
  });
  await Promise.all([11, 22, 11].map(tabId => bridge.call('read_text', { tabId }, { sessionId: 'same-task' })));
  assert.deepEqual(tabs, [11, 22, 11]);
});
test('timed out writes are not replayed and block later writes until resolved', async t => {
  const bridge = await setup(t); const ws = await extension(bridge); const commands: any[] = [];
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.type === 'cmd') {
    commands.push(m); if (m.cmd === 'snapshot') ws.send(JSON.stringify({ type: 'res', __k: m.__k, ok: true, data: 'observed' }));
  } });
  await assert.rejects(bridge.call('click', { tabId: 1 }, { sessionId: 'A', timeoutMs: 20 }), /RESULT_UNKNOWN/);
  await assert.rejects(bridge.call('click', { tabId: 1 }, { sessionId: 'A' }), /RESULT_UNKNOWN/);
  assert.equal(await bridge.call('snapshot', { tabId: 1 }, { sessionId: 'A' }), 'observed');
  assert.equal(commands.filter(c => c.cmd === 'click').length, 1);
  ws.send(JSON.stringify({ type: 'res', __k: commands[0].__k, ok: true, data: 'late' }));
  await wait(15); assert.equal(bridge.status().browsers[0].uncertain, 0);
});
test('queued cancellation never dispatches the queued operation', async t => {
  const bridge = await setup(t); const ws = await extension(bridge); const seen: any[] = [];
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.type === 'cmd') {
    seen.push(m); setTimeout(() => ws.send(JSON.stringify({ type: 'res', __k: m.__k, ok: true, data: 'ok' })), 30);
  } });
  const first = bridge.call('read_text', {}, { sessionId: 'A' });
  const controller = new AbortController();
  const second = bridge.call('click', {}, { sessionId: 'A', signal: controller.signal });
  controller.abort();
  await assert.rejects(second); await first;
  assert.equal(seen.length, 1);
});
test('in-flight cancellation sends cancel and reports uncertainty; stopping frees the port', async t => {
  const bridge = await setup(t); const ws = await extension(bridge); const controller = new AbortController();
  const messages: any[] = [];
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); messages.push(m); if (m.type === 'cmd') controller.abort(); });
  await assert.rejects(bridge.call('act', {}, { sessionId: 'A', signal: controller.signal }), /ABORTED/);
  await wait(10); assert.equal(messages.some(m => m.type === 'cancel'), true);
  const port = bridge.port; await bridge.stop();
  const replacement = new BrowserBridge({ port }); await replacement.start(); await replacement.stop();
});
