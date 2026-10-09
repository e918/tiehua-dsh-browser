import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { BrowserRuntime } from './tools.ts';

export const API = '/api/tiehua-browser';
// This checks request provenance only. Every route must also use DSH admission.
export function trustedRequest(req: IncomingMessage): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return false;
  if (req.headers['x-tiehua-ui'] !== '1') return false;
  const host = req.headers.host;
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  // Desktop's dsh-app://app proxy removes Origin and Sec-Fetch-Site and
  // supplies the Host's signed session cookie. Authentication is checked below.
  if (origin === undefined) return req.headers['sec-fetch-site'] === undefined || req.headers['sec-fetch-site'] === 'same-origin';
  return origin === `http://${host}` || origin === `https://${host}`;
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
export function registerRoutes(ctx: Context, runtime: BrowserRuntime) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API, handler: async (req, res) => {
    if (!trustedRequest(req)) return json(res, 403, { error: '仅允许 DSH 本机设置页面访问' });
    const admission = ctx.connection.admit(req);
    if ('rejection' in admission) return json(res, admission.rejection, {
      error: admission.rejection === 401 ? 'DSH 会话认证已失效，请重新打开插件设置或重启 DSH' : '仅允许 DSH 本机设置页面访问',
    });
    if (req.method === 'GET') return json(res, 200, {
      ...runtime.bridge?.status(), configuredEnabled: runtime.config.enabled, configuredPort: runtime.config.port,
      lastError: runtime.lastError || runtime.bridge?.lastError || '',
      connectionMode: 'local-extension', extensionPath: fileURLToPath(new URL('../extension/', import.meta.url)),
    });
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4096) return json(res, 413, { error: '请求过大' }); chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!runtime.bridge) return json(res, 409, { error: '浏览器插件未启用' });
      if (body.action === 'release' && typeof body.sessionId === 'string') await runtime.bridge.release(body.sessionId);
      else if (body.action === 'acknowledge' && typeof body.browserId === 'string') runtime.bridge.acknowledge(body.browserId);
      else return json(res, 400, { error: '无效操作' });
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : String(error) }); }
  } }), 'Tiehua local settings API');
}
