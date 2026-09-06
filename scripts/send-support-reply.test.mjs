import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function preview(text) {
  const run = spawnSync(process.execPath, [new URL('./send-support-reply.mjs', import.meta.url).pathname,
    '--to', 'preview@example.com', '--subject', 'Preview', '--text', text, '--dry-run'],
    { env: { ...process.env, RESEND_API_KEY: 'preview-only' }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).payload;
}

test('tracked links are clickable with readable labels and intact destinations', () => {
  const payload = preview('Try [View the demo](https://autolister.app/?utm_source=margeo&utm_medium=partner).');
  assert.match(payload.html, /<a href="https:\/\/autolister.app\/\?utm_source=margeo&amp;utm_medium=partner"[^>]*>View the demo<\/a>/);
  assert.doesNotMatch(payload.html, /\[View the demo\]/);
});

test('bare URLs become links without exposing query strings in visible text', () => {
  const payload = preview('- https://autolister.app/?utm_source=margeo&utm_medium=partner');
  assert.match(payload.html, /<a href="https:\/\/autolister.app\/\?utm_source=margeo&amp;utm_medium=partner"[^>]*>autolister.app\/<\/a>/);
});

test('HTML and unsafe link syntax cannot inject executable markup', () => {
  const payload = preview('<img src=x onerror=alert(1)> [unsafe](javascript:alert(1))');
  assert.doesNotMatch(payload.html, /<img|href="javascript:/);
  assert.match(payload.html, /&lt;img/);
});
