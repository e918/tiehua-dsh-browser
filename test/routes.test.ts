import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { Context } from '@deepseek-ai/cordis';
import * as Connection from '@deepseek-ai/dsh-client-connection';
import { registerRoutes, API } from '../src/routes.ts';
import type { BrowserRuntime } from '../src/tools.ts';

async function fixture(t: any) {
  const ctx = new Context();
  const routes = new Map<string, any>();
  const actions: string[] = [];
  const server = createServer((req, res) => {
    if (new URL(req.url!, 'http://fixture').pathname === '/') {
      if (ctx.connection.authorizeIndex(req, res)) res.end('fixture');
      return;
    }
    const route = routes.get(req.url!);
    if (route) void Promise.resolve(route.handler(req, res)).catch(() => { res.statusCode = 500; res.end(); });
    else { res.statusCode = 404; res.end(); }
  });
  t.after(async () => {
    await ctx.fiber.dispose();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  });
  ctx.provide('webServer', { register(route: any) { routes.set(route.path, route); return () => routes.delete(route.path); } } as never);
  ctx.provide('credentials', { async modifyRecord(_key: unknown, mutate: Function) { return mutate(undefined); } } as never);
  await ctx.plugin(Connection);
  const runtime: BrowserRuntime = { config: { enabled: true, port: 17891, allowEval: false, dataDir: '' }, dataDir: '', lastError: '',
    bridge: { status: () => ({ browsers: [], sessions: [] }), acknowledge(id: string) { actions.push(id); },
      async release(id: string) { actions.push(id); } } as never };
  registerRoutes(ctx, runtime);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const login = await fetch(ctx.connection.authenticatedUrl(base), { redirect: 'manual' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const headers = { cookie, 'x-tiehua-ui': '1' };
  return { base, headers, actions };
}

test('desktop-proxied settings GET and POST use the actual DSH signed-cookie admission', async t => {
  const { base, headers, actions } = await fixture(t);
  const response = await fetch(base + API, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configuredPort, 17891);
  const web = await fetch(base + API, { headers: { ...headers, origin: base, 'sec-fetch-site': 'same-origin' } });
  assert.equal(web.status, 200); await web.body?.cancel();
  const action = await fetch(base + API, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'acknowledge', browserId: 'fixture-browser' }) });
  assert.equal(action.status, 200); await action.body?.cancel();
  assert.deepEqual(actions, ['fixture-browser']);
});

test('settings require a valid DSH cookie even for loopback or same-origin requests', async t => {
  const { base, headers, actions } = await fixture(t);
  const rejectedCases: Record<string, string>[] = [
    { 'x-tiehua-ui': '1' },
    { origin: base, 'sec-fetch-site': 'same-origin', 'x-tiehua-ui': '1' },
    { ...headers, cookie: headers.cookie + 'tampered' },
  ];
  for (const rejectedHeaders of rejectedCases) {
    const response = await fetch(base + API, { method: 'POST', headers: { ...rejectedHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'release', sessionId: 'fixture-session' }) });
    assert.equal(response.status, 401); await response.body?.cancel();
  }
  assert.deepEqual(actions, []);
});

test('a valid cookie does not bypass local settings origin and caller checks', async t => {
  const { base, headers, actions } = await fixture(t);
  const rejectedCases: Record<string, string>[] = [
    { ...headers, origin: 'https://other.example' },
    { ...headers, origin: 'null' },
    { ...headers, 'sec-fetch-site': 'cross-site' },
    { ...headers, 'x-tiehua-ui': '0' },
  ];
  for (const rejectedHeaders of rejectedCases) {
    const response = await fetch(base + API, { method: 'POST', headers: { ...rejectedHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'release', sessionId: 'fixture-session' }) });
    assert.equal(response.status, 403, rejectedHeaders.host ?? rejectedHeaders.origin ?? rejectedHeaders['sec-fetch-site'] ?? 'caller header'); await response.body?.cancel();
  }
  // Node fetch normalizes Host, so exercise a forged authority with raw HTTP.
  const forgedHost = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(base + API, { method: 'POST', headers: { ...headers, host: 'other.example', 'content-type': 'application/json' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ action: 'release', sessionId: 'fixture-session' }));
  });
  assert.equal(forgedHost, 403);
  assert.deepEqual(actions, []);
});
