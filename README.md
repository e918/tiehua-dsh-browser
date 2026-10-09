# 铁花dsh浏览器助手

在 DeepSeek Harness 桌面端用自然语言操作已登录的 Chrome。DSH 原生插件负责工具、配置、会话和连接，Chrome 扩展执行页面读取、点击、填表与截图。

**一个 DSH 会话可以操作多个标签页。** 例如在同一段聊天中读取 BI 报表、核对参考文章，再把结果写入公众号编辑器。

当前版本：`0.1.0-alpha.11`。按本机 **DSH 0.2.0-rc.2** 的接口开发。20 项自动化测试及编译产物集成检查通过；尚未在日常 DSH 客户端与实际 Chrome 中完成端到端联调。

## 安装

### 1. 添加 DSH 插件

在 DSH 的插件管理页面选择“添加插件”，在“包名或地址”中填写本地安装包的完整路径，例如：

```text
D:\projects\tiehua-dsh-browser\artifacts\tiehua-dsh-browser-0.1.0-alpha.11.tgz
```

开发时也可以填写已完成构建的项目目录：

```text
D:\projects\tiehua-dsh-browser
```

此包没有发布到 npm，直接输入包名无法从 npm 安装。安装需要 DSH 能取得 `ws` 等 npm 依赖。本版本声明的 DSH peer dependencies 为 `0.2.0-rc.2`；其他版本需先适配和验证。

安装并启用后，在设置的插件配置中打开 **铁花dsh浏览器助手**。页面提供启用开关、端口、页面 JavaScript 执行开关、扩展目录和连接状态。

### 2. 加载 Chrome 扩展

1. 在 铁花设置中复制“扩展目录”。本项目开发目录为 `D:\projects\tiehua-dsh-browser\extension`；通过安装包安装后，以设置页显示的路径为准。
2. 打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选中该目录。
3. 扩展加载后自动连接本机 DSH。连接成功时，弹窗显示绿色连接图标、实际连接地址与端口、插件版本。首次安装使用端口 `17891`，已有自定义端口设置继续使用。
4. DSH 设置中出现“已连接”后，在聊天里说：“用 Tiehua 列出标签页。”

无需启动 MCP 服务、额外 daemon 或 Playwright 进程。本机 WebSocket 连接由 DSH 插件自动启动和停止。浏览器访问网站继续使用浏览器自己的网络与代理配置。

更新 DSH 插件后，在 `chrome://extensions` 重新加载扩展，并刷新正在使用的网页。若 DSH 仍显示旧设置页，重启 DSH。

已保存的端口配置不会被覆盖。使用默认端口时，两端应统一为 `17891`；DSH 端口可在插件设置中修改，浏览器扩展移除后重新加载可恢复默认端口。

## 在一个会话中操作多个页面

可以直接这样说：

> 用 Tiehua 列出标签页。读取 BI 报表页和那篇参考文章，对比数据，先在对话里给我一个公众号大纲。

工具层的具体操作示例（这里的标签页 ID 仅为示例，应先从列表取得实际 ID）：

```text
tiehua_browser_tabs({ action: "list" })
tiehua_browser_tabs({ action: "select", tabId: 11, label: "BI 报表" })
tiehua_browser_tabs({ action: "select", tabId: 22, label: "参考文章" })
tiehua_browser_read_text({ tabId: 11 })
tiehua_browser_read_text({ tabId: 22 })
```

每个会话拥有一组标签页，另有一个默认标签页。`select` 和 `new` 更新默认页；带 `tabId` 的操作直接使用指定页。多页面任务建议始终指定 `tabId`。用户手动切换 Chrome 前台标签不会改变会话默认页。

标签页列表用 `*` 表示本会话默认页，`+` 表示本会话的其他页，`×` 表示其他会话占用的页。首次操作应先列出并选择页面，或新建页面；插件不把用户当前浏览的页面自动交给新任务。

其他会话不能直接接管正在占用的页。原会话可以调用 `tiehua_browser_tabs({ action: "release" })`，或在设置中释放绑定。释放保留打开的网页，并清除原会话的默认页和占用记录；之后需要重新选择页面。释放需要浏览器在线，且当前会话没有在途或结果未知的操作。

同一浏览器内的工具命令排队执行，避免多个操作同时改变页面。多个 Chrome 实例连接时，先查看 `tiehua_browser_status`，用 `browserId` 明确选择实例；后续会话沿用该实例。不同实例中的标签页 ID 不能混用。

## 工具

以下名称统一带 `tiehua_browser_` 前缀，共 23 个工具。

| 用途 | 名称 |
|---|---|
| 连接与页面 | `status`、`tabs`、`navigate`、`reload` |
| 观察 | `snapshot`、`read_text`、`query`、`screenshot` |
| 页面操作 | `click`、`type`、`select`、`fill`、`key`、`scroll`、`wait`、`act` |
| 数据与文件 | `network`、`fetch`、`download`、`upload` |
| 人工介入与经验 | `ask`、`learnings`、`eval` |

`status` 返回原生连接状态。`act` 支持步骤批处理。`eval` 默认关闭，需要在设置中开启。截图通过 DSH 原生附件服务返回；模型需要支持图片才能理解图片内容，也可提供绝对 `savePath` 保存文件。

工具仍通过 DSH 的标准工具运行时调用；权限与批准流程取决于当前 DSH 配置。网页文字、网络返回和历史站点经验是待核实的数据。

## 连接、数据与限制

- WebSocket 仅监听 `127.0.0.1`，校验回环地址、本机 Host、Chrome 扩展 Origin、握手扩展 ID 和协议版本。普通网页、无 Origin 或远程来源不能连接。本机自动连接模式信任本机进程和已安装的 Chrome 扩展，不提供远程接入。端口被占用会在设置中显示原因。DSH 端口需与扩展使用的端口一致；扩展弹窗不再提供端口编辑。
- 断线或超时后，原生连接层不会重放已发送命令。结果未知时，先读取页面核实，再在设置中点击“我已核实页面，恢复操作”。取消请求不能撤销已经发生的点击或提交。
- 会话到浏览器的关联由当前插件实例维护。DSH 重启后，先重新查看并确认标签页；不要依靠重启来判断上一步是否成功。
- 默认数据目录是 `DSH_HOME/tiehua-browser`；未设置 `DSH_HOME` 时使用 `~/.dsh/tiehua-browser`。其中 `learnings/` 保存本机站点经验；新安装不再生成配对文件。
- 文件输出要求绝对路径，已有文件不覆盖。下载到指定路径采用复制，保留浏览器原下载文件。拖放上传回退的大小上限是 48 MB。
- DOM 操作复用 huashu-chrome 执行器；CDP 输入与截图、任务控制标记默认启用，升级沿用已保存的设置，弹窗只展示连接状态。Chrome 系统页、扩展商店等受保护页面无法按普通网页操作；复杂 iframe、图表和站点行为仍需实际验证。
- 首次使用 `network` 时，执行器可能刷新页面以捕获请求；有未保存内容时先处理。批处理取消会尽力阻止后续步骤，已经发给浏览器的单步操作可能继续完成。
- 目前没有专门的 DSH 标签页管理面板或自媒体工作台。标签页由聊天工具管理，设置页管理连接与会话；后续原生插件可以复用 `ctx.tiehuaBrowser` 服务。

## 开发

需要 Node.js `>=22.19`，建议 Node.js 24，以及 npm。

```powershell
cd D:\projects\tiehua-dsh-browser
npm ci
npm run check
npm pack --pack-destination artifacts
```

`check` 包括 TypeScript 检查、20 项测试、宿主与客户端构建，以及编译产物集成检查。集成检查启动隔离的 Cordis/DSH 工具运行时、本机临时连接端口和模拟扩展，不修改日常 DSH profile。

目录说明、通信方式和后续任务见 [架构说明](docs/architecture.md)。

## 来源与许可

浏览器执行器、工具参数定义和内置站点经验基于 [huashu-chrome](https://github.com/alchaincyf/huashu-chrome) `1.2.1`，固定源码提交 `c3d9345284cf3ab5ee7a4eb11685f2f09c0876f0`。保留上游 MIT 许可和来源声明，详见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)。

DSH 宿主、连接管理、工具适配与设置页面为本项目实现。工具描述从上游提取，但运行路径不引入 MCP 客户端或 MCP 服务端。`scripts/adapt-upstream.mjs` 可从固定的本地上游 checkout 重现扩展改动；升级上游时需重新审查、构建和验证。
