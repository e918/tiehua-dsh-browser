// Adapted from huashu-chrome under MIT; see NOTICE and LICENSE.
// 铁花统一使用蓝色。任务由圆/方标记、名称和会话编号区分。
// Chrome 标签组使用内置 blue；页内标记使用对应的 #3b82f6。
export const MARK_PALETTE = [
  { emoji: '🔵', color: '#3b82f6', group: 'blue' },
  { emoji: '🟦', color: '#3b82f6', group: 'blue' },
];

// 标签栏标题前缀的尾哨兵，U+2009 窄空格。
//
// v0.9.1 起标题前缀已退役（favicon 头像取代，mark.js 不再写它），这两个导出
// 只服务一件事：popup 的会话列表在升级瞬间可能读到旧页面残留的带前缀标题，
// stripMarkPrefix 负责把它剥干净。等一轮版本过去后可以整体删除。
export const MARK_SENTINEL = '\u2009';

// 认前缀只认哨兵，不认 emoji 列表：后者会在调色板加新颜色的那天悄悄失效。
// 位置上限是防呆——万一某个站点的标题真的用了 U+2009，也不会正好在最前面。
export function stripMarkPrefix(title) {
  const s = String(title || '');
  const i = s.indexOf(MARK_SENTINEL);
  return i >= 0 && i <= 12 ? s.slice(i + 1) : s;
}

// FNV-1a。选它不是因为快，是因为它短到可以原样抄进任何一侧，
// 且在不同 JS 引擎上结果一模一样——外观必须在扩展、桥、测试里算出同一个值。
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// claude-code → Claude Code；已经带大写的是显示名（iFlow、OpenClaw），原样通过
export function prettyClient(client) {
  const c = String(client || '').trim();
  if (!c || c === 'unknown') return 'AI agent';
  if (/[A-Z]/.test(c)) return c;
  return c.split(/[-_\s]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// sid 的形状是 `<client>:p<ppid>`（见 src/lib/rpc.js）。冒号后那截就是短码——
// 它是 agent 进程的父 pid，用户能拿它对上自己的终端窗口，比一个哈希出来的
// 随机串有用得多。宿主自定义 sessionId 时没有这个结构，退回取尾部。
export function identityOf(sid, client) {
  const s = String(sid ?? '');
  const i = s.indexOf(':');
  const slug = client || (i > 0 ? s.slice(0, i) : '');
  const code = i >= 0 && i < s.length - 1 ? s.slice(i + 1) : s.slice(-6);
  const p = MARK_PALETTE[hash32(s) % MARK_PALETTE.length];
  return { sid: s, emoji: p.emoji, color: p.color, group: p.group, label: prettyClient(slug), code };
}
