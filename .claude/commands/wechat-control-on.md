---
name: wechat-control-on
description: Enable WeChat remote control — allows continuing this terminal session from WeChat
---

## wechat-control-on

Enable WeChat remote control mode. This:
1. Creates a flag file (`~/.wechat-claude-code/wechat-control.flag`)
2. Initializes a conversation mirror file
3. (Optional) Auto-collects terminal context for the WeChat side

### Steps

1. **Run the control script**:
   ```bash
   node path/to/wechat-control/src/wechat-control.mjs on
   ```

2. **Auto-generate context sync file** (recommended):
   ```bash
   node path/to/wechat-control/src/context-collector.mjs [cwd] > ~/.wechat-claude-code/context-sync.md
   ```

3. **Confirm to the user**:
   - ✅ Remote control is now active
   - 📱 They can continue this conversation from WeChat
   - 🔄 Context has been synced
   - 💡 Remind them to run `/wechat-control-off` when returning to terminal

### Error handling

- If PM2 process is not running, the script will report the error and suggest `pm2 start wechat-claude-code`
- If the wechat-claude-code bridge is not installed, instruct the user to set it up first
