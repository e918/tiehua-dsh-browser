const el = id => document.getElementById(id);
async function refresh() {
  const status = await chrome.runtime.sendMessage({ __hcPopup: 'status' }).catch(() => null);
  const connected = Boolean(status?.connected);
  el('state').dataset.connected = String(connected);
  el('status-label').textContent = connected ? '已连接 DSH' : '正在连接 DSH…';
  el('connection-details').hidden = !connected || !(status.port || status.bridge);
  el('endpoint-row').hidden = !connected || !status.port;
  el('endpoint').textContent = connected && status.port ? `127.0.0.1:${status.port}` : '';
  el('version-row').hidden = !connected || !status.bridge;
  el('version').textContent = connected && status.bridge ? status.bridge : '';
  el('status-detail').hidden = connected;
  el('status-detail').textContent = connected ? '' : '请确认 DSH 插件已启用。';
}
await refresh();
setInterval(refresh, 2000);
