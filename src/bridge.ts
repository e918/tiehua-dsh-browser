import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

export const PROTOCOL = 1;
export const VERSION = '0.1.0-alpha.13';
export class BrowserError extends Error {
  constructor(public code: string, message: string) { super(`${code}: ${message}`); }
}
type Params = Record<string, any>;
type Browser = { id: string; ws: WebSocket; version: string; name: string; lastSeen: number; uncertain: Set<string> };
type Pending = { browser: Browser; command: string; sessionId: string; finish: (error?: Error, data?: any) => void; expired: boolean };
export type CallContext = { sessionId: string; browserId?: string; signal?: AbortSignal; timeoutMs?: number };
const READS = new Set(['snapshot', 'read_text', 'query', 'screenshot']);
const readOnly = (cmd: string, params: Params) => READS.has(cmd) || cmd === 'tabs' && params.action === 'list';

/** Local Chrome mode: block ordinary web pages, remote sockets and rebound hosts. */
export function trustedExtensionRequest(req: IncomingMessage): boolean {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
    && /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || '')
    && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
}

/** Native DSH-owned transport. Never spawns a daemon, npx process or MCP server. */
export class BrowserBridge {
  private server?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;
  private browsers = new Map<string, Browser>();
  private pending = new Map<string, Pending>();
  private sessions = new Map<string, string>();
  private queues = new Map<string, Promise<unknown>>();
  private stopped = true;
  port = 0;
  lastError = '';
  constructor(private options: { port: number; handshakeMs?: number }) {}

  async start() {
    if (this.server) return;
    this.stopped = false;
    const server = new WebSocketServer({
      host: '127.0.0.1', port: this.options.port, maxPayload: 72 * 1024 * 1024,
      verifyClient: ({ req }, done) => done(trustedExtensionRequest(req), 403),
    });
    this.server = server;
    server.on('connection', (ws, req) => this.accept(ws, req.headers.origin!.slice('chrome-extension://'.length)));
    server.on('error', error => { this.lastError = error.message; });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve); server.once('error', reject);
      });
    } catch (error) { this.server = undefined; this.stopped = true; throw error; }
    this.port = (server.address() as { port: number }).port;
    this.heartbeat = setInterval(() => {
      for (const browser of this.browsers.values()) {
        if (Date.now() - browser.lastSeen > 65000) browser.ws.terminate();
        else this.send(browser.ws, { type: 'ping' });
      }
    }, 20000);
    this.heartbeat.unref();
  }

  private send(ws: WebSocket, message: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }
  private accept(ws: WebSocket, extensionId: string) {
    let browser: Browser | undefined;
    const deadline = setTimeout(() => ws.close(1008, 'Extension handshake required'), this.options.handshakeMs ?? 5000);
    ws.on('error', () => {});
    ws.on('message', raw => {
      let msg: Params;
      try { msg = JSON.parse(raw.toString()); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!msg || typeof msg !== 'object') { ws.close(1008); return; }
      if (!browser) {
        if (msg.type !== 'hello' || msg.role !== 'extension' || msg.v !== PROTOCOL ||
          msg.extId !== extensionId ||
          typeof msg.instanceId !== 'string' || !/^[\w-]{8,80}$/.test(msg.instanceId)) {
          ws.close(1008, 'Extension identity or protocol mismatch'); return;
        }
        clearTimeout(deadline);
        const prior = this.browsers.get(msg.instanceId);
        browser = { id: msg.instanceId, ws, version: String(msg.version || ''),
          name: String(msg.browserName || 'Chrome').slice(0, 80), lastSeen: Date.now(),
          uncertain: prior?.uncertain ?? new Set() };
        if (prior) prior.ws.close(1000, 'Reconnected');
        this.browsers.set(browser.id, browser);
        this.send(ws, { type: 'welcome', bridge: VERSION, v: PROTOCOL });
        this.broadcastSessions();
        return;
      }
      browser.lastSeen = Date.now();
      if (msg.type === 'ping') { this.send(ws, { type: 'pong' }); return; }
      if (msg.type === 'pong') return;
      if (msg.type === 'res' && typeof msg.__k === 'string') {
        const call = this.pending.get(msg.__k);
        // A different connected browser cannot complete another browser's request.
        if (!call || call.browser.id !== browser.id) return;
        this.pending.delete(msg.__k);
        browser.uncertain.delete(msg.__k);
        if (!call.expired) call.finish(msg.ok ? undefined : new BrowserError(
          String(msg.error?.code || 'BROWSER_FAILED'), String(msg.error?.message || '浏览器操作失败')),
          msg.data);
      }
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (!browser) return;
      for (const [id, call] of this.pending) {
        if (call.browser !== browser || call.expired) continue;
        call.expired = true;
        browser.uncertain.add(id);
        call.finish(new BrowserError('RESULT_UNKNOWN', '连接中断，已发送操作的结果未知。先检查页面，不要直接重复操作。'));
      }
      // Keep offline identity and uncertainty until an explicit acknowledgement.
    });
  }

  status() {
    return {
      enabled: !this.stopped, port: this.port, lastError: this.lastError, connectionMode: 'local-extension',
      browsers: [...this.browsers.values()].map(b => ({ id: b.id, name: b.name, version: b.version,
        connected: b.ws.readyState === WebSocket.OPEN, lastSeen: b.lastSeen, uncertain: b.uncertain.size })),
      sessions: [...this.sessions].map(([sessionId, browserId]) => ({ sessionId, browserId })),
    };
  }
  acknowledge(browserId: string) {
    const browser = this.browsers.get(browserId);
    if (!browser) throw new BrowserError('NO_BROWSER', '浏览器不存在');
    for (const id of browser.uncertain) this.pending.delete(id);
    browser.uncertain.clear();
  }
  async release(sessionId: string) {
    if ([...this.pending.values()].some(p => p.sessionId === sessionId)) throw new BrowserError('TASK_BUSY', '任务仍有在途或结果未知的操作，请先等待完成或核实页面。');
    const browserId = this.sessions.get(sessionId);
    if (!browserId) return;
    // The extension must clear its stored default and ownership before this task
    // can be removed from the live set; otherwise reusing the task revives old claims.
    await this.call('tabs', { action: 'release' }, { sessionId, browserId });
    this.sessions.delete(sessionId);
    this.broadcastSessions();
  }
  private broadcastSessions() {
    for (const browser of this.browsers.values()) this.send(browser.ws, {
      type: 'event', event: 'sessions', live: [...this.sessions].filter(([, id]) => id === browser.id).map(([sid]) => sid),
    });
  }
  private choose(ctx: CallContext) {
    const desired = ctx.browserId || this.sessions.get(ctx.sessionId);
    if (desired) {
      const b = this.browsers.get(desired);
      if (!b || b.ws.readyState !== WebSocket.OPEN) throw new BrowserError('BROWSER_OFFLINE', '指定浏览器未连接');
      return b;
    }
    const online = [...this.browsers.values()].filter(b => b.ws.readyState === WebSocket.OPEN);
    if (online.length === 0) throw new BrowserError('NO_EXTENSION', 'Chrome 扩展未连接。请加载或重新加载 铁花扩展，并确认本机端口一致。');
    if (online.length !== 1) throw new BrowserError('CHOOSE_BROWSER', '多个浏览器已连接，请先用 tiehua_browser_status 查询并指定 browserId。');
    return online[0];
  }

  async call(command: string, params: Params, ctx: CallContext): Promise<any> {
    if (this.stopped) throw new BrowserError('DISABLED', '浏览器插件已停用');
    if (!ctx.sessionId) throw new BrowserError('NO_SESSION', '操作必须归属 DSH 会话');
    ctx.signal?.throwIfAborted();
    const selected = this.choose(ctx);
    // Serialize per browser, including tab selection; no global active-tab race.
    const previous = this.queues.get(selected.id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      ctx.signal?.throwIfAborted();
      const browser = this.choose({ ...ctx, browserId: selected.id });
      if (browser.uncertain.size && !readOnly(command, params)) throw new BrowserError('RESULT_UNKNOWN',
        '上次操作结果未知。可先读取页面；核实后在 铁花设置中确认，恢复后续操作。');
      this.sessions.set(ctx.sessionId, browser.id);
      this.broadcastSessions();
      return this.dispatch(browser, command, params, ctx);
    });
    this.queues.set(selected.id, next);
    void next.finally(() => { if (this.queues.get(selected.id) === next) this.queues.delete(selected.id); }).catch(() => {});
    return next;
  }
  private dispatch(browser: Browser, command: string, params: Params, ctx: CallContext) {
    return new Promise<any>((resolve, reject) => {
      const id = randomUUID();
      let settled = false;
      const finish = (error?: Error, data?: any) => {
        if (settled) return;
        settled = true; clearTimeout(timer); ctx.signal?.removeEventListener('abort', cancel);
        if (error) reject(error); else resolve(data);
      };
      const expire = (code: string) => {
        const call = this.pending.get(id);
        if (!call || call.expired) return;
        call.expired = true;
        browser.uncertain.add(id);
        this.send(browser.ws, { type: 'cancel', __k: id });
        finish(new BrowserError(code, '已停止等待并请求取消；已发出的页面操作无法撤销，结果需核实。'));
      };
      const cancel = () => expire('ABORTED');
      const timer = setTimeout(() => expire('RESULT_UNKNOWN'), ctx.timeoutMs ?? 60000);
      this.pending.set(id, { browser, command, sessionId: ctx.sessionId, finish, expired: false });
      ctx.signal?.addEventListener('abort', cancel, { once: true });
      if (ctx.signal?.aborted) { cancel(); return; }
      this.send(browser.ws, { type: 'cmd', cmd: command, params, tabId: params.tabId,
        sid: ctx.sessionId, id, __k: id, client: 'tiehua-dsh', label: '铁花 · DSH',
        live: [...this.sessions].filter(([, b]) => b === browser.id).map(([s]) => s) });
    });
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    this.sessions.clear(); this.broadcastSessions();
    for (const call of this.pending.values()) call.finish(new BrowserError('STOPPED', '插件已停止；在途操作可能已执行，请检查页面。'));
    this.pending.clear(); this.queues.clear();
    const server = this.server; this.server = undefined;
    if (server) {
      for (const ws of server.clients) ws.terminate();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    this.browsers.clear();
  }
}
