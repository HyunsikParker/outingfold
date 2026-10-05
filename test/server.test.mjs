import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server.mjs';

test('server permits same-origin notes and rejects cross-site, wrong host, invalid input and traversal', async t => {
  let calls = 0;
  const server = createServer({ selector: async input => { calls++; return { input, picks: [], meta: {} }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ title: 'Park', text: 'Open daily.', url: '' });
  const post = extra => fetch(`${origin}/api/select`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body });
  assert.equal((await post()).status, 200);
  assert.equal(calls, 1);
  assert.equal((await post({ Origin: 'https://bad.example' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = http.request(`${origin}/api/select`, { method: 'POST', headers: { Host: `bad.example:${server.address().port}`, Origin: origin, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end(body);
  });
  assert.equal(wrongHost, 403);
  assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${origin}/api/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(`${origin}/api/select`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(`${origin}/%2e%2e/server.mjs`)).status, 404);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(calls, 1);
});

test('a model failure is an error and never turns into a recorded or fabricated answer', async t => {
  const server = createServer({ selector: async () => { throw new Error('unavailable'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/select`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Park', text: 'Note', url: '' }) });
  assert.equal(response.status, 502);
  const result = await response.json();
  assert.equal(result.picks, undefined);
  assert.match(result.error, /failed/);
});
