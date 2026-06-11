#!/usr/bin/env node
/**
 * permission-queue.mjs — Serial permission confirmation queue for WeChat remote control.
 *
 * Problem: When Claude Code requests multiple permissions in quick succession,
 * they all get pushed to WeChat simultaneously. The user can't respond to the
 * first before the second arrives, causing the first to be missed/rejected.
 *
 * Solution: A file-based queue. The bridge writes pending permissions here.
 * Only ONE permission is "active" (sent to WeChat) at a time. The next is
 * sent only after the user replies OR after a 60-second timeout (auto-Yes).
 *
 * Queue file: ~/.wechat-claude-code/permission-queue.json
 * Structure:
 * {
 *   "pending": [                     // waiting to be sent to WeChat
 *     { "id": "uuid", "prompt": "...", "queued_at": "ISO" },
 *     ...
 *   ],
 *   "active": {                      // currently waiting for WeChat response
 *     "id": "uuid",
 *     "prompt": "...",
 *     "sent_at": "ISO",
 *     "timeout_seconds": 60
 *   } | null,
 *   "last_result": {                 // result of most recently resolved permission
 *     "id": "uuid",
 *     "decision": "yes" | "no",
 *     "decided_at": "ISO",
 *     "auto": true | false           // true = timed out, defaulted to Yes
 *   } | null
 * }
 *
 * Usage (from bridge or Claude Code hook):
 *   node permission-queue.mjs enqueue "Allow file write to /etc/hosts?"
 *   node permission-queue.mjs status
 *   node permission-queue.mjs respond yes       # WeChat user replied yes
 *   node permission-queue.mjs respond no        # WeChat user replied no
 *   node permission-queue.mjs tick              # Called periodically to handle timeouts
 *   node permission-queue.mjs clear             # Reset the queue
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = join(homedir(), '.wechat-claude-code');
const QUEUE_FILE = join(DATA_DIR, 'permission-queue.json');
const DEFAULT_TIMEOUT_SECONDS = 60;

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

function readQueue() {
  if (!existsSync(QUEUE_FILE)) {
    return { pending: [], active: null, last_result: null };
  }
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
  } catch {
    return { pending: [], active: null, last_result: null };
  }
}

function writeQueue(q) {
  writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}

/**
 * Promote the first pending item to active.
 * Returns the newly active item (or null if queue is empty).
 */
function promoteNext(q) {
  if (q.active !== null || q.pending.length === 0) return null;
  const next = q.pending.shift();
  q.active = {
    id: next.id,
    prompt: next.prompt,
    queued_at: next.queued_at,
    sent_at: new Date().toISOString(),
    timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
  };
  return q.active;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const cmd = process.argv[2] || 'status';

// ------ enqueue ------
if (cmd === 'enqueue') {
  const prompt = process.argv[3];
  if (!prompt) {
    console.error('Usage: permission-queue.mjs enqueue "<permission prompt>"');
    process.exit(1);
  }

  const q = readQueue();
  const item = { id: randomUUID(), prompt, queued_at: new Date().toISOString() };
  q.pending.push(item);

  // If nothing is active, promote immediately
  const activated = promoteNext(q);
  writeQueue(q);

  if (activated) {
    // Output the prompt so the bridge knows to send it to WeChat NOW
    console.log(JSON.stringify({ action: 'send_to_wechat', item: activated }));
  } else {
    // Output that it was queued
    console.log(JSON.stringify({ action: 'queued', id: item.id, position: q.pending.length }));
  }

// ------ respond ------
} else if (cmd === 'respond') {
  const decision = (process.argv[3] || '').toLowerCase();
  if (decision !== 'yes' && decision !== 'no') {
    console.error('Usage: permission-queue.mjs respond <yes|no>');
    process.exit(1);
  }

  const q = readQueue();
  if (!q.active) {
    console.log(JSON.stringify({ action: 'no_active', message: 'No active permission to respond to' }));
    process.exit(0);
  }

  const resolved = q.active;
  q.last_result = {
    id: resolved.id,
    prompt: resolved.prompt,
    decision,
    decided_at: new Date().toISOString(),
    auto: false,
  };
  q.active = null;

  // Promote next if any
  const next = promoteNext(q);
  writeQueue(q);

  const out = { action: 'resolved', id: resolved.id, decision, auto: false };
  if (next) out.next = { action: 'send_to_wechat', item: next };
  console.log(JSON.stringify(out));

// ------ tick ------
} else if (cmd === 'tick') {
  // Called periodically (e.g. every 5s) by the bridge to handle timeouts
  const q = readQueue();
  if (!q.active) {
    // Nothing active — try to promote
    const next = promoteNext(q);
    if (next) {
      writeQueue(q);
      console.log(JSON.stringify({ action: 'send_to_wechat', item: next }));
    } else {
      console.log(JSON.stringify({ action: 'idle' }));
    }
    process.exit(0);
  }

  // Check timeout
  const sentAt = new Date(q.active.sent_at).getTime();
  const elapsed = (Date.now() - sentAt) / 1000;
  if (elapsed >= q.active.timeout_seconds) {
    // Auto-Yes timeout
    const resolved = q.active;
    q.last_result = {
      id: resolved.id,
      prompt: resolved.prompt,
      decision: 'yes',
      decided_at: new Date().toISOString(),
      auto: true,
      elapsed_seconds: Math.round(elapsed),
    };
    q.active = null;

    const next = promoteNext(q);
    writeQueue(q);

    const out = {
      action: 'timeout_auto_yes',
      id: resolved.id,
      elapsed_seconds: Math.round(elapsed),
    };
    if (next) out.next = { action: 'send_to_wechat', item: next };
    console.log(JSON.stringify(out));
  } else {
    // Still waiting
    console.log(JSON.stringify({
      action: 'waiting',
      id: q.active.id,
      elapsed_seconds: Math.round(elapsed),
      remaining_seconds: Math.round(q.active.timeout_seconds - elapsed),
    }));
  }

// ------ status ------
} else if (cmd === 'status') {
  const q = readQueue();
  console.log('━'.repeat(60));
  console.log('Permission Queue Status');
  console.log('━'.repeat(60));

  if (q.active) {
    const sentAt = new Date(q.active.sent_at).getTime();
    const elapsed = Math.round((Date.now() - sentAt) / 1000);
    const remaining = Math.max(0, q.active.timeout_seconds - elapsed);
    console.log(`\n🔔 等待微信确权 (${elapsed}s 已过 / ${remaining}s 后自动 Yes):`);
    console.log(`   ${q.active.prompt}`);
  } else {
    console.log('\n✅ 无待确认权限');
  }

  if (q.pending.length > 0) {
    console.log(`\n⏳ 队列中 (${q.pending.length} 条待发送):`);
    q.pending.forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.prompt}`);
    });
  }

  if (q.last_result) {
    const icon = q.last_result.decision === 'yes' ? '✅' : '❌';
    const autoTag = q.last_result.auto ? ' (超时自动)' : '';
    console.log(`\n📋 上次结果: ${icon} ${q.last_result.decision.toUpperCase()}${autoTag}`);
    console.log(`   ${q.last_result.prompt}`);
  }

  console.log('\n━'.repeat(60));

// ------ clear ------
} else if (cmd === 'clear') {
  writeQueue({ pending: [], active: null, last_result: null });
  console.log('✅ 权限队列已清空');

} else {
  console.error(`❌ 未知命令: ${cmd}`);
  console.error('用法: node permission-queue.mjs {enqueue|respond|tick|status|clear}');
  process.exit(1);
}
