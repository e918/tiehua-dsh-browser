window.__ModuleLoader__.load({id:"tiehua-dsh-browser",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  BrowserSettings: () => BrowserSettings,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var API = "/api/tiehua-browser";
var button = { padding: "8px 13px", borderRadius: 7, border: "1px solid #9faea6", background: "transparent", color: "inherit", cursor: "pointer" };
var card = { border: "1px solid #899b8e55", borderRadius: 12, padding: 18, marginTop: 16 };
async function request(method = "GET", body) {
  const response = await fetch(API, {
    method,
    headers: { "x-tiehua-ui": "1", ...body ? { "content-type": "application/json" } : {} },
    ...body ? { body: JSON.stringify(body) } : {},
    signal: AbortSignal.timeout(8e3)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
function BrowserSettings({ form }) {
  const snapshot = (0, import_react.useSyncExternalStore)((0, import_react.useCallback)((fn) => form.subscribe(fn), [form]), (0, import_react.useCallback)(() => form.getSnapshot(), [form]));
  const [status, setStatus] = (0, import_react.useState)({});
  const [error, setError] = (0, import_react.useState)("");
  const [port, setPort] = (0, import_react.useState)("17891");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    if (snapshot.value?.port) setPort(String(snapshot.value.port));
  }, [snapshot.value?.port]);
  (0, import_react.useEffect)(() => {
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const value = await request();
        if (active) {
          setStatus(value);
          setError("");
        }
      } catch (e) {
        if (active) setError(String(e));
      }
      if (active) timer = setTimeout(poll, 3e3);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const save = async (field, value) => {
    setBusy(true);
    setNotice("");
    try {
      if (!await form.set(field, value)) throw new Error("\u914D\u7F6E\u6CA1\u6709\u4FDD\u5B58\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
      setNotice("\u5DF2\u4FDD\u5B58\uFF0C\u8FDE\u63A5\u72B6\u6001\u5C06\u81EA\u52A8\u66F4\u65B0\u3002");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const action = async (body) => {
    setBusy(true);
    try {
      await request("POST", body);
      setStatus(await request());
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("\u5DF2\u590D\u5236");
    } catch {
      setNotice("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u9009\u4E2D\u6587\u5B57\u624B\u52A8\u590D\u5236\u3002");
    }
  };
  const editable = snapshot.status === "ready" && snapshot.writable !== false && !busy;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { style: { padding: 22, maxWidth: 860, margin: "auto", lineHeight: 1.65 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#6c8b76", fontSize: 12, letterSpacing: 2 }, children: "TIEHUA / BROWSER" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { margin: "3px 0" }, children: "\u6D4F\u89C8\u5668\uFF0C\u63A5\u5165\u4F60\u7684\u5DE5\u4F5C\u6D41" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.7, marginTop: 8 }, children: "DSH \u539F\u751F\u5DE5\u5177 \xB7 \u5F53\u524D\u6D4F\u89C8\u5668\u767B\u5F55\u72B6\u6001 \xB7 \u6309\u4EFB\u52A1\u7ED1\u5B9A\u6807\u7B7E\u9875" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", style: { color: "#c75b42" }, children: error }),
    status.lastError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "alert", style: { color: "#c75b42" }, children: [
      "\u8FDE\u63A5\u670D\u52A1\uFF1A",
      status.lastError
    ] }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: notice }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "flex", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u542F\u7528\u6D4F\u89C8\u5668\u8FDE\u63A5" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", disabled: !editable, checked: snapshot.value?.enabled ?? false, onChange: (e) => void save("enabled", e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 14, display: "flex", gap: 10, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "tiehua-port", children: "\u672C\u673A\u7AEF\u53E3" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { id: "tiehua-port", type: "number", min: 1024, max: 65535, value: port, onChange: (e) => setPort(e.target.value), style: { width: 100, padding: 7 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: button, disabled: !editable || !Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535, onClick: () => void save("port", Number(port)), children: "\u4FDD\u5B58\u7AEF\u53E3" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", marginTop: 16 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", disabled: !editable, checked: snapshot.value?.allowEval ?? false, onChange: (e) => void save("allowEval", e.target.checked) }),
        " \u5141\u8BB8\u5DE5\u5177\u6267\u884C\u9875\u9762 JavaScript"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { style: { opacity: 0.65 }, children: "\u666E\u901A\u8BFB\u53D6\u3001\u70B9\u51FB\u548C\u586B\u8868\u4E0D\u9700\u8981\u5F00\u542F\u6B64\u9879\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u9996\u6B21\u8FDE\u63A5 Chrome" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          "\u6253\u5F00 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "chrome://extensions" }),
          "\uFF0C\u5F00\u542F\u5F00\u53D1\u8005\u6A21\u5F0F\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "\u9009\u62E9\u201C\u52A0\u8F7D\u5DF2\u89E3\u538B\u7684\u6269\u5C55\u7A0B\u5E8F\u201D\uFF0C\u4F7F\u7528\u4E0B\u65B9\u6269\u5C55\u76EE\u5F55\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "\u6269\u5C55\u52A0\u8F7D\u540E\u4F1A\u81EA\u52A8\u8FDE\u63A5\u3002\u8FDE\u63A5\u6210\u529F\u65F6\uFF0C\u5F39\u7A97\u663E\u793A\u5730\u5740\u53CA\u7AEF\u53E3\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowWrap: "anywhere", fontFamily: "monospace", fontSize: 12 }, children: status.extensionPath || "\u7B49\u5F85\u63D2\u4EF6\u4FE1\u606F\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: button, disabled: !status.extensionPath, onClick: () => void copy(status.extensionPath), children: "\u590D\u5236\u6269\u5C55\u76EE\u5F55" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u8FDE\u63A5\u4E0E\u4EFB\u52A1" }),
      !status.browsers?.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { opacity: 0.7 }, children: "\u8FD8\u6CA1\u6709\u6D4F\u89C8\u5668\u8FDE\u63A5\u3002\u52A0\u8F7D \u94C1\u82B1\u6269\u5C55\u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u663E\u793A\u8FDE\u63A5\u72B6\u6001\u3002" }),
      status.browsers?.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "14px 0" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: b.connected ? "#409b69" : "#bd7153" }, children: "\u25CF" }),
          " ",
          b.name,
          " \xB7 ",
          b.connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5",
          " \xB7 ",
          b.version
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { style: { opacity: 0.65 }, children: [
          "\u5B9E\u4F8B ",
          b.id
        ] }),
        b.uncertain > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u6709\u64CD\u4F5C\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5148\u68C0\u67E5\u9875\u9762\u662F\u5426\u5DF2\u7ECF\u6267\u884C\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: button, disabled: busy, onClick: () => void action({ action: "acknowledge", browserId: b.id }), children: "\u6211\u5DF2\u6838\u5B9E\u9875\u9762\uFF0C\u6062\u590D\u64CD\u4F5C" })
        ] })
      ] }, b.id)),
      status.sessions?.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 12, justifyContent: "space-between", marginTop: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { style: { overflowWrap: "anywhere", fontSize: 12 }, children: s.sessionId }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: button, disabled: busy, onClick: () => void action({ action: "release", sessionId: s.sessionId }), children: "\u91CA\u653E\u7ED1\u5B9A" })
      ] }, s.sessionId))
    ] })
  ] });
}
var name = "tiehua-browser-client";
var inject = ["slots", "locale", "configForms"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("settings.tiehua-browser", { zh: { title: "\u94C1\u82B1dsh\u6D4F\u89C8\u5668\u52A9\u624B" }, en: { title: "Tiehua Browser" } }), "Tiehua locale");
  const form = ctx.configForms.get("tiehua-browser");
  ctx.effect(() => ctx.configForms.whileServed(["tiehua-browser"], () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "tiehua-browser",
    order: 45,
    locale: "settings.tiehua-browser",
    label: () => "\u94C1\u82B1dsh\u6D4F\u89C8\u5668\u52A9\u624B",
    inject: () => ({ form })
  }, BrowserSettings)), "Tiehua settings page");
}
return module.exports;}});
//# sourceMappingURL=client.js.map
