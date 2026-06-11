---
name: wechat-control
description: WeChat remote control — enable/disable remote Claude Code session control from WeChat
---

# wechat-control Skill

Seamlessly hand off your terminal Claude Code session to WeChat, or take it back.

## Overview

The **wechat-control** system lets you switch between terminal-only and
WeChat-enabled modes for your Claude Code sessions. When remote control is
**on**, every WeChat message is forwarded to the terminal Claude Code process,
and the conversation is mirrored to `terminal-mirror.md` for the terminal
user to follow. When **off**, the terminal operates normally.

## Prerequisites

- [wechat-claude-code](https://github.com/your-org/wechat-claude-code) bridge
  installed and running (via PM2)
- Node.js >= 18
- A valid WeChat account bound to the bridge

## How It Works

```
┌──────────────┐    flag file     ┌──────────────────┐
│  Terminal    │  ─────────────→  │  wechat-claude-   │
│  Claude Code │  reads/writes    │  code bridge      │
│              │                  │  (PM2 daemon)     │
│  /wechat-    │  ◀─────────────  │                   │
│  control-on  │   mirror file    │  ┌─────────────┐  │
│              │                  │  │  WeChat API  │  │
│              │                  │  └─────────────┘  │
└──────────────┘                  └──────────────────┘
```

1. A **flag file** (`~/.wechat-claude-code/wechat-control.flag`) controls the
   mode: exists = ON, absent = OFF.
2. An optional **context sync** file informs the WeChat side about terminal
   session state (project, git branch, recent files).
3. A **mirror file** records the WeChat conversation for the terminal user
   to review when they return.

## Commands

### Terminal side (Claude Code)

| Command | Script | Effect |
|---------|--------|--------|
| `/wechat-control-on` | `src/wechat-control.mjs on` | Enable remote control |
| `/wechat-control-off` | `src/wechat-control.mjs off` | Disable + show summary |
| `/wechat-control-status` | `src/wechat-control.mjs status` | Show current state |

### WeChat side

Once enabled, these commands are available inside WeChat (handled by the
wechat-claude-code bridge):

| Command | Effect |
|---------|--------|
| `/wechat-control-on` | Enable remote control from WeChat (auto-collects context) |
| `/wechat-control-off` | Disable remote control |
| `/wechat-control-status` | Show current state |
| `/help` | List all available WeChat commands |
| `/status` | Show session status (also shows remote control state) |

## Files

| File | Purpose |
|------|---------|
| `~/.wechat-claude-code/wechat-control.flag` | Control flag (JSON with metadata) |
| `~/.wechat-claude-code/terminal-mirror.md` | WeChat conversation mirror |
| `~/.wechat-claude-code/context-sync.md` | Context snapshot for WeChat side |

## Usage: Triggered Flow

When the user says something like:
- "I need to leave, want to continue from my phone"
- "Open remote control so I can use WeChat"
- "停掉远程控制"
- "开启微信远程控制"

### Enable remote control

1. Run `node path/to/wechat-control/src/wechat-control.mjs on`
2. Collect context: `node path/to/wechat-control/src/context-collector.mjs > ~/.wechat-claude-code/context-sync.md`
3. Tell the user remote control is active and they can continue from WeChat

### Disable remote control

1. Run `node path/to/wechat-control/src/wechat-control.mjs off`
2. Read the mirror file for a summary of what happened
3. Give the user a structured handoff summary
