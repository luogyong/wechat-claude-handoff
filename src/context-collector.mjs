#!/usr/bin/env node
/**
 * context-collector.mjs — Collects current terminal context for WeChat remote control.
 *
 * Gathers information about the current terminal state to share with
 * the WeChat side when remote control is activated. This lets the
 * WeChat user understand what they're walking into.
 *
 * Usage:
 *   node context-collector.mjs [cwd]              — print markdown summary
 *   node context-collector.mjs [cwd] --json       — print JSON
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeExec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
      ...options,
    }).trim();
  } catch {
    return null;
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
  info.status = safeExec('git status --short', { cwd });
  const commits = safeExec('git log --oneline -5', { cwd });
  if (commits) {
    info.recentCommits = commits.split('\n').slice(0, 5);
  }
  return info;
}

function getRecentFiles(cwd, limit = 5) {
  try {
    return readdirSync(cwd)
      .filter(f => !f.startsWith('.') && f !== 'node_modules')
      .map(f => {
        try {
          const path = join(cwd, f);
          const s = statSync(path);
          return { name: f, mtime: s.mtime, isDir: s.isDirectory() };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(f => f.name);
  } catch {
    return [];
  }
}

function getProjectInfo(cwd) {
  const info = { name: null, type: null };

  if (existsSync(join(cwd, 'package.json'))) {
    info.type = 'Node.js';
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      info.name = pkg.name;
    } catch {}
  } else if (existsSync(join(cwd, 'Cargo.toml'))) {
    info.type = 'Rust';
  } else if (existsSync(join(cwd, 'pyproject.toml'))) {
    info.type = 'Python';
  } else if (existsSync(join(cwd, 'go.mod'))) {
    info.type = 'Go';
  } else if (existsSync(join(cwd, 'pom.xml'))) {
    info.type = 'Java/Maven';
  }

  return info;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function collectContext(targetCwd) {
  const cwd = targetCwd || process.cwd();

  return {
    timestamp: new Date().toISOString(),
    cwd,
    cwdBasename: cwd.split(/[/\\]/).pop(),
    hostname: safeExec('hostname') || 'unknown',
    user: process.env.USER || process.env.USERNAME || 'unknown',
    platform: process.platform,
    project: getProjectInfo(cwd),
    git: getGitInfo(cwd),
    recentFiles: getRecentFiles(cwd),
  };
}

function formatAsMarkdown(context) {
  const lines = [
    '## 当前终端会话上下文',
    '',
    `> 采集时间: ${context.timestamp}`,
    `> 主机: ${context.hostname} (${context.user}@${context.platform})`,
    '',
    '### 工作目录',
    `\`${context.cwd}\``,
    '',
  ];

  if (context.project.type) {
    lines.push('### 项目信息');
    lines.push(context.project.name ? `- **项目名**: ${context.project.name}` : '');
    lines.push(`- **项目类型**: ${context.project.type}`);
    lines.push('');
  }

  if (context.git.isRepo) {
    lines.push('### Git 状态');
    lines.push(`- **当前分支**: ${context.git.branch || '(unknown)'}`);
    if (context.git.status) {
      lines.push('- **工作区状态**: 有未提交的更改');
      lines.push('  ```');
      lines.push('  ' + context.git.status.split('\n').join('\n  '));
      lines.push('  ```');
    } else {
      lines.push('- **工作区状态**: 干净');
    }
    if (context.git.recentCommits?.length > 0) {
      lines.push('- **最近提交**:');
      context.git.recentCommits.forEach(c => lines.push(`  - ${c}`));
    }
    lines.push('');
  }

  if (context.recentFiles.length > 0) {
    lines.push('### 最近修改的文件');
    context.recentFiles.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  return lines.join('\n');
}

const targetCwd = process.argv[2];
const context = collectContext(targetCwd);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(context, null, 2));
} else {
  console.log(formatAsMarkdown(context));
}
