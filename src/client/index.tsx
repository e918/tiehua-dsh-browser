import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

type Snapshot = { status: string; value?: { enabled?: boolean; port?: number; allowEval?: boolean }; writable?: boolean };
type Form = { getSnapshot(): Snapshot; subscribe(fn: () => void): () => void; set(field: string, value: unknown): Promise<boolean> };
type Status = { enabled?: boolean; configuredPort?: number; lastError?: string; extensionPath?: string;
  browsers?: { id: string; name: string; connected: boolean; version: string; uncertain: number }[];
  sessions?: { sessionId: string; browserId: string }[] };
type ClientContext = {
  effect(fn: () => (() => void), label?: string): void;
  configForms: { get(ns: string): Form; whileServed(ns: string[], fn: () => (() => void)): () => void };
  slots: { register(spec: Record<string, unknown>, component: React.ComponentType<any>): () => void };
  locale: { register(ns: string, messages: object): () => void };
};
const API = '/api/tiehua-browser';
const button: React.CSSProperties = { padding: '8px 13px', borderRadius: 7, border: '1px solid #9faea6', background: 'transparent', color: 'inherit', cursor: 'pointer' };
const card: React.CSSProperties = { border: '1px solid #899b8e55', borderRadius: 12, padding: 18, marginTop: 16 };
async function request(method = 'GET', body?: object): Promise<Status> {
  const response = await fetch(API, { method, headers: { 'x-tiehua-ui': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
export function BrowserSettings({ form }: { form: Form }) {
  const snapshot = useSyncExternalStore(useCallback(fn => form.subscribe(fn), [form]), useCallback(() => form.getSnapshot(), [form]));
  const [status, setStatus] = useState<Status>({});
  const [error, setError] = useState('');
  const [port, setPort] = useState('17891');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (snapshot.value?.port) setPort(String(snapshot.value.port)); }, [snapshot.value?.port]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await request(); if (active) { setStatus(value); setError(''); } }
      catch (e) { if (active) setError(String(e)); }
      if (active) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  const save = async (field: string, value: unknown) => {
    setBusy(true); setNotice('');
    try { if (!await form.set(field, value)) throw new Error('配置没有保存，请刷新后重试'); setNotice('已保存，连接状态将自动更新。'); }
    catch (e) { setNotice(String(e)); } finally { setBusy(false); }
  };
  const action = async (body: object) => {
    setBusy(true);
    try { await request('POST', body); setStatus(await request()); }
    catch (e) { setNotice(String(e)); } finally { setBusy(false); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setNotice('已复制'); }
    catch { setNotice('复制失败，请选中文字手动复制。'); }
  };
  const editable = snapshot.status === 'ready' && snapshot.writable !== false && !busy;
  return <main style={{ padding: 22, maxWidth: 860, margin: 'auto', lineHeight: 1.65 }}>
    <div style={{ color: '#6c8b76', fontSize: 12, letterSpacing: 2 }}>TIEHUA / BROWSER</div>
    <h2 style={{ margin: '3px 0' }}>浏览器，接入你的工作流</h2>
    <p style={{ opacity: .7, marginTop: 8 }}>DSH 原生工具 · 当前浏览器登录状态 · 按任务绑定标签页</p>
    {error && <p role="alert" style={{ color: '#c75b42' }}>{error}</p>}
    {status.lastError && <p role="alert" style={{ color: '#c75b42' }}>连接服务：{status.lastError}</p>}
    {notice && <p role="status">{notice}</p>}
    <section style={card}>
      <label style={{ display: 'flex', justifyContent: 'space-between' }}><strong>启用浏览器连接</strong>
        <input type="checkbox" disabled={!editable} checked={snapshot.value?.enabled ?? false} onChange={e => void save('enabled', e.target.checked)} /></label>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label htmlFor="tiehua-port">本机端口</label><input id="tiehua-port" type="number" min={1024} max={65535} value={port} onChange={e => setPort(e.target.value)} style={{ width: 100, padding: 7 }} />
        <button style={button} disabled={!editable || !Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535} onClick={() => void save('port', Number(port))}>保存端口</button>
      </div>
      <label style={{ display: 'block', marginTop: 16 }}><input type="checkbox" disabled={!editable} checked={snapshot.value?.allowEval ?? false} onChange={e => void save('allowEval', e.target.checked)} /> 允许工具执行页面 JavaScript</label>
      <small style={{ opacity: .65 }}>普通读取、点击和填表不需要开启此项。</small>
    </section>
    <section style={card}><strong>首次连接 Chrome</strong>
      <ol><li>打开 <code>chrome://extensions</code>，开启开发者模式。</li>
        <li>选择“加载已解压的扩展程序”，使用下方扩展目录。</li>
        <li>扩展加载后会自动连接。连接成功时，弹窗显示地址及端口。</li></ol>
      <div style={{ overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: 12 }}>{status.extensionPath || '等待插件信息…'}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button style={button} disabled={!status.extensionPath} onClick={() => void copy(status.extensionPath!)}>复制扩展目录</button>
      </div>
    </section>
    <section style={card}><strong>连接与任务</strong>
      {!status.browsers?.length && <p style={{ opacity: .7 }}>还没有浏览器连接。加载 铁花扩展后，这里会自动显示连接状态。</p>}
      {status.browsers?.map(b => <div key={b.id} style={{ padding: '14px 0' }}>
        <div><span style={{ color: b.connected ? '#409b69' : '#bd7153' }}>●</span> {b.name} · {b.connected ? '已连接' : '未连接'} · {b.version}</div>
        <small style={{ opacity: .65 }}>实例 {b.id}</small>
        {b.uncertain > 0 && <div><p>有操作结果未知，请先检查页面是否已经执行。</p><button style={button} disabled={busy} onClick={() => void action({ action: 'acknowledge', browserId: b.id })}>我已核实页面，恢复操作</button></div>}
      </div>)}
      {status.sessions?.map(s => <div key={s.sessionId} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 12 }}>
        <code style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{s.sessionId}</code><button style={button} disabled={busy} onClick={() => void action({ action: 'release', sessionId: s.sessionId })}>释放绑定</button>
      </div>)}
    </section>
  </main>;
}
export const name = 'tiehua-browser-client';
export const inject = ['slots', 'locale', 'configForms'];
export function apply(ctx: ClientContext) {
  ctx.effect(() => ctx.locale.register('settings.tiehua-browser', { zh: { title: '铁花dsh浏览器助手' }, en: { title: 'Tiehua Browser' } }), 'Tiehua locale');
  const form = ctx.configForms.get('tiehua-browser');
  ctx.effect(() => ctx.configForms.whileServed(['tiehua-browser'], () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'tiehua-browser', order: 45, locale: 'settings.tiehua-browser',
    label: () => '铁花dsh浏览器助手', inject: () => ({ form }),
  }, BrowserSettings)), 'Tiehua settings page');
}
