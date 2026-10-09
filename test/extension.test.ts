import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as script from '../extension/script.js';

function storage(initial: Record<string, any> = {}) {
  const values = { ...initial };
  return {
    values,
    async get(keys: any) {
      if (keys == null) return { ...values };
      if (typeof keys === 'string') return { [keys]: values[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, values[k]]));
      return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, values[k] ?? v]));
    },
    async set(data: object) { Object.assign(values, data); },
    async remove(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) delete values[k]; },
  };
}
async function background() {
  const local = storage({ markDisabled: true }), session = storage();
  const event = () => ({ addListener() {} });
  const tabs = new Map([[11, { id: 11, title: 'BI 报表', url: 'https://bi.test/' }], [22, { id: 22, title: '公众号', url: 'https://mp.test/' }]]);
  const chrome = {
    storage: { local, session }, offscreen: { hasDocument: async () => true },
    runtime: { onMessage: event(), onStartup: event(), getManifest: () => ({ version: '0.1.0' }), id: 'a'.repeat(32), sendMessage: async () => ({ sent: true }) },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
    alarms: { create() {}, onAlarm: event() },
    tabs: { onCreated: event(), onRemoved: event(), onUpdated: event(),
      get: async (id: number) => { if (!tabs.has(id)) throw new Error('missing'); return tabs.get(id); },
      query: async () => [...tabs.values()], update: async () => {}, ungroup: async () => {},
    },
  };
  let source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '');
  source = source.slice(0, source.lastIndexOf('// SW 每次醒来'));
  const context: any = { chrome, cdp: { reapOrphans() {} }, ...script, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { userAgent: 'test' }, crypto: globalThis.crypto, console, URL, stripMarkPrefix: (s: string) => s };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.api={HANDLERS, getActiveTabId, conflictNote, onMessage, resolveTab, registerTab};', context);
  return { api: context.api, local, session };
}
test('actual extension supports two tabs per DSH task, stable default and hard cross-task isolation', async () => {
  const { api, local } = await background();
  const a = { sid: 'task-A', live: ['task-A', 'task-B'] };
  const b = { sid: 'task-B', live: ['task-A', 'task-B'] };
  await api.HANDLERS.tabs({ action: 'select', tabId: 11 }, undefined, a);
  await api.HANDLERS.tabs({ action: 'select', tabId: 22 }, undefined, a);
  assert.equal(await api.getActiveTabId('task-A', a), 22);
  assert.deepEqual([...local.values['ownTabs:task-A']], [11, 22]);
  const list = await api.HANDLERS.tabs({ action: 'list' }, undefined, a);
  assert.match(list.text, /\[11\] \+/); assert.match(list.text, /\[22\] \*/);
  await assert.rejects(api.HANDLERS.tabs({ action: 'select', tabId: 11 }, undefined, b), (e: any) => e.code === 'TAB_OWNED');
  await assert.rejects(api.getActiveTabId('task-B', b), (e: any) => e.code === 'NO_TAB');
  // A long-running task must not silently lose ownership after its 16th page.
  for (let tab = 100; tab < 120; tab++) await api.registerTab('task-A', tab);
  await assert.rejects(api.HANDLERS.tabs({ action: 'select', tabId: 11 }, undefined, b), (e: any) => e.code === 'TAB_OWNED');
  // Release clears the stored claims, so A returning later cannot revive them.
  await api.HANDLERS.tabs({ action: 'release' }, undefined, a);
  assert.equal(local.values['ownTabs:task-A'], undefined);
  await assert.rejects(api.getActiveTabId('task-A', a), (e: any) => e.code === 'NO_TAB');
  await api.HANDLERS.tabs({ action: 'select', tabId: 11 }, undefined, { sid: 'task-B', live: ['task-B'] });
  assert.equal(await api.getActiveTabId('task-B', b), 11);
  assert.equal((await api.HANDLERS.tabs({ action: 'select', tabId: 11 }, undefined, b)).text.includes('11'), true);
});
test('reused content executor reads, fills, clicks and rejects stale element refs on a synthetic page', async t => {
  const dom = new JSDOM('<html><head><title>测试报表</title></head><body><main><label>关键词<input id="keyword"></label><button id="query">查询</button><p id="result">未查询</p></main></body></html>',
    { url: 'https://fixture.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w: any = dom.window;
  const listeners: Function[] = [];
  w.chrome = { runtime: { onMessage: { addListener(fn: Function) { listeners.push(fn); } } } };
  // jsdom has no layout engine; supply only the browser geometry needed by visibility checks.
  const computed = w.getComputedStyle.bind(w);
  w.getComputedStyle = (node: Element) => { const s = computed(node); if (!s.opacity) s.opacity = '1'; return s; };
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(value) { this.textContent = value; } });
  w.CSS = { escape: (s: string) => s.replace(/[^a-z0-9_-]/gi, '\\$&') };
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 10, y: 10, top: 10, left: 10, right: 110, bottom: 40, width: 100, height: 30 });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.document.elementFromPoint = () => w.document.querySelector('#query');
  w.document.querySelector('#query').onclick = () => { w.document.querySelector('#result').textContent = '查询结果：' + w.document.querySelector('#keyword').value; };
  w.eval(await readFile(new URL('../extension/content.js', import.meta.url), 'utf8'));
  const invoke = (msg: object) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('content response timeout')), 2000);
    listeners[0](msg, {}, (result: unknown) => { clearTimeout(timer); resolve(result); });
  });
  const snapshot = await invoke({ __hc: 'snapshot' });
  assert.match(JSON.stringify(snapshot), /查询/);
  const typed = await invoke({ __hc: 'type', selector: '#keyword', text: '销售额' });
  assert.equal(typed.error, undefined);
  const clicked = await invoke({ __hc: 'click', selector: '#query' });
  assert.equal(clicked.error, undefined);
  assert.equal(w.document.querySelector('#result').textContent, '查询结果：销售额');
  const stale = await invoke({ __hc: 'click', ref: 'e999', snapshotId: 'obsolete' });
  assert.ok(stale.error);
});
