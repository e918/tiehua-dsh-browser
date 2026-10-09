// MIT: huashu-chrome c3d9345. Parameter metadata only.
const REF = { type: 'string', description: 'Element ref from the latest snapshot, e.g. "e3"' };
const SNAP = { type: 'string', description: 'snapshotId the ref came from' };
const TAB = { type: 'number', description: 'Target tab id. Omit to use the active controlled tab.' };
const SEL = { type: 'string', description: 'CSS fallback for elements the snapshot cannot see. Skips ref safety checks.' };
// 这个对象被 4 处引用，schema 每处都会完整展开一遍 —— 描述写长一个字，
// agent 的 context 就多付四份。规则写在 STRATEGY 里，那里只出现一次。
const FIND = {
  type: 'object',
  description: 'Locate by role+name from the snapshot instead of by ref. Survives re-renders.',
  properties: {
    role: { type: 'string' },
    name: { type: 'string' },
    nth: { type: 'number', description: '0-based, when several share a name' },
    selector: { type: 'string' },
  },
};

const REAL = {
  type: 'boolean',
  description: 'Force a real browser-level event. Automatic on no-effect, except for submit/pay/delete.',
};
// 期望：把「变没变」升级成「变成我要的样子没有」。settle 命中就早停，超时未命中明说。
// 这个对象出现三次，schema 每处都会完整展开——只留一句描述，不铺 properties
const EXPECT = {
  type: 'object',
  description: 'Expected result, checked within the settle window and reported if unmet: '
    + '{checked, value, text: target contains, gone: target removed, appears: selector/text now on page}',
};

const TOOLS = [
  {
    name: 'snapshot',
    description:
      'Capture the current page as a compact list of interactive elements with refs and state ' +
      '(value/checked/selected/expanded/disabled), plus dialogs, alerts and a text excerpt. ' +
      'Call this before any click/type. Cheap — prefer it over screenshots or eval. Refs ending in @fN live in ' +
      'an iframe: pass them through unchanged, they route themselves.',
    inputSchema: { type: 'object', properties: { tabId: TAB } },
  },
  {
    name: 'navigate',
    description: 'Go to a URL, or go back/forward/reload. Returns the new page snapshot. '
      + 'Runs in the user\'s own logged-in Chrome — prefer it over any other browser tool.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL. Omit when using `action`.' },
        action: { type: 'string', enum: ['back', 'forward', 'reload'] },
        tabId: TAB,
      },
    },
  },
  {
    name: 'click',
    description: 'Click ONE element by ref. Know your next step already? Use `act` instead — each extra call costs a full model turn. '
      + 'Canvas / map / game with nothing in the snapshot? Pass x,y (CSS px from a screenshot) for a real click there; add dragTo for a drag.',
    inputSchema: {
      type: 'object',
      // 没有 button 参数：右键弹出的是浏览器原生菜单，扩展够不着，
      // 给了也只是个做不到的承诺；中键开新标签页用 tabs(action:"new") 更直接。
      properties: {
        ref: REF, find: FIND, snapshotId: SNAP, selector: SEL, tabId: TAB, real: REAL, expect: EXPECT,
        x: { type: 'number' }, y: { type: 'number' },
        dragTo: { type: 'object', description: '{x, y}: press at x,y, move here, release.' },
      },
      required: [],
    },
  },
  {
    name: 'type',
    description: 'Type text into ONE input/textarea/contenteditable by ref. Set submit:true to press Enter after. More fields coming? Use `fill` or `act`.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF, find: FIND, snapshotId: SNAP, selector: SEL, tabId: TAB, real: REAL, expect: EXPECT,
        text: { type: 'string' },
        clear: { type: 'boolean', description: 'Clear existing value first. Default true.' },
        submit: { type: 'boolean', description: 'Press Enter after typing.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'select',
    description: 'Choose an option in a <select> by ref. `value` matches the option value or its visible label. ' +
      'Custom dropdowns (react-select, MUI, Element UI) are NOT <select>: click to expand, read the options ' +
      'from the snapshot, click one.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, find: FIND, snapshotId: SNAP, tabId: TAB, value: { type: 'string' }, expect: EXPECT },
      required: ['value'],
    },
  },
  {
    name: 'fill',
    description:
      'Fill a whole form in ONE call, all refs from the same snapshot. Field: {ref, text} for inputs, ' +
      '{ref, value} for <select>, {ref, check} for checkbox/radio. submit:true submits after ' +
      '(skipped if any field failed).',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string' },
              text: { type: 'string' },
              value: { type: 'string' },
              check: { type: 'boolean' },
              clear: { type: 'boolean', description: 'Default true — replaces existing content.' },
            },
          },
        },
        submit: { type: 'boolean' },
        submitRef: { type: 'string', description: 'Which button to click for submit. Defaults to the form submit button.' },
        snapshotId: SNAP,
        tabId: TAB,
      },
      required: ['fields', 'snapshotId'],
    },
  },
  {
    name: 'key',
    description:
      'Press a key: Escape, Enter, Tab, arrows (custom dropdowns), Backspace/Delete, or a combo. ' +
      'Without ref it goes to whatever is focused. For entering text use type.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          description: 'KeyboardEvent key ("Escape", "Enter", "Tab", "ArrowDown"), or with modifiers '
            + '("ctrl+a", "shift+Tab"). Pass an array to send a sequence in one call: ["Tab","Tab","Enter"].',
          anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
        ref: { ...REF, description: 'Optional: focus this element first. Omit to send to the focused element.' },
        snapshotId: SNAP,
        tabId: TAB, real: REAL,
        repeat: { type: 'number', description: 'Press N times (e.g. ArrowDown ×3). Max 50.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'read_text',
    description:
      'Extract the main readable content of the page as markdown, with boilerplate stripped. ' +
      'Use for reading articles/docs; use snapshot when you need to interact.',
    inputSchema: {
      type: 'object',
      properties: { tabId: TAB, format: { type: 'string', enum: ['markdown', 'text'] } },
    },
  },
  {
    name: 'screenshot',
    description:
      'Screenshot the controlled tab, background tabs included. Prefer snapshot / read_text — ' +
      'they cost far less. Returned at 60% scale as JPEG by default; full:true for 1:1 PNG (e.g. to read small text or measure pixels).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: TAB, ref: REF, snapshotId: SNAP,
        focus: { type: 'boolean', description: 'Bring the tab forward first. Interrupts the user — ask before using.' },
        savePath: { type: 'string', description: 'Absolute path to write the image instead of returning it inline.' },
        full: { type: 'boolean', description: 'Full-resolution PNG instead of the scaled JPEG.' },
      },
    },
  },
  {
    name: 'tabs',
    description:
      'List / open / switch / close tabs. New tabs open in the BACKGROUND and become the controlled tab — ' +
      'the user keeps looking at whatever they were on. Everything except screenshot works fine on a background tab. ' +
      'Each agent session has its OWN controlled tab; omitting tabId uses this session\'s. ' +
      'Selecting a tab another session operates warns, not blocks. ' +
      'With 2+ work-lines (a subagent, two accounts) pass tabId explicitly on EVERY call — the implicit slot ' +
      'is shared with subagents and a sibling can move it. Label each tab; recover the mapping via action:"list".',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'new', 'select', 'close'] },
        url: { type: 'string' },
        tabId: TAB,
        label: { type: 'string', description: 'With new/select: what this tab is for ("CRM import — batch 2"). Shown in list, page panel, and to the user.' },
        focus: { type: 'boolean', description: 'Also bring the tab to the foreground. Interrupts the user — off by default.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'wait',
    description: 'Wait until a selector appears, text shows up, or the network goes idle. Use after actions that load content.',
    inputSchema: {
      type: 'object',
      properties: {
        for: { type: 'string', enum: ['selector', 'text', 'idle'] },
        value: { type: 'string', description: 'CSS selector or text to wait for. Omit for idle.' },
        timeout: { type: 'number', description: 'Milliseconds, default 10000.' },
        tabId: TAB,
      },
      required: ['for'],
    },
  },
  {
    name: 'network',
    description:
      'START HERE when you need DATA rather than an action. Lists the XHR/fetch calls the page made, then returns ' +
      'one response body via `body:"<url fragment>"`. Real field names, real numbers, paging as a parameter. ' +
      'Add reload:true if nothing was captured yet. Never guess an endpoint name from memory — list first, ' +
      'pick by response size. One page\'s API messy? Another page on the same site often exposes the same data cleanly.',
    inputSchema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Only list requests whose URL contains this.' },
        body: { type: 'string', description: 'Return the full response body of the latest request matching this URL fragment.' },
        index: { type: 'number', description: 'With `body`: which match, counting back from the newest. 0 = latest (default), 1 = one before it. Paged endpoints differ only by a cursor, so walk this to collect every batch.' },
        reload: { type: 'boolean', description: 'Reload the page first to capture requests made during load.' },
        maxBody: { type: 'number', description: 'Truncate the body at this many chars. Default 120000.' },
        tabId: TAB,
      },
    },
  },
  {
    name: 'fetch',
    description:
      'Call a URL from inside the page, carrying the user\'s cookies. Use after `network` reveals an API. ' +
      'Paged endpoint? Pass `pages`: it walks every page in ONE call — never loop fetch by hand, each loop turn ' +
      'costs a model round. ALWAYS check the paging object in the response, servers silently cap page size. ' +
      '403/406 means the site signs its requests: do NOT forge them; drive the site\'s own pagination UI and ' +
      'read via `network`. Same-origin rules apply.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        init: { type: 'object', description: 'fetch() init: method, headers, body. credentials are already included.' },
        pages: {
          type: 'object',
          description: 'Auto-paginate: {param:"page", from?, step?, max?} or {cursorParam:"cursor", cursorPath:"data.next_cursor", max?}. '
            + 'Stops on non-2xx, empty/identical body, empty cursor, or max (default 10, cap 50). '
            + 'With savePath: one JSON line per page + summary; else bodies inline up to maxBody.',
        },
        binary: { type: 'boolean', description: 'Fetch bytes (images, files) instead of text. Requires savePath. Runs from the extension so cross-origin image hosts work; add via:"page" if a host checks Referer.' },
        via: { type: 'string', enum: ['page', 'extension'], description: 'Where the request originates. Binary defaults to extension (no CORS limits); text always uses the page (carries session).' },
        savePath: { type: 'string', description: 'Absolute path to write to. Required with binary.' },
        maxBody: { type: 'number' },
        tabId: TAB,
      },
      required: ['url'],
    },
  },
  {
    name: 'scroll',
    description:
      'Scroll to load more of a lazy list. Auto-detects inner scroll containers, stops early once height ' +
      'stops growing. Prefer network/fetch for bulk data. Background tabs render no frames, so an ' +
      'IntersectionObserver-driven list may refuse to grow — the tool says so when it happens.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', enum: ['bottom', 'top'] },
        times: { type: 'number', description: 'Repeat count, max 50. Default 1.' },
        wait: { type: 'number', description: 'ms between scrolls, default 700.' },
        ref: REF, snapshotId: SNAP, tabId: TAB,
      },
    },
  },
  {
    name: 'download',
    description:
      'LAST RESORT — if Chrome asks where to save each file, this lands a save dialog on the USER screen. ' +
      'Try first: `fetch` binary+savePath → same with via:"page" → real URL from `network` + fetch. ' +
      'Only if all three fail, `ask` listing what you tried. Rules: skill ch.4.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        savePath: { type: 'string', description: 'Absolute destination path. The file is moved there after the browser finishes.' },
        timeout: { type: 'number', description: 'ms, default 120000.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'upload',
    description:
      'Attach a local file to the page (no extension can touch the OS file picker). Open the upload UI first. ' +
      'Auto-picks a matching file input; for editors that only accept drag-and-drop (X Article, Notion) ' +
      'pass dropSelector instead. Any size via a file input (browser reads the path); drag-drop caps at 48MB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the local file.' },
        selector: { type: 'string', description: 'CSS selector of the file input. Omit to auto-detect by accept type.' },
        dropSelector: { type: 'string', description: 'Drop the file onto this element instead. Use when the page has no file input.' },
        tabId: TAB,
      },
      required: ['path'],
    },
  },
  {
    name: 'query',
    description:
      'Extract structured data by CSS selector (lists, tables), or FIND BY TEXT with `contains`: every visible ' +
      'element whose text includes it, with a selector path and the ref it sits in — use it instead of eval to ' +
      'check "is X on the page", read a status label, or find a dropdown option. For lists pass ' +
      '`html:true` first to inspect markup, then `extract`: field → sub-selector, "@attr" for attributes, ' +
      'e.g. {title:".name", link:"a@href"}.',
    inputSchema: {
      type: 'object',
      properties: {
        contains: { type: 'string', description: 'Text to find (case-insensitive); selector then only scopes the search.' },
        selector: { type: 'string', description: 'CSS selector for the repeating row/card element.' },
        extract: { type: 'object', description: 'field → sub-selector (optionally "sel@attr"). Omit to get plain text per match.' },
        html: { type: ['boolean', 'number'], description: 'Return outerHTML of matches instead, to inspect structure. true = 1200 chars each.' },
        limit: { type: 'number', description: 'Max matches, default 100.' },
        tabId: TAB,
      },
    },
  },
  {
    name: 'act',
    description:
      'Your DEFAULT way to act — batch every step you can predict (on form wizards, nearly all). '
      + 'Each step is effect-checked, ONE snapshot returns at the end; every call you merge saves a full '
      + 'model turn. Stops early on no-effect / failure / submit-pay-delete controls. `read` {ref|find|selector, '
      + 'attr?} or {contains} brings an observation back mid-batch. Blocks (one level): '
      + '`repeat` {steps,until,max} for pagination/load-more; `if` {cond,then,else} for optional banners; '
      + '`assert` {cond} stops unless the page matches. cond = {urlContains|selectorExists|textContains, '
      + 'not} (OR-ed), or {ref|selector, checked|value|text} for one element. Inside repeat use find/selector, '
      + 'never ref. Elsewhere: ref until the page re-renders, find after.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Up to 20 steps, executed in order.',
          items: {
            type: 'object',
            properties: {
              do: { type: 'string', enum: ['click', 'type', 'select', 'fill', 'key', 'wait', 'scroll', 'navigate', 'read', 'repeat', 'if', 'assert'] },
              ref: REF, find: FIND, selector: SEL,
              text: { type: 'string', description: 'for type' },
              contains: { type: 'string', description: 'for read: find visible text' },
              attr: { type: 'string', description: 'for read: also report this attribute (value, checked, href…)' },
              expect: { type: 'object', description: 'for click/type/select: same as the expect param; unmet = stop' },
              value: { type: 'string', description: 'for select' },
              key: { description: 'for key', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              fields: { type: 'array', items: { type: 'object' }, description: 'for fill' },
              url: { type: 'string', description: 'for navigate' },
              for: { type: 'string', enum: ['selector', 'text', 'idle'], description: 'for wait' },
              timeout: { type: 'number' },
              times: { type: 'number', description: 'for scroll' },
              to: { type: 'string', enum: ['bottom', 'top'], description: 'for scroll' },
              steps: { type: 'array', items: { type: 'object' }, description: 'for repeat: sub-steps, no ref/no nesting' },
              until: { type: 'object', description: 'for repeat: stop condition, checked after each pass' },
              max: { type: 'number', description: 'for repeat: pass cap, default 10 max 25' },
              cond: { type: 'object', description: 'for if/assert' },
              then: { type: 'array', items: { type: 'object' }, description: 'for if' },
              else: { type: 'array', items: { type: 'object' }, description: 'for if, optional' },
            },
            required: ['do'],
          },
        },
        snapshotId: SNAP,
        allowSensitive: {
          type: 'boolean',
          description: 'Let the batch run through a submit/pay/delete control instead of stopping at it. '
            + 'Off by default on purpose — say so explicitly and it gets recorded in the audit log.',
        },
        tabId: TAB,
      },
      required: ['steps'],
    },
  },
  {
    name: 'ask',
    description:
      'Hand control back to the user for one step, then continue. For captcha, QR login, SMS/OTP, or any '
      + 'confirmation that should be a human decision. Brings the tab forward, shows a panel, highlights your '
      + 'targets, sends a desktop notification, and blocks until the user acts. Use it instead of retrying '
      + 'a step that needs a human. A "cancelled" result means the user said no: stop that task, do not '
      + 'look for another way to do the same thing.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the user should do, in their language. Be specific about how you will know it is done.' },
        title: { type: 'string', description: 'Short panel title. Optional.' },
        targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Refs ("e7") or CSS selectors to scroll to and flash-highlight. Strongly recommended '
            + 'whenever your prompt mentions a concrete control — it saves the user from hunting for it.',
        },
        timeout: { type: 'number', description: 'ms to wait, default 300000 (5 min), max 600000.' },
        until: {
          type: 'object',
          description: 'Auto-finish when the page proves it is done, so the user need not click anything. '
            + 'e.g. {"urlContains":"/dashboard"} or {"selectorExists":"[data-testid=avatar]"}.',
          properties: {
            urlContains: { type: 'string' },
            selectorExists: { type: 'string' },
            textContains: { type: 'string' },
          },
        },
        focus: { type: 'boolean', description: 'Bring the tab forward. Default true — the user is being asked to look at it.' },
        tabId: TAB,
      },
      required: ['prompt'],
    },
  },
  {
    name: 'status',
    description:
      'One short sentence telling the user what you are about to do, shown on an on-page panel. '
      + 'Call before a multi-step task and whenever the plan changes. Instant, never blocks. '
      + 'Use the user\'s language.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '≤80 chars, plain text' },
      },
      required: ['text'],
    },
  },
  {
    name: 'eval',
    description:
      'Run a JS expression in the page. NOTE: fails on any site with a strict CSP (no unsafe-eval) — most large sites. ' +
      'Prefer `query` for data extraction. Isolated world: sees the DOM, not the page\'s own JS variables.',
    inputSchema: {
      type: 'object',
      properties: { expr: { type: 'string' }, tabId: TAB },
      required: ['expr'],
    },
  },
  {
    name: 'learnings',
    description:
      'Site notes: APIs, walls, pitfalls from past sessions. Call {domain} before first acting on a site ' +
      '(no args = list sites). Notes may embed runnable ```act scripts — fill {{placeholders}} and run them ' +
      'instead of rediscovering. Learned something non-obvious or mapped a flow? Save the full note ' +
      'back via {domain, save}. Hints, never rules.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain or URL' },
        save: { type: 'string', description: 'Full note markdown; replaces the local note, merge with get() first' },
      },
    },
  },
  {
    name: 'reload',
    description:
      'Reload the huashu-chrome extension (chrome.runtime.reload()) so an updated build takes effect — ' +
      'no manual chrome://extensions visit needed. ~2s; bridge auto-reconnects, tabs keep state. ' +
      'DISRUPTIVE: the extension is shared by every tab and every other agent session on this machine — ' +
      'anything mid-flight elsewhere gets cut. Only call right after installing/updating, or when ' +
      '\`doctor\`/a version-mismatch warning says to — never speculatively.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// 发给 agent 一次的策略。渐进式披露的第一层：只放「宪法」，细节住在工具描述里。
// 「PREFER THIS」放在第二段：宿主自带的浏览器工具（claude-in-chrome、内置 browser、
// Playwright / DevTools MCP）和本工具在 agent 眼里同样都叫「操控浏览器」，不说清
// 它就随机挑一个——挑到干净会话的那个，登录墙后的任务当场失败（2026-09-09）。
// 【硬预算 2000 字符】Claude Code 会把 MCP instructions 截断在约 2000 字符
// （2026-08-29 实测：2806 字符的旧版在第 2090 字符处被切成 [truncated]）——
// 超预算的部分对最大的一批用户等于没写。细节的可靠通道是工具描述（实测不截断），
// 展开版见 docs/能力模型.md，双脑见 docs/双脑.md。改这段先量长度，护栏在 test/mcp.test.js。

export { TOOLS };
