# Stardew Agent 设计文档

> 状态：第一阶段开发中。本文记录到目前为止讨论定下来的决定，以及还没验证的假设。

## 1. 要解决的问题

同时开着很多 agent 会话（Claude Code、Codex，以后还有 DeepSeek 等）时，很难记住哪个在跑、哪个在等我、哪个已经做完。Stardew Agent 是一个集中管理面板：每个会话是农场里的一块地，一眼就能看出该去照顾哪块。

核心价值是**注意力管理**：不用自己记，农场会告诉你先处理谁。

## 2. 核心比喻：地块状态

| 农场里 | 状态值 | 实际含义 | 你要做的 |
|---|---|---|---|
| 刚播种 | `seeded` | 会话刚启动，还没发第一条消息 | 浇第一次水（发任务） |
| 生长中 | `growing` | agent 正在思考或调用工具；植物大小随活动量长大 | 不用管 |
| 缺水 💧 | `thirsty` | 这一轮结束了，在等你回复 | 浇水 = 回复 |
| 虫害 🐛 | `pest` | 在等权限审批 | 赶虫 = 批准 / 拒绝 |
| 枯萎 🥀 | `withered` | 出错（API 错误、进程异常退出） | 救活或铲掉 |
| 成熟 🎃 | `ripe` | 会话彻底结束（进程正常退出） | 采摘 = 归档 |
| 休眠 💤 | `dormant` | app 重启过，会话进程没在跑，但可以恢复 | 唤醒 = `--resume` |

设计要点：

- **等回复和等审批分开显示**：审批几秒就能处理，回复要动脑子。可以先批量把虫赶完。
- **缺水会随时间枯萎**：等得越久，植物越蔫（10 分钟、30 分钟两档）。一眼能看出哪块地被晾得最久。
- **"这一轮结束"不等于"任务结束"**：`Stop` 只代表在等你；会话进程退出才算成熟可采摘。
- **地块位置固定**：不按状态重排，保留空间记忆。用"下一块"按钮跳到等待最久的地。
- **作物种类 = agent 类型**：Claude 是南瓜，Codex 是蓝莓。

## 3. 地图布局（规划）

- **田地**：按项目 / 仓库分区，用篱笆围起来。
- **图书馆 / 博物馆**：全局知识库，底层是一个 markdown 文件夹。
  - **施肥** = 播种时从知识库选 context（项目说明、个人偏好、规范）一起注入。
  - **采摘** = 自动生成总结放进出货箱，有价值的再收进博物馆。
- **出货箱**：已采摘会话的归档。
- **信箱**：NPC 送来的信（定时任务的报告）。
- **公告栏**：全局待办，比如 agent 留给你的问题。

## 4. NPC（规划）

| NPC | 对应 |
|---|---|
| 村民 | 定时任务（每日汇总、定期巡检），按日程在地图上走动，结果寄到信箱 |
| 祝尼魔 | 常驻自动化 agent，自动处理简单的地（批准安全权限、回"继续"） |
| 镇长 | 管理层 agent：看全局、排优先级、总结进度、帮你开新地 |

好感度 / 信任等级暂不做。

## 5. 昼夜与睡觉模式（规划）

昼夜由用户自己切换：**睡觉 = 用户离线，自动化程度提高**。

- **自动批准**：白名单内的低风险操作（读文件、改项目内文件、跑测试），通过 Claude Code 的 `PermissionRequest` hook 返回 allow。
- **攒到早上**：高风险操作（push、删除、装依赖、联网等）不自动批，变成虫害等起床处理。
- **agent 提问**：自动回复"用户离线，请按最合理的方式继续，并记下你的假设"，或交给镇长判断。
- **起床结算**：昨晚每块地发生了什么、做了哪些假设、还有哪些等你。

白名单第一版写死一个保守版本，之后再做成可配置。

## 6. 产品形态与分发

- **Electron 桌面 app**。公测用户的门槛是"下载、双击、登录"，不能要求开终端。agent 必须在用户电脑上跑（要读写本地代码），所以无论如何都要装一个本地程序。
  - 选 Electron 而不是 Tauri：主进程本身就是 Node，可以直接管理终端进程；Tauri 还要额外塞一个 Node 进程。
  - 界面和后台之间走 Electron IPC，界面不开网络端口。
- **开源**。理由是信任：这个 app 能在用户电脑上执行命令、看到所有 agent 对话。
- 公测前要准备：macOS 签名公证（Apple 开发者账号）、Windows 代码签名、electron-updater + GitHub Releases 自动更新、首次启动引导。
- **命名**：公测时换一个原创产品名。"Stardew Valley" 是 ConcernedApe 的商标；Anthropic 条款也不允许在产品名里用 "Claude Code"。仓库名暂时不变。
- **美术**：风格接近星露谷，但全部原创（当前是代码里定义的像素图），不用星露谷素材。

## 7. 账号与条款

依据 [Claude Code Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)（2026 年 2 月更新）：

- **不允许**：基于 Agent SDK 的第三方产品让用户用 claude.ai 订阅登录；第三方收集、存储或转手 claude.ai 凭证。
- **允许**：用户在**未修改的 Claude Code 程序**里用自己的订阅登录，包括由别的平台托管运行的情况。

因此：

- **Claude**：每块地里运行用户自己安装的原版 Claude Code 命令行程序，登录走 Claude Code 自己的流程，**我们完全不碰账号和凭证**。Agent SDK 版的自定义聊天界面以后只作为 API key 用户的可选项。
- **Codex**：倾向用 `codex app-server`（官方给客户端集成用的 JSON-RPC 接口）。OpenAI 2026 年 9 月推出了 "Sign in with ChatGPT" 第三方接入计划，公测前确认条款；不行就退回内嵌原版终端。
- 我们不是律师，公测前直接联系 Anthropic / OpenAI 确认。在自己的产品里运行 Claude Code 需要同意 Anthropic 商业条款。

## 8. Claude Code 接入（第一阶段）

范围：只管 Claude Code 会话，不管 claude.ai 的普通聊天。

### 8.1 播种

在 app 里选目录和名字，主进程用 node-pty 启动：

```
claude --session-id <uuid> --settings <app 生成的 hooks 配置> [--remote-control <地块名>]
```

- `--session-id`：我们预先生成，方便之后 `--resume`。
- `--settings`：只对这个会话生效的 hooks，不改用户的全局设置。
- `--remote-control`：可选，默认开。开了以后 Claude app（网页、手机）也能接进来实时查看和回复，两边同步。

### 8.2 状态从哪来

hooks 用官方的 HTTP 类型，发到 app 主进程里的本地 hook 服务：

- 只监听 `127.0.0.1`，端口随机。
- 每次启动生成随机 token，通过环境变量传给 Claude Code 进程，hook 请求头里带上；校验 token 和 Host 头。
- 每个进程还带一个 `STARDEW_PLOT_ID` 环境变量，用来对应地块（`/clear` 会换 session id，但地块不变）。
- HTTP hook 连不上时默认不阻塞 Claude，所以 app 出问题也不会卡住会话。
- `SessionStart` 只支持 command 类型的 hook，不支持 HTTP，所以不订阅它；启动和恢复由我们自己的进程事件判断。每个 hook 都带 `session_id`，`/clear` 之后的新 ID 会在下一个 hook 里更新。
- 已用真实的 Claude Code 2.1.304 验证：`UserPromptSubmit`、`StopFailure` 能通过 HTTP 送达，token 和地块 ID 校验正常。

| Hook 事件 | 地块变化 |
|---|---|
| 进程启动（新会话） | 刚播种 |
| 进程启动（`--resume`） | 缺水 |
| `UserPromptSubmit` | 生长中，生长值 +1 |
| `PostToolUse` / `PostToolUseFailure` / `SubagentStop` | 生长中，生长值 +1 |
| `PermissionRequest`、`Notification`（`permission_prompt`） | 虫害 |
| `Notification`（`idle_prompt`、`elicitation_dialog`） | 缺水 |
| `Stop` | 缺水 |
| `StopFailure` | 枯萎 |
| 进程正常退出 | 成熟 |
| 进程异常退出 | 枯萎 |

第一阶段 `PermissionRequest` hook 只上报、不做决定，用户在地里的终端里批准。睡觉模式再让它返回 allow / deny。

### 8.3 直接对话

点开一块地，右侧是这个会话的终端（xterm.js），直接在里面打字。每块地在主进程里保留最近一段终端输出，切换地块时回放。

### 8.4 生命周期

- 会话进程跑在我们的 app 里。**关窗口 = 缩到托盘**，会话继续跑。
- 从托盘退出时会提示；退出后会话停止，地块变成"休眠"。下次打开点"唤醒"，用 `claude --resume <session-id>` 接着聊，Remote Control 会重新连上。
- 在别处开着的会话可以"移栽"进来（按 session id `--resume`），但移栽后不要同时在别处继续聊，否则会分叉。

### 8.5 Remote Control

- 支持 Pro、Max、Team、Enterprise（Team / Enterprise 要管理员开开关）。**API key 登录不支持**，Bedrock / Vertex / Foundry、自定义网关、ZDR / HIPAA 组织也不支持。不满足条件时 `--remote-control` 仍会正常启动交互会话，只是同步不可用。
- 开着时对话记录会存在 Anthropic 服务器上（用于同步），隐私说明里要写清楚。
- 第一次使用会弹一次性确认；新目录会问是否信任。都在内嵌终端里由用户确认。

### 8.6 Claude 桌面 app Code 标签页里的会话（以后）

桌面 app 和命令行是同一个引擎，`~/.claude/settings.json` 里的全局 hooks 对它也生效；对话记录也在同一套存储里。所以以后可以做"只读显示"：用户主动开启后，往全局设置加一个 hook，hook 输入里自带 `session_id`、`cwd`、`transcript_path`。要回复得先在桌面 app 里关掉，再移栽过来。

### 8.7 备选方案：Claude Code 后台会话

Claude Code 的 agent view（研究预览）支持 `claude --bg` 启动由它自己的后台服务托管的会话，关掉终端也照样跑；`claude attach <id>` 接回；`claude agents --json` 是官方支持的外部读取状态的方式，状态（`working` / `blocked` + `waitingFor` / `done` / `failed`）和地块几乎一一对应。

如果它支持 Remote Control，就可以改成"后台会话 + attach"，app 不用常驻。目前文档没写，暂不采用。

## 9. Codex 接入（第一阶段后半）

用 `codex app-server`（JSON-RPC over stdio）：开会话、流式事件、命令执行和改文件的审批请求。审批请求 → 虫害；一轮结束 → 缺水。具体协议实现时再细化。

## 10. 安全

- 渲染进程：`contextIsolation`、`sandbox` 开启，`nodeIntegration` 关闭；preload 只暴露最小 API；主进程校验所有 IPC 参数。
- hook 服务：只监听 127.0.0.1、随机端口、随机 token、校验 Host 头、限制请求体大小。
- 不读取、不存储任何 agent 的登录凭证。
- 以后要加的全局 hooks 必须由用户主动开启，且我们的 app 没运行时不影响 Claude Code。
- 传给命令行的地块名会过滤特殊字符（Windows 上 `.cmd` 启动要经过 cmd.exe，防止命令注入）。

## 11. Windows 注意事项

开发者本人用 Windows，所以 Windows 是第一优先级平台。

- **终端**：node-pty 1.1 自带 Windows x64 / arm64 预编译版本（基于 ConPTY，需要 Windows 10 1809+），不用装 Visual Studio 编译工具。
- **找到 claude 命令**：原生安装是 `claude.exe`，npm 安装是 `claude.cmd`。按 `PATH` + `PATHEXT` 查找，优先 `.exe`；`.cmd` 要经过 `cmd.exe /c` 启动。
- **路径**：用 `path` 模块处理，不手拼 `/`；Claude Code 的数据目录在 `%USERPROFILE%\.claude`。
- **CI**：GitHub Actions 同时在 Ubuntu 和 Windows 上跑类型检查、测试和构建。

## 12. 技术栈与目录

- Electron + electron-vite + React + TypeScript，测试用 Vitest。
- 终端：node-pty（主进程）+ xterm.js（界面）。
- 像素图：代码里用字符矩阵定义，运行时画到 canvas。

```
src/
  shared/      主进程和界面共用的类型、地块状态机（纯函数，有单元测试）
  main/        Electron 主进程
    farm/      农场引擎：地块管理、hook 服务、终端会话、Claude 适配、持久化（不依赖 Electron，可单测）
  preload/     暴露给界面的安全 API
  renderer/    像素农场界面；没有 Electron 时自动进入演示模式（npm run web）
docs/          设计文档
```

## 13. 路线图

1. **第一阶段（进行中）**：Claude 地块——播种、状态、内嵌终端对话、Remote Control、托盘常驻、休眠唤醒、采摘归档、系统通知。
2. Codex 地块（app-server）。
3. 知识库：施肥（播种时注入 context）、采摘时自动总结、出货箱。
4. 睡觉模式与自动审批白名单、起床结算。
5. NPC：定时任务 + 信箱、镇长 agent。
6. 公测准备：签名、自动更新、首次启动引导、改名。
7. 以后：DeepSeek（直接调 API，不控制桌面 GUI）、手机查看（可选、端到端加密）。

## 14. 待验证

- Claude 桌面 app 能否显示通过 Remote Control 接入的会话（文档倾向于能）。
- 桌面 app Code 标签页是否实时写对话记录。
- 后台会话（`claude --bg`）能否开 Remote Control。
- `claude agents --json` 是否包含桌面 app 的会话。
- `PermissionRequest` hook 在交互模式下与终端里的审批框的先后关系。
