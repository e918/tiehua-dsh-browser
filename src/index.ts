import type { Context, Volatile } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-settings';
import type {} from '@deepseek-ai/dsh-attachment';
import z from '@deepseek-ai/schemastery';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BrowserBridge } from './bridge.ts';
import { createTools, type BrowserConfig, type BrowserRuntime } from './tools.ts';
import { registerRoutes } from './routes.ts';

export const name = 'tiehua-browser';
declare module '@deepseek-ai/cordis' { interface Context { tiehuaBrowser: BrowserRuntime } }
export const inject = ['tools'];
export const Config = z.object({
  enabled: z.boolean().default(true).description('启用浏览器连接').volatile(),
  port: z.number().min(1024).max(65535).step(1).default(17891).description('本机连接端口').volatile(),
  allowEval: z.boolean().default(false).description('允许页面 JavaScript 执行').volatile(),
  dataDir: z.string().default('').description('插件数据目录；留空使用 DSH_HOME/tiehua-browser'),
});
type HostConfig = { [K in keyof BrowserConfig]: BrowserConfig[K] | Volatile<BrowserConfig[K]> };
const value = <T extends string | number | boolean>(field: T | Volatile<T>): T =>
  field && typeof field === 'object' && 'get' in field ? (field as Volatile<T>).get() as T : field as T;
export async function apply(ctx: Context, host: HostConfig) {
  const snapshot = (): BrowserConfig => ({ enabled: value(host.enabled), port: value(host.port), allowEval: value(host.allowEval), dataDir: value(host.dataDir) });
  const config = snapshot();
  const dataDir = config.dataDir || path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'tiehua-browser');
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const runtime: BrowserRuntime = { config, dataDir, lastError: '' };
  ctx.provide('tiehuaBrowser', runtime);
  let stopped = false;
  let tail = Promise.resolve();
  const reconcile = () => {
    tail = tail.then(async () => {
      if (stopped) return;
      const config = runtime.config = snapshot();
      if (runtime.bridge && (!config.enabled || runtime.bridge.port !== config.port)) {
        const old = runtime.bridge; runtime.bridge = undefined; await old.stop();
      }
      if (!config.enabled || runtime.bridge) return;
      const bridge = new BrowserBridge({ port: config.port });
      try { await bridge.start(); runtime.bridge = bridge; runtime.lastError = ''; }
      catch (error) { runtime.lastError = error instanceof Error ? error.message : String(error); await bridge.stop(); }
    }).catch(error => { runtime.lastError = String(error); });
    return tail;
  };
  for (const tool of createTools(ctx, runtime)) ctx.tools.register(tool);
  ctx.on('loader/volatile-update', reconcile);
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'Tiehua custom settings');
  });
  ctx.inject(['webServer', 'connection'], child => registerRoutes(child, runtime));
  ctx.effect(() => async () => {
    stopped = true; await tail; await runtime.bridge?.stop(); runtime.bridge = undefined;
  }, 'Tiehua browser lifecycle');
  await reconcile();
}
