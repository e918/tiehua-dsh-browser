// Reproducible adaptation of a pinned, locally reviewed upstream checkout.
// No MCP server code is imported or executed at runtime.
import fs from 'node:fs';
import path from 'node:path';
const upstream = process.argv[2];
if (!upstream) throw new Error('Usage: node scripts/adapt-upstream.mjs <huashu-chrome checkout>');
const read = name => fs.readFileSync(path.join(upstream, name), 'utf8').replaceAll('\r\n', '\n');
function replace(text, before, after) {
  if (!text.includes(before)) throw new Error('Upstream adaptation target missing: ' + before.slice(0, 90));
  return text.replace(before, after);
}
const server = read('src/mcp-server.js');
fs.writeFileSync('src/vendor/tool-schemas.js', '// MIT: huashu-chrome c3d9345. Parameter metadata only.\n' +
  server.slice(server.indexOf('const REF ='), server.indexOf('const STRATEGY =')) + '\nexport { TOOLS };\n');
const wrap = server.slice(server.indexOf('function wrapUntrusted('), server.indexOf('export async function startMcpServer'));
const pagination = replace(server.slice(server.indexOf('const pathGet ='), server.indexOf('// 错误不只报')),
  ".join('\\n') + '\\n');", ".join('\\n') + '\\n', { flag: 'wx' });");
fs.writeFileSync('src/vendor/fetch-pages.js', '// MIT: huashu-chrome c3d9345. Native pagination helper.\n' +
  'import fs from "node:fs";\nimport path from "node:path";\n' + wrap +
  pagination);

let bg = read('extension/background.js');
bg = replace(bg, 'const PORTS = [8899, 8900, 8901, 8902, 8903];',
  `async function connectionConfig() { return chrome.storage.local.get({ tiehuaPort: 17891 }); }`);
bg = replace(bg, 'const iid = await instanceId();\n  for (const port of PORTS)',
  `const iid = await instanceId();\n  const connection = await connectionConfig();\n  for (const port of [connection.tiehuaPort])`);
bg = replace(bg, "instanceId().then((iid) => sendResponse({", "Promise.all([instanceId(), connectionConfig()]).then(([iid, connection]) => sendResponse({\n      port: connection.tiehuaPort,");
// Report the live socket endpoint, not a setting that may have changed since connection.
bg = replace(bg, "bridge: directBridgeVersion, leg: 'direct'", "bridge: directBridgeVersion, port: Number(new URL(directWs.url).port), leg: 'direct'");
bg = replace(bg, "bridge: r?.bridge || '', leg: 'offscreen'", "bridge: r?.bridge || '', port: r?.connected ? r.port : null, leg: 'offscreen'");
// A new DSH task never inherits the global most-recent tab.
bg = replace(bg, "  const { activeTabId } = await chrome.storage.local.get('activeTabId');\n  if (activeTabId)",
  `  if (sid !== undefined) throw err('NO_TAB', '当前 DSH 任务未绑定标签页，请先调用 tiehua_browser_tabs 选择或新建。');\n  const { activeTabId } = await chrome.storage.local.get('activeTabId');\n  if (activeTabId)`);
bg = replace(bg, "  return owners.length ? '⚠️ 这个标签页正被另一个还在线的会话操控，你们会在同一个页面上互相踩。\\n' : '';",
  "  if (owners.length) throw err('TAB_OWNED', '标签页属于其他 DSH 任务。请使用其他标签页，或先在 Tiehua 设置释放原任务。');\n  return '';" );
bg = replace(bg, "    if (tabId && msg.sid && !NO_SLOT_CMDS.has(msg.cmd)) await registerTab(msg.sid, tabId);",
  "    if (tabId && msg.sid && !NO_SLOT_CMDS.has(msg.cmd)) { await conflictNote(tabId, msg.sid, ctx); await registerTab(msg.sid, tabId); }");
// Do not silently forget still-open owned tabs when a task uses many pages.
bg = replace(bg, '[...list, tabId].slice(-REG_CAP)', '[...list, tabId]');
bg = replace(bg, 'const REG_CAP = 16;', '// Owned tabs are removed on tab close or explicit task release.');
bg = replace(bg, "  async tabs(p, tabId, ctx) {\n    const sid = ctx?.sid;", `  async tabs(p, tabId, ctx) {
    const sid = ctx?.sid;
    if (p.action === 'release') {
      if (!sid) throw err('NO_SESSION', '释放绑定需要 DSH 会话身份');
      const all = await chrome.storage.local.get(null);
      const owned = [...new Set([...(all[regKey(sid)] || []), all[agentTabKey(sid)]].filter(Boolean))];
      await chrome.storage.local.remove([regKey(sid), agentTabKey(sid), 'slotTouch:' + sid, 'agentGroup:' + sid]);
      await chrome.storage.session.remove(['coach:' + sid, 'multiWarn:' + sid]);
      for (const id of owned) void syncMark(id);
      return { text: '已释放当前 DSH 会话的所有标签页；页面保持打开。' };
    }`);
bg = replace(bg, 'async function onMessage(msg) {', `const cancelledCommands = new Set();\nconst activeCommands = new Set();\nasync function onMessage(msg) {\n  if (msg.type === 'cancel') { if (activeCommands.has(msg.__k)) cancelledCommands.add(msg.__k); return; }`);
bg = replace(bg, "  if (msg.type !== 'cmd') return;\n  try {", "  if (msg.type !== 'cmd') return;\n  activeCommands.add(msg.__k);\n  try {");
bg = replace(bg, 'const ctx = { sid: msg.sid, live: msg.live, adopted: false };',
  'const ctx = { sid: msg.sid, live: msg.live, adopted: false, cancelled: () => cancelledCommands.has(msg.__k) };');
bg = replace(bg, '    let data = await handler(msg.params || {}, tabId, ctx);',
  "    if (ctx.cancelled()) throw err('ABORTED', '操作已取消');\n    let data = await handler(msg.params || {}, tabId, ctx);");
bg = replace(bg, "    reply(msg.id, false, { code: e.code || 'INTERNAL', message: e.message || String(e) }, msg.__k);\n  }",
  "    reply(msg.id, false, { code: e.code || 'INTERNAL', message: e.message || String(e) }, msg.__k);\n  } finally { activeCommands.delete(msg.__k); cancelledCommands.delete(msg.__k); }");
bg = replace(bg, '    const execStep = async (st, progress, plan, out = done) => {',
  "    const execStep = async (st, progress, plan, out = done) => {\n      if (ctx?.cancelled?.()) { stopped = { label: '取消', why: 'DSH 已取消，剩余步骤不再执行' }; return; }");
bg = replace(bg, 'async function performCore(id, cmd, p, { blockSensitive = false } = {}, ctx) {',
  "async function performCore(id, cmd, p, { blockSensitive = false } = {}, ctx) {\n  if (ctx?.cancelled?.()) throw err('ABORTED', 'DSH 已取消');");
bg = replace(bg, '  const runL1 = async () => {', "  const runL1 = async () => {\n    if (ctx?.cancelled?.()) throw err('ABORTED', 'DSH 已取消');");
bg = replace(bg, "  let note = '', usedL2 = layer === 'L2', l2note = '';", "  if (ctx?.cancelled?.()) throw err('ABORTED', 'DSH 已取消');\n  let note = '', usedL2 = layer === 'L2', l2note = '';");
bg = replace(bg, 'if (!ev.changed && !usedL2 && l2ok && !params.real)', 'if (!ctx?.cancelled?.() && !ev.changed && !usedL2 && l2ok && !params.real)');
bg = replace(bg, 'function pollPanel(id, timeout) {', 'function pollPanel(id, timeout, ctx) {');
bg = replace(bg, '    while (Date.now() < deadline) {\n      await sleep(400);', "    while (Date.now() < deadline) {\n      if (ctx?.cancelled?.()) { await chrome.tabs.sendMessage(id, { __hcAsk: 'abort' }).catch(() => {}); return { outcome: 'cancelled', note: 'DSH 已取消' }; }\n      await sleep(400);");
bg = replace(bg, 'async function confirmPay(id, pay) {', 'async function confirmPay(id, pay, ctx) {');
bg = replace(bg, 'pollPanel(id, payTimeout)', 'pollPanel(id, payTimeout, ctx)');
bg = replace(bg, 'confirmPay(id, loc.pay)', 'confirmPay(id, loc.pay, ctx)');
bg = replace(bg, '  async ask(p, tabId) {', '  async ask(p, tabId, ctx) {');
bg = replace(bg, 'const panel = pollPanel(id, timeout);', 'const panel = pollPanel(id, timeout, ctx);');
// Brand only user-facing text; internal DOM markers remain compatible with the reused executor.
bg = replace(bg, '// 组名是品牌字不是彩色圆点 emoji（花叔定的：色块图标丑）。它同时是「这个组\n// 是我们建的」的指纹。旧版组名用过身份 emoji，验指纹时兼容一阵子——\n// 不兼容的话，升级前建的组会因为指纹对不上而永远摘不掉。',
  '// 只识别本版创建的铁花组；旧花叔组由用户取消分组，不做迁移。');
bg = replace(bg, "const GROUP_TITLE = '花叔';", "const GROUP_TITLE = '铁花';");
bg = replace(bg, 'const groupTitleOk = (title, sid) => title === GROUP_TITLE || title === identityOf(sid).emoji;',
  'const groupTitleOk = (title) => title === GROUP_TITLE;');
bg = bg.replaceAll('huashu-chrome：', '铁花dsh浏览器助手：')
  .replaceAll("'huashu-chrome'", "'铁花dsh浏览器助手'")
  .replaceAll('huashu-chrome 需要你搭把手', '铁花需要你搭把手')
  .replaceAll('icons/icon128.png', 'icons/tiehua128.png')
  .replaceAll('Tiehua 设置', '铁花设置');
fs.writeFileSync('extension/background.js', bg);
// A consistent blue identity for tab groups, page edges and the action cursor.
// Shape and the existing session code still distinguish individual tasks.
const identity = read('extension/identity.js');
const identityHeader = `// Adapted from huashu-chrome under MIT; see NOTICE and LICENSE.
// 铁花统一使用蓝色。任务由圆/方标记、名称和会话编号区分。
// Chrome 标签组使用内置 blue；页内标记使用对应的 #3b82f6。
export const MARK_PALETTE = [
  { emoji: '🔵', color: '#3b82f6', group: 'blue' },
  { emoji: '🟦', color: '#3b82f6', group: 'blue' },
];

`;
fs.writeFileSync('extension/identity.js', identityHeader + identity.slice(identity.indexOf('// 标签栏标题前缀')));
let mark = read('extension/mark.js')
  .replaceAll('huashu-chrome 需要你搭把手', '铁花需要你搭把手')
  .replaceAll('#f97316', '#3b82f6');
// Page overlays draw an embedded bitmap on canvas so strict page img-src rules
// cannot block the brand icon. Keep this asset aligned with the extension icons.
const embeddedAvatar = mark.match(/const AVATAR_B64 = '[A-Za-z0-9+/=]+';/);
if (!embeddedAvatar) throw new Error('Upstream overlay icon target missing');
mark = replace(mark, embeddedAvatar[0], `const AVATAR_B64 = '${fs.readFileSync('extension/icons/tiehua48.png').toString('base64')}';`);
mark = replace(mark, '花叔 Q 版头像（渔夫帽+圆眼镜），64px 圆形裁剪 PNG。内嵌 base64 而不是',
  '铁花鲸鱼图标，与扩展共用 tiehua48.png。内嵌 base64 而不是');
mark = replace(mark, '.ava { border-radius: 50%; border: 1.5px solid transparent; flex: none; background: #fff; }',
  '.ava { border-radius: 5px; border: 1.5px solid transparent; flex: none; background: transparent; }');
mark = mark.replaceAll('是花叔的分身在请你搭把手', '铁花助手的品牌图标');
fs.writeFileSync('extension/mark.js', mark);
let offscreen = read('extension/offscreen.js');
offscreen = replace(offscreen, 'const PORTS = [8899, 8900, 8901, 8902, 8903];', '// One local DSH endpoint, no manual pairing.');
offscreen = replace(offscreen, 'const races = PORTS.map(', 'const races = [who.port || 17891].map(');
offscreen = replace(offscreen, '({ connected: fresh(), lastRx, bridge: bridgeVersion })',
  '({ connected: fresh(), lastRx, bridge: bridgeVersion, port: fresh() ? Number(new URL(ws.url).port) : null })');
fs.writeFileSync('extension/offscreen.js', offscreen);
const manifest = JSON.parse(read('extension/manifest.json'));
delete manifest.key; // Separate extension identity and storage from upstream.
manifest.name = '铁花dsh浏览器助手';
manifest.version = '0.1.0.12';
manifest.version_name = '0.1.0-alpha.12';
manifest.description = '连接 DeepSeek Harness 原生铁花插件，操作当前浏览器。';
manifest.action.default_title = '铁花dsh浏览器助手';
manifest.icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/tiehua${size}.png`]));
manifest.action.default_icon = { 16: 'icons/tiehua16.png', 32: 'icons/tiehua32.png' };
// Compare the display versions consistently during handshake.
bg = fs.readFileSync('extension/background.js', 'utf8').replaceAll('chrome.runtime.getManifest().version', '(chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version)');
fs.writeFileSync('extension/background.js', bg);
fs.writeFileSync('extension/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Adapted Chrome executor and extracted tool metadata. MCP runtime excluded.');
