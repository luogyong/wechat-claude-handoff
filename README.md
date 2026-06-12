# wechat-claude-handoff

> 让你的 Claude Code 会话在终端和微信之间无缝切换。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)

`wechat-control` 是一个轻量级工具集，让你可以在微信中远程控制终端里的 Claude Code 会话。离开电脑时开启，在手机上继续工作；回到电脑时关闭，无缝接续。

---

## 🔥 与 wechat-claude-code 的两大关键区别

如果你已经了解 [wechat-claude-code](https://github.com/luogyong/wechat-claude-code)（增强 fork），以下是 **你必须知道** 的两个核心差异：

### 1. 🪟 Windows 用户开箱即用

wechat-claude-code 官方推荐的启动命令为 `npm run daemon -- start`。

**这个命令在 Windows 上无法工作。** 它依赖 Unix 的 daemon 进程机制，Windows 没有等效实现。许多 Windows 用户在这一步卡住，不知道如何启动服务。

wechat-control 为 Windows 用户提供了完整的 **PM2** 替代方案：
- 用 `pm2 start` 管理桥接服务进程
- 通过 `pm2-windows-service` 一键配置 **开机自启动**
- 重启电脑后服务自动恢复，无需手动干预

> 详见 [安装 → 设置开机自动启动](#1-安装-wechat-claude-code-桥接服务)

### 2. 🔗 接管当前会话，而非另起新对话

这是 wechat-control 解决的核心痛点。

| 能力 | wechat-claude-code 原生 | wechat-control |
|------|--------------------------|----------------|
| 微信端对话 | **另起新的 Claude 会话** | **接管桌面端当前会话** |
| 上下文 | 全新的，不知道终端在做什么 | 自动采集终端上下文（分支、文件等） |
| 工作流 | 两个独立对话，各自为政 | 同一对话，双向同步 |
| 回到终端 | 需要手动翻阅微信记录 | 自动生成对话镜像，一键恢复 |

**具体来说：** 你在桌面端重构代码到一半，想用手机继续——如果直接用 wechat-claude-code，微信端的 Claude 是一个空白新对话，完全不知道你在做什么。而 wechat-control 的 `/wechat-control-on` 会**接管当前会话**：自动采集 Git 状态、最近文件、项目信息注入微信端，让 Claude 无缝接续你在桌面端的工作。

```text
[原生 wechat-claude-code]
桌面端会话 A ←─ 割裂 ─→ 微信端会话 B（全新对话，无上下文）

[wechat-control 加持后]
桌面端会话 A ←─ 同一条 ─→ 微信端接管会话 A（自动同步上下文）
```

---

## 目录

- [🔥 与 wechat-claude-code 的两大关键区别](#-与-wechat-claude-code-的两大关键区别)
- [为什么需要这个](#为什么需要这个)
- [工作原理](#工作原理)
- [前置条件](#前置条件)
- [🚀 快速安装](#-快速安装)
- [手动安装](#手动安装)
  - [1. 安装 wechat-claude-code 桥接服务](#1-安装-wechat-claude-code-桥接服务)
  - [2. 安装 wechat-claude-handoff 工具集](#2-安装-wechat-claude-handoff-工具集)
  - [3. 配置 Claude Code 命令](#3-配置-claude-code-命令)
- [快速开始](#快速开始)
- [命令参考](#命令参考)
  - [终端命令](#终端命令)
  - [微信端命令](#微信端命令)
- [典型工作流](#典型工作流)
  - [通勤/外出模式](#通勤外出模式)
  - [紧急修复模式](#紧急修复模式)
  - [巡检模式](#巡检模式)
- [文件结构](#文件结构)
- [权限确认队列（串行化）](#权限确认队列串行化)
- [高级用法](#高级用法)
  - [编程集成](#编程集成)
  - [实时查看镜像](#实时查看镜像)
  - [权限审批配合](#权限审批配合)
- [故障排除](#故障排除)
- [与 wechat-claude-code 的关系](#与-wechat-claude-code-的关系)
- [更新日志](#更新日志)
- [许可](#许可)

---

## 为什么需要这个

### 痛点

你在终端里使用 Claude Code 处理复杂任务——重构代码、分析数据、调试问题。然后必须离开电脑。

- **通勤路上**：想继续刚才的思路，但看不到终端
- **外出就餐**：同事反馈了一个问题，想快速检查
- **紧急 bug**：人不在电脑前，但需要立刻查看状态
- **会议中**：突然想到一个关键修改，想立刻执行

### 解决方案

`wechat-control` 实现了一个**双向开关**：

```
[终端 Claude Code]  ←→  [微信消息桥接]  ←→  [手机微信]
```

- **开启**：微信消息会转发到终端 Claude Code 执行，结果返回微信
- **关闭**：恢复正常终端操作，不受微信干扰
- **上下文同步**：开启时自动采集当前状态（Git 分支、项目信息、最近文件），让微信端的你了解当前在做什么

---

## 工作原理

### 核心机制：Flag 文件

```
~/.wechat-claude-code/wechat-control.flag
```

原理极其简单：
- **文件存在 → 远程控制开启** → wechat-claude-code 桥接服务进入 remote-control 模式
- **文件不存在 → 远程控制关闭** → 桥接服务正常工作模式

整个系统的控制流程：

```
┌─────────────────────────────────────────────────────────────┐
│                      wechat-control                         │
│                                                             │
│  ┌──────────────────┐       ┌──────────────────────────────┐│
│  │  终端 Claude Code │       │     wechat-claude-code       ││
│  │                  │  flag │     桥接服务 (PM2)            ││
│  │  /wechat-        │──────→│                              ││
│  │  control-on      │  read │  ├─ 检测 flag 是否存在        ││
│  │                  │       │  ├─ 是→远程控制模式            ││
│  │  /wechat-        │  mirror│ ├─ 否→正常消息处理            ││
│  │  control-off     │←──────│  └─ 镜像对话到文件             ││
│  │                  │       │                              ││
│  │  /wechat-        │       │  ◀── WeChat API ──── 手机微信││
│  │  control-status  │       └──────────────────────────────┘│
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### 三份核心文件

| 文件 | 用途 | 格式 |
|------|------|------|
| `wechat-control.flag` | 控制开关（存在=开，消失=关） | JSON |
| `terminal-mirror.md` | 微信对话镜像，终端可回顾 | Markdown |
| `context-sync.md` | 终端上下文快照，微信可了解现状 | Markdown |

---

## 前置条件

`wechat-control` 本身不处理微信协议——它依赖于 [wechat-claude-code](https://github.com/luogyong/wechat-claude-code)（增强 fork）桥接服务。两种安装方式的区别：

| 组件 | 作用 | 必须？ |
|------|------|--------|
| wechat-claude-code 桥接 | 微信消息收发、Claude SDK 集成 | ✅ 必须 |
| wechat-control 工具集 | Flag 管理、上下文采集、开关控制 | ⭐ 本仓库 |

系统要求：
- **Node.js >= 18**
- **PM2**（推荐全局安装：`npm install -g pm2`）
- **一个个人微信账号**（用于扫码绑定）
- **wechat-claude-code 桥接服务**（见下文安装）

---

## 🚀 快速安装

**把下面这段话复制给 Claude Code，它会自动完成全部安装：**

> 请帮我安装 wechat-claude-handoff（一个微信远程控制 Claude Code 的工具）。
>
> 步骤：
>
> 1. 克隆 <https://github.com/luogyong/wechat-claude-handoff> 到 ~/.claude/skills/wechat-claude-handoff
> 2. 运行其中的 install.sh
> 3. 克隆 <https://github.com/luogyong/wechat-claude-code>（增强 fork，含 wechat-control 集成优化）到 ~/.claude/skills/wechat-claude-code
> 4. 进入 wechat-claude-code 目录，执行 npm install，然后 npm run setup（扫码绑定微信）
> 5. 用 PM2 启动桥接服务：pm2 start dist/main.js --name wechat-claude-code && pm2 save
> 6. 如果是 Windows，配置 pm2-windows-service 实现开机自启动
> 7. 完成后运行 node ~/.claude/skills/wechat-claude-handoff/src/wechat-control.mjs status 确认状态
>
> 安装完成后，在终端或微信端输入 `/wechat-control-on` 均可开启远程控制，离开电脑后通过微信继续当前会话。

---

## 手动安装

### 1. 安装 wechat-claude-code 桥接服务

此仓库**不包含**微信协议部分。你需要先安装桥接服务：

> ⚠️ **Windows 用户特别注意**：wechat-claude-code 官方文档中使用的启动命令为
> `npm run daemon -- start`，但该命令依赖 Unix daemon 机制，**在 Windows 上无法工作**。
> Windows 用户必须使用 PM2 来管理桥接服务进程。请按以下步骤操作：

```bash
# 进入项目目录
cd ~/.claude/skills/wechat-claude-code

# 安装依赖并编译
npm install

# 首次运行 setup 扫码绑定微信
npm run setup

# 启动 PM2 守护进程（Windows 必须用此方式）
pm2 start dist/main.js --name wechat-claude-code
pm2 save
```

**设置开机自动启动（Windows）：**

PM2 支持配置为 Windows 服务，实现开机自启动：

```bash
# 1. 安装 pm2-windows-service（需管理员权限运行 PowerShell/CMD）
npm install -g pm2-windows-service

# 2. 安装 Windows 服务
pm2-service-install -n "PM2"

# 3. 保存当前进程列表（确保 wechat-claude-code 已在运行）
pm2 save

# 4. 启动 Windows 服务
net start PM2
```

> 此后每次开机，PM2 会自动启动并恢复所有已保存的进程（包括 wechat-claude-code）。
>
> **macOS/Linux 用户**：使用 `pm2 startup` 命令即可：
> ```bash
> pm2 startup
> pm2 save
> ```
>
> 详细步骤请参考 [wechat-claude-code](https://github.com/luogyong/wechat-claude-code)（增强 fork）文档。

### 2. 安装 wechat-claude-handoff 工具集

**方式 A：克隆仓库（推荐）**

```bash
git clone https://github.com/luogyong/wechat-claude-handoff.git
cd wechat-control
./install.sh
```

**方式 B：手动安装**

```bash
# 1. 创建目录
mkdir -p ~/.claude/skills/wechat-control/src

# 2. 复制脚本
cp src/wechat-control.mjs    ~/.claude/skills/wechat-control/src/
cp src/context-collector.mjs ~/.claude/skills/wechat-control/src/
cp SKILL.md                  ~/.claude/skills/wechat-control/

# 3. 复制命令文件
cp .claude/commands/*.md     ~/.claude/commands/
```

### 3. 配置 Claude Code 命令

安装命令文件后，Claude Code 会自动识别 `/wechat-control-on`、`/wechat-control-off`、`/wechat-control-status` 三个命令。

验证安装：

```bash
node ~/.claude/skills/wechat-control/src/wechat-control.mjs status
```

如果看到格式化的状态输出，说明安装成功。

---

## 快速开始

### 最简工作流

```bash
# 1. 确认桥接服务在运行
pm2 list | grep wechat-claude-code
# → 状态应为 online

# 2. 开启远程控制
/wechat-control-on
# → ✅ WeChat 远程控制已开启
# → 📱 可以通过微信继续当前会话

# 3. 在微信中操作
# 打开微信 → 给机器人发消息 → 正常对话

# 4. 回到终端后关闭
/wechat-control-off
# → ✅ 已关闭
# → 📋 显示远程会话摘要
```

---

## 命令参考

### 终端命令

#### `/wechat-control-on` — 开启远程控制

```bash
# 在 Claude Code 中
/wechat-control-on

# 或直接运行脚本
node ~/.claude/skills/wechat-control/src/wechat-control.mjs on
```

**执行效果：**
1. 检测 PM2 进程是否运行
2. 创建 `wechat-control.flag`（包含开启时间、工作目录）
3. 初始化 `terminal-mirror.md`
4. 输出确认信息

**输出示例：**
```
✅ WeChat 远程控制已开启

📱 现在可以通过微信继续当前会话
📝 对话镜像: ~/.wechat-claude-code/terminal-mirror.md
🔄 上下文同步: ~/.wechat-claude-code/context-sync.md

💡 提示：确保在终端继续工作前先关闭远程控制
   终端: /wechat-control-off
```

---

#### `/wechat-control-off` — 关闭远程控制

```bash
/wechat-control-off

# 或直接运行脚本
node ~/.claude/skills/wechat-control/src/wechat-control.mjs off
```

**执行效果：**
1. 删除 `wechat-control.flag`
2. 读取 `terminal-mirror.md` 提取最近会话摘要
3. 输出远程会话期间的交互记录

**输出示例：**
```
✅ WeChat 远程控制已关闭

📋 远程会话摘要（最近3条交互）:
────────────────────────────────────────────
### 💬 用户 — 2026-06-11T14:52:00.000Z
查看当前 git 分支

### 🤖 Claude — 2026-06-11T14:52:05.000Z
当前在 main 分支，有 1 个未提交更改...

────────────────────────────────────────────

📄 完整记录: ~/.wechat-claude-code/terminal-mirror.md
```

---

#### `/wechat-control-status` — 查看状态

```bash
/wechat-control-status

# 或直接运行脚本
node ~/.claude/skills/wechat-control/src/wechat-control.mjs status
```

**输出示例：**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WeChat Remote Control Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔛 远程控制: ✅ 开启
   开启时间: 2026-06-11T14:50:00.000Z
   初始目录: d:/projects/my-app

📦 PM2 进程: ✅ 运行中

📁 文件状态:
   Flag:    ✅ ~/.wechat-claude-code/wechat-control.flag
   Mirror:  ✅ ~/.wechat-claude-code/terminal-mirror.md
   Context: ✅ ~/.wechat-claude-code/context-sync.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 微信端命令

开启远程控制后，微信端可以直接使用以下命令：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/wechat-control-on` | 从微信开启远程控制 | 自动采集终端上下文回传 |
| `/wechat-control-off` | 关闭远程控制 | 终端退出 remote-control 模式 |
| `/wechat-control-status` | 查看状态 | 远程开关 + 文件健康度 |
| `/status` | 查看会话信息 | 工作目录、模型、远程状态 |
| `/help` | 帮助 | 列出所有可用命令 |
| `/clear` | 清除会话 | 开始新对话 |
| `/cwd <路径>` | 切换工作目录 | `/cwd /home/projects` |
| `/model <名称>` | 切换模型 | `/model claude-sonnet-4-6` |

---

## 典型工作流

### 通勤/外出模式

```
[办公室，准备下班]
┌─────────────────────────────────────┐
│ $ /wechat-control-on                │
│ ✅ 远程控制已开启                    │
│ 📱 通勤路上在微信继续                │
└─────────────────────────────────────┘
                    ↓
[路上，手机微信]
┌─────────────────────────────────────┐
│ 👤 继续刚才的重构工作                 │
│ 🤖 [执行文件编辑...]                 │
│ 👤 运行测试                         │
│ 🤖 npm test 全部通过 ✅              │
└─────────────────────────────────────┘
                    ↓
[到家，回到电脑]
┌─────────────────────────────────────┐
│ $ /wechat-control-off               │
│ ✅ 已关闭                            │
│ 📋 摘要：改了两个文件，测试通过       │
│ 💡 可直接继续工作                    │
└─────────────────────────────────────┘
```

### 紧急修复模式

```
在路上收到报警 → 打开微信 → 远程控制已开 →
┌─────────────────────────────────────┐
│ 👤 检查生产环境错误日志              │
│ 🤖 [查看日志...] 发现是数据库超时     │
│ 👤 增大连接池重启服务                │
│ 🤖 [执行命令...] 已完成 ✅           │
└─────────────────────────────────────┘

→ 回到电脑后查看确认识别完成
```

### 巡检模式

```
┌─────────────────────────────────────┐
│ 👤 /status                          │
│ 🤖 工作目录: d:/project             │
│                                      │
│ 👤 git log --oneline -3             │
│ 🤖 a1b2c3d fix: auth bug            │
│     e4f5g6h feat: add caching       │
│                                      │
│ 👤 查看 CI pipeline 状态            │
│ 🤖 [查询...] 全部通过 ✅            │
└─────────────────────────────────────┘
```

---

## 文件结构

```
F:\program\github\wechat-control/          # 本仓库
├── README.md                              # 本文档
├── SKILL.md                               # Claude Code skill 定义
├── install.sh                             # 安装脚本
├── .gitignore
├── src/
│   ├── wechat-control.mjs                 # ⭐ 核心控制脚本
│   ├── context-collector.mjs              # 上下文自动采集
│   └── permission-queue.mjs               # 🔔 串行权限确认队列
└── .claude/
    └── commands/
        ├── wechat-control-on.md           # 开启命令
        ├── wechat-control-off.md          # 关闭命令
        └── wechat-control-status.md       # 状态命令

安装后的运行时路径：
~/.claude/
├── skills/
│   └── wechat-control/                    # skill 定义和脚本
│       ├── SKILL.md
│       └── src/
│           ├── wechat-control.mjs
│           └── context-collector.mjs
└── commands/
    ├── wechat-control-on.md
    ├── wechat-control-off.md
    └── wechat-control-status.md

~/.wechat-claude-code/                      # 运行时数据（共享）
├── wechat-control.flag                     # 控制标志
├── terminal-mirror.md                      # 对话镜像
├── context-sync.md                         # 上下文同步
├── accounts/                               # 微信账号（由桥接管理）
├── sessions/                               # 会话数据（由桥接管理）
└── logs/                                   # 运行日志（由桥接管理）
```

---

## 权限确认队列（串行化）

### 问题背景

Claude Code 有时会在短时间内连续触发多个权限确认请求（例如连续写文件、执行命令）。默认行为下，这些请求会**同时**推送到微信，导致：

- 用户来不及回复第一条，第二条已弹出
- 第一条超时或被覆盖，导致确权失败
- Claude Code 任务中断

### 解决方案：`permission-queue.mjs`

`src/permission-queue.mjs` 实现了一个**文件级串行队列**：

- 同一时刻只有**一条**权限请求处于"活跃"状态（已发送到微信、等待回复）
- 后续权限请求自动排入队列，等当前请求被确认后再发送下一条
- 超过 **60 秒**未手动确认时，自动默认 **Yes**，并继续处理队列中的下一条

### 队列文件

`~/.wechat-claude-code/permission-queue.json`

```json
{
  "pending": [
    { "id": "uuid", "prompt": "Allow write to /etc/hosts?", "queued_at": "..." }
  ],
  "active": {
    "id": "uuid",
    "prompt": "Allow npm install?",
    "sent_at": "...",
    "timeout_seconds": 60
  },
  "last_result": {
    "id": "uuid",
    "decision": "yes",
    "decided_at": "...",
    "auto": false
  }
}
```

### 桥接集成方式

wechat-claude-code 桥接服务在收到权限请求时调用：

```bash
# 入队一条权限请求（自动激活或排队）
node permission-queue.mjs enqueue "Allow file write to /tmp/foo?"

# 返回值 (JSON):
# { "action": "send_to_wechat", "item": { ... } }   ← 立即发送到微信
# { "action": "queued", "id": "...", "position": 2 } ← 已入队，等待

# 微信用户回复后调用
node permission-queue.mjs respond yes
node permission-queue.mjs respond no

# 桥接每 5s 定时调用（处理超时 + 促发下一条）
node permission-queue.mjs tick

# 查看当前队列状态
node permission-queue.mjs status

# 重置队列（调试用）
node permission-queue.mjs clear
```

### 超时自动 Yes

当 `tick` 检测到活跃请求已超过 60 秒无响应时：

1. 自动将该请求标记为 `decision: "yes"`, `auto: true`
2. 将结果写入 `last_result`
3. 立即从 `pending` 中促发下一条（如有）
4. 返回 `{ "action": "timeout_auto_yes", ... }`，桥接可据此通知 Claude Code 继续执行

---

## 高级用法

### 编程集成

**Shell 脚本检测：**
```bash
if [ -f "$HOME/.wechat-claude-code/wechat-control.flag" ]; then
    echo "⚠️  远程控制已开启，建议关闭后操作"
    exit 1
fi
```

**Python 检测：**
```python
import json, os
from pathlib import Path

flag = Path.home() / '.wechat-claude-code' / 'wechat-control.flag'
if flag.exists():
    data = json.loads(flag.read_text())
    print(f"🔛 远程控制 (开启于 {data['enabled_at']})")
```

**Node.js 检测：**
```javascript
const { existsSync, readFileSync } = require('fs');
const flag = require('path').join(os.homedir(), '.wechat-claude-code', 'wechat-control.flag');

if (existsSync(flag)) {
  const meta = JSON.parse(readFileSync(flag, 'utf-8'));
  console.log(`Remote control active since ${meta.enabled_at}`);
}
```

**Git 钩子集成：** 在 pre-push 钩子中加入检测，防止远程控制期间误推送。

### 实时查看镜像

```bash
# 实时跟踪微信对话
tail -f ~/.wechat-claude-code/terminal-mirror.md

# 带时间戳的简洁视图
watch -n 2 'echo "🔄 远程控制: $(test -f ~/.wechat-claude-code/wechat-control.flag && echo ON || echo OFF)" && tail -5 ~/.wechat-claude-code/terminal-mirror.md'
```

### 权限审批配合

开启远程控制后，终端侧的权限请求会转发到微信：

1. 终端需要执行敏感操作（写文件、运行命令）
2. 权限请求发到微信端
3. 你回复 `y`（允许）或 `n`（拒绝）
4. 60 秒超时自动批准

使用 `/approve on` 开启审批模式（默认仅通知）。

---

## 故障排除

### 1. 远程控制无法开启

```
❌ 错误：wechat-claude-code PM2 进程未运行
```

**解决：**
```bash
pm2 start wechat-claude-code
pm2 save
```

### 2. 远程控制状态与实际不符

Flag 文件可能成为"孤儿"状态。

**解决：**
```bash
# 手动删除 flag
rm ~/.wechat-claude-code/wechat-control.flag

# 确认状态
node src/wechat-control.mjs status
```

### 3. 微信端无法收到回复

**检查：**
```bash
# 查看 PM2 日志
pm2 logs wechat-claude-code --lines 30

# 确认进程运行
pm2 list | grep wechat-claude-code

# 重启服务
pm2 restart wechat-claude-code
```

### 4. 上下文未同步

微信端的 Claude 可能不知道你在终端做什么。

**解决：**
```bash
# 手动采集并写入
node src/context-collector.mjs [cwd] > ~/.wechat-claude-code/context-sync.md
```

### 5. 镜像文件过大

长时间使用可能产生大量 mirror 数据。

**解决：**
```bash
# 关闭远程控制后清理镜像
: > ~/.wechat-claude-code/terminal-mirror.md
```

---

## 与 wechat-claude-code 的关系

```
┌──────────────────────────────────────────────────────────┐
│                   wechat-control (本仓库)                  │
│                                                          │
│  轻量级工具集：flag 管理 + 上下文采集 + 开关控制           │
│  ┌──────────────┐  ┌──────────────────┐                   │
│  │ 控制脚本      │  │ 上下文采集器      │                   │
│  │ (mjs)        │  │ (mjs)            │                   │
│  └──────────────┘  └──────────────────┘                   │
│         ↓                    ↓                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │              wechat-claude-code                    │     │
│  │                                                    │     │
│  │ 完整的微信桥接服务：协议实现 + SDK 集成 + 消息路由   │     │
│  │ 依赖：Node.js, WeChat API, Claude Agent SDK         │     │
│  │ 管理：PM2 守护进程                                   │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

| 维度 | wechat-control（本仓库） | wechat-claude-code |
|------|------------------------|-------------------|
| 职责 | 开关管理、上下文采集 | 微信协议、消息路由 |
| 代码量 | ~200 行，无依赖 | ~2000 行，有依赖 |
| 安装 | 复制脚本即可 | npm install + 编译 |
| 运行时 | 无（仅脚本） | PM2 守护进程 |
| 微信协议 | ❌ 不需要 | ✅ 必须 |
| Claude SDK | ❌ 不需要 | ✅ 必须 |

> 关于两大关键区别（Windows PM2 替代方案、会话接管 vs 另起新对话）的详细说明，
> 请参见文档开头的 [🔥 与 wechat-claude-code 的两大关键区别](#-与-wechat-claude-code-的两大关键区别)。

**简单说：** wechat-control 是"遥控器"，wechat-claude-code 是"电视机"。遥控器不能独立工作，但有遥控器才能远程控制。

---

## 开发指南

### 添加新功能

脚本设计为单一职责：

- `wechat-control.mjs` — 只做 flag 生命周期管理
- `context-collector.mjs` — 只做终端上下文采集

新增采集字段只需修改 `getProjectInfo()`、`getGitInfo()` 等函数。

### 本地测试

```bash
# 测试状态显示（无需 flag）
node src/wechat-control.mjs status

# 需要 PM2 运行才能测试 on
pm2 list  # 确认运行
node src/wechat-control.mjs on
node src/wechat-control.mjs off
```

---

## 更新日志

### v0.1.0 (2026-06-12)

首次发布 wechat-claude-handoff。

- ✅ 双向开关控制（`/wechat-control-on/off`）
- ✅ 自动上下文采集（Git 分支、最近文件、项目信息）
- ✅ 智能会话摘要（关闭时显示最近交互）
- ✅ PM2 进程健康检查
- ✅ 美化的状态输出（emoji + 表格）
- 🔔 串行权限确认队列（`permission-queue.mjs`）— 防止多权限同时推送，60s 超时自动 Yes
- 🪟 Windows 用户完整的 PM2 + 开机自启动方案
- 🔗 接管桌面端当前会话，而非另起新对话

---

## 许可

[MIT](LICENSE)

---

## 相关资源

- [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) — 微信桥接服务（必要依赖）
- [wechat-claude-code (增强 fork)](https://github.com/luogyong/wechat-claude-code) — 含 wechat-control 集成优化、cwd 同步、增强上下文采集
- [Claude Code](https://claude.ai/code) — Anthropic 的终端 AI 助手
- [PM2](https://pm2.keymetrics.io/) — Node.js 进程管理

---

<p align="center">
  <sub>Built with ❤️ for seamless terminal-to-mobile AI development</sub>
</p>
