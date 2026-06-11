#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# wechat-control — Installation script
# ============================================================================
# Symlinks scripts into ~/.claude/ and creates the runtime data directory.
# ============================================================================

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
SKILL_DIR="${CLAUDE_DIR}/skills/wechat-control"
COMMANDS_DIR="${CLAUDE_DIR}/commands"
DATA_DIR="${HOME}/.wechat-claude-code"

echo "Installing wechat-control..."

# Create directories
mkdir -p "${SKILL_DIR}/src"
mkdir -p "${COMMANDS_DIR}"
mkdir -p "${DATA_DIR}"

# Copy source files
cp "${REPO_DIR}/src/wechat-control.mjs"     "${SKILL_DIR}/src/"
cp "${REPO_DIR}/src/context-collector.mjs"  "${SKILL_DIR}/src/"
cp "${REPO_DIR}/src/permission-queue.mjs"   "${SKILL_DIR}/src/"

# Copy skill definition
cp "${REPO_DIR}/SKILL.md" "${SKILL_DIR}/"

# Symlink Claude Code commands
for cmd in wechat-control-on wechat-control-off wechat-control-status; do
  src="${REPO_DIR}/.claude/commands/${cmd}.md"
  dst="${COMMANDS_DIR}/${cmd}.md"
  if [ ! -f "${dst}" ]; then
    cp "${src}" "${dst}"
    echo "  → Installed command: ${cmd}"
  else
    echo "  ⚠  Command already exists (skipped): ${cmd}"
    echo "     ${dst}"
  fi
done

echo ""
echo "✅ wechat-control installed!"
echo ""
echo "📁 Scripts:    ${SKILL_DIR}/src/"
echo "📁 Commands:   ${COMMANDS_DIR}/"
echo "📁 Data:       ${DATA_DIR}/"
echo ""
echo "📋 Available commands in Claude Code:"
echo "   /wechat-control-on        Enable remote control"
echo "   /wechat-control-off       Disable remote control"
echo "   /wechat-control-status    Check current status"
echo ""
echo "🔧 Run directly: node ${SKILL_DIR}/src/wechat-control.mjs {on|off|status}"
