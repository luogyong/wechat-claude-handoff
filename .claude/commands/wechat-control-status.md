---
name: wechat-control-status
description: Check WeChat remote control status and system health
---

## wechat-control-status

Check whether WeChat remote control is active and the overall system health.

### Steps

1. **Run the control script**:
   ```bash
   node ~/.claude/skills/wechat-control/src/wechat-control.mjs status
   ```

   The output shows:
   - Remote control state (on/off)
   - PM2 process status
   - File system status (flag, mirror, context-sync)

2. **Report findings**:
   - If remote control is active, mention when it was enabled and from which directory
   - If PM2 is not running, suggest `pm2 start wechat-claude-code`
   - If files are missing, suggest checking the installation
