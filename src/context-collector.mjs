#!/usr/bin/env node
/**
 * context-collector.mjs — Collects current terminal context for WeChat remote control
 *
 * Gathers:
 * - Project identity (CLAUDE.md upward search, package.json, etc.)
 * - Git state (branch, remote, staged/unstaged/untracked counts, recent commits,
 *   stash count, diff stats)
 * - Recently modified files (via git diff or filesystem fallback)
 * - Claude Code session hints (.remember/now.md, last-session.txt, TODO files)
 *
 * Usage:
 *   node context-collector.mjs [cwd]              — print markdown summary
 *   node context-collector.mjs [cwd] --json       — print JSON
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeExec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      ...options
    }).trim();
  } catch {
    return null;
  }
}

/** Walk upward from dir looking for filename */
function findUpward(dir, filename) {
  let current = dir;
  while (true) {
    const candidate = join(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function getGitInfo(cwd) {
  const info = {};
  info.isRepo = existsSync(join(cwd, '.git'));
  if (!info.isRepo) return info;

  info.branch = safeExec('git branch --show-current', { cwd });
  info.remote = safeExec('git remote get-url origin', { cwd });
  info.status = safeExec('git status --short', { cwd });
  info.statusFiles = info.status
    ? info.status.split('\n').filter(Boolean).map(l => l.trim())
    : [];

  // Staged / unstaged / untracked counts
  const staged = info.statusFiles.filter(l => !l.startsWith('?') && !l.startsWith(' ')).length;
  const unstaged = info.statusFiles.filter(l => l.startsWith(' ') && !l.startsWith('??')).length;
  const untracked = info.statusFiles.filter(l => l.startsWith('??')).length;
  info.changeSummary = { staged, unstaged, untracked };

  info.recentCommits = [];
  const commits = safeExec('git log --oneline -5', { cwd });
  if (commits) info.recentCommits = commits.split('\n').slice(0, 5);

  info.stashCount = 0;
  const stashList = safeExec('git stash list', { cwd });
  if (stashList) info.stashCount = stashList.split('\n').filter(Boolean).length;

  info.diffStat = safeExec('git diff --stat', { cwd });

  return info;
}

function getProjectInfo(cwd) {
  const info = { name: null, type: null, description: null, claudeMdPath: null };

  // Check for CLAUDE.md (upward search)
  const claudeMd = findUpward(cwd, 'CLAUDE.md');
  if (claudeMd) {
    info.claudeMdPath = claudeMd;
    try {
      const content = readFileSync(claudeMd, 'utf-8');
      const heading = content.match(/^#\s+(.+)/m);
      if (heading) info.name = heading[1];
      if (!info.description) {
        const firstPara = content.match(/^##\s+.+?\n\n(.+?)(?:\n\n|$)/ms);
        if (firstPara) info.description = firstPara[1].replace(/\n/g, ' ').slice(0, 200);
      }
    } catch {}
  }

  // Package managers
  if (existsSync(join(cwd, 'package.json'))) {
    info.type = info.type || 'Node.js';
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      if (!info.name) info.name = pkg.name;
      if (!info.description) info.description = pkg.description;
    } catch {}
  }
  if (existsSync(join(cwd, 'tsconfig.json'))) info.type = info.type || 'TypeScript';
  if (existsSync(join(cwd, 'Cargo.toml'))) info.type = 'Rust';
  if (existsSync(join(cwd, 'pyproject.toml'))) info.type = 'Python';
  if (existsSync(join(cwd, 'go.mod'))) info.type = 'Go';
  if (existsSync(join(cwd, 'pom.xml'))) info.type = 'Java/Maven';

  // README
  const readme = findUpward(cwd, 'README.md');
  if (readme && !info.description) {
    try {
      const content = readFileSync(readme, 'utf-8');
      const para = content.match(/^#\s+.+?\n\n(.+?)(?:\n|$)/m);
      if (para) info.description = para[1].slice(0, 200);
    } catch {}
  }

  return info;
}

function getRecentChanges(cwd, gitInfo, limit = 10) {
  if (gitInfo.isRepo) {
    // Use git to find recently changed files (tracked + untracked)
    const changed = safeExec('git diff --name-only HEAD', { cwd });
    const untracked = safeExec('git ls-files --others --exclude-standard', { cwd });
    const all = [
      ...(changed?.split('\n').filter(Boolean) ?? []),
      ...(untracked?.split('\n').filter(Boolean) ?? [])
    ];
    return all.slice(0, limit);
  }

  // Fallback: filesystem scan
  try {
    return readdirSync(cwd)
      .filter(f => !f.startsWith('.') && f !== 'node_modules')
      .map(f => {
        try {
          return { name: f, mtime: statSync(join(cwd, f)).mtime };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(f => f.name);
  } catch {
    return [];
  }
}

function getClaudeSessionHints(cwd) {
  const hints = {};

  // .remember/now.md — recent activity log
  const rememberNow = join(cwd, '.remember', 'now.md');
  if (existsSync(rememberNow)) {
    try {
      const content = readFileSync(rememberNow, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'));
      hints.recentActivity = lines.slice(0, 5).join('; ');
    } catch {}
  }

  // Claude Code last session
  const lastSession = join(homedir(), '.claude', 'last-session.txt');
  if (existsSync(lastSession)) {
    try {
      hints.lastSessionId = readFileSync(lastSession, 'utf-8').trim();
    } catch {}
  }

  // TODO / WIP markers
  const todoFiles = ['TODO.md', 'WIP.md', '.todo', 'TODO'];
  for (const f of todoFiles) {
    const p = join(cwd, f);
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8').slice(0, 500);
        hints.todoFile = { name: f, preview: content };
      } catch {}
      break;
    }
  }

  return hints;
}

// ---------------------------------------------------------------------------
// Main collection
// ---------------------------------------------------------------------------

function collectContext(targetCwd) {
  const cwd = targetCwd || process.cwd();

  const context = {
    timestamp: new Date().toISOString(),
    cwd,
    cwdBasename: cwd.split(/[/\\]/).pop(),
    hostname: safeExec('hostname') || 'unknown',
    user: process.env.USER || process.env.USERNAME || 'unknown',
    platform: process.platform,
  };

  context.git = getGitInfo(cwd);
  context.project = getProjectInfo(cwd);
  context.recentChanges = getRecentChanges(cwd, context.git);
  context.claudeHints = getClaudeSessionHints(cwd);

  return context;
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

function formatContextAsMarkdown(ctx) {
  const lines = [
    '## 当前终端会话上下文',
    '',
    `> 采集时间: ${ctx.timestamp}`,
    `> 主机: ${ctx.hostname} (${ctx.user}@${ctx.platform})`,
    '',
    '### 工作目录',
    `\`${ctx.cwd}\``,
    '',
  ];

  // Project info
  if (ctx.project.type || ctx.project.name) {
    lines.push('### 项目信息');
    if (ctx.project.name) lines.push(`- **项目**: ${ctx.project.name}`);
    if (ctx.project.type) lines.push(`- **类型**: ${ctx.project.type}`);
    if (ctx.project.description) lines.push(`- **描述**: ${ctx.project.description}`);
    if (ctx.project.claudeMdPath) lines.push(`- **上下文文件**: \`${ctx.project.claudeMdPath}\``);
    lines.push('');
  }

  // Git info
  if (ctx.git.isRepo) {
    lines.push('### Git 状态');
    if (ctx.git.branch) lines.push(`- **分支**: ${ctx.git.branch}`);
    if (ctx.git.remote) lines.push(`- **远程**: ${ctx.git.remote}`);
    const cs = ctx.git.changeSummary;
    if (cs) {
      const parts = [];
      if (cs.staged) parts.push(`${cs.staged} staged`);
      if (cs.unstaged) parts.push(`${cs.unstaged} modified`);
      if (cs.untracked) parts.push(`${cs.untracked} new`);
      lines.push(`- **变更**: ${parts.join(', ') || 'clean'}`);
    }
    if (ctx.git.stashCount > 0) lines.push(`- **暂存 (stash)**: ${ctx.git.stashCount} 项`);
    if (ctx.git.recentCommits.length > 0) {
      lines.push('- **最近提交**:');
      ctx.git.recentCommits.forEach(c => lines.push(`  - ${c}`));
    }
    lines.push('');
  }

  // Recent changes
  if (ctx.recentChanges.length > 0) {
    lines.push('### 最近变更文件');
    ctx.recentChanges.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  // Claude session hints
  if (ctx.claudeHints.recentActivity) {
    lines.push('### 最近活动');
    lines.push(ctx.claudeHints.recentActivity);
    lines.push('');
  }
  if (ctx.claudeHints.todoFile) {
    lines.push(`### 待办 (\`${ctx.claudeHints.todoFile.name}\`)`);
    lines.push('```');
    lines.push(ctx.claudeHints.todoFile.preview);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const targetCwd = process.argv[2];
const context = collectContext(targetCwd);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(context, null, 2));
} else {
  console.log(formatContextAsMarkdown(context));
}
