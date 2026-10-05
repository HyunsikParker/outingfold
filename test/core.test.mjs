import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInput, sourceBlocks, validateSelection, resolvePicks, safeURL, exportIssue, offlineDocument, paperMarkup } from '../public/core.mjs';
import { selectWithModel } from '../model.mjs';

const input = { title: 'Example park', text: ' Open from 8 to 6.\r\n\r\n  Keep dogs on a lead. \nBirds nest by the stream.', url: 'https://example.org/park' };
const picks = [{ id: 'S2', section: 'care' }, { id: 'S1', section: 'plan' }];

test('source IDs retain exact substrings and original order, including Unicode', () => {
  const text = ' 🌱 산책\r\n\n\t閉園は六時です。  \nKeep the gate closed.';
  const blocks = sourceBlocks(text);
  assert.equal(blocks.length, 3);
  for (const b of blocks) assert.equal(text.slice(b.start, b.end), b.text);
  assert.deepEqual(resolvePicks(input, picks).map(b => b.id), ['S1', 'S2']);
});

test('unknown IDs, duplicate IDs, unknown categories and generated text fail closed', () => {
  const blocks = sourceBlocks(input.text);
  for (const value of [
    { picks: [{ id: 'S99', section: 'plan' }] },
    { picks: [{ id: 'S1', section: 'plan' }, { id: 'S1', section: 'care' }] },
    { picks: [{ id: 'S1', section: 'constructor' }] },
    { picks: [{ id: 'S1', section: 'plan', text: 'The park is safe.' }] },
    { picks, headline: 'Go now.' }, { picks: null }, null,
  ]) assert.throws(() => validateSelection(value, blocks));
});

test('size limits and malformed user input do not silently truncate', () => {
  assert.throws(() => checkInput({ ...input, text: 'a'.repeat(16001) }));
  assert.throws(() => checkInput({ ...input, title: '' }));
  assert.throws(() => sourceBlocks(Array(121).fill('line').join('\n')));
  assert.throws(() => sourceBlocks(' \n '));
  const long = { ...input, text: `${'a'.repeat(801)}\nshort` };
  assert.match(exportIssue(long, [{ id: 'S1', section: 'plan' }], true), /panel/);
  assert.match(exportIssue(input, [], true), /at least one/);
  assert.match(exportIssue(input, picks, false), /Review/);
});

test('unsafe links and credentials cannot enter exported hrefs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'https://user:pass@example.org', '//example.org']) {
    assert.equal(safeURL(url), '');
    assert.throws(() => checkInput({ ...input, url }));
  }
  assert.equal(safeURL('https://example.org/park?a=1&b=2'), 'https://example.org/park?a=1&b=2');
});

test('HTML text is escaped and the complete source, including omitted text, is offline', () => {
  const hostile = { title: '<img src=x onerror=alert(1)>', url: '', text: '<script>alert(1)</script>\nA closure was omitted.' };
  const html = offlineDocument(hostile, [{ id: 'S1', section: 'plan' }], { sourceHash: 'abc', savedAt: '2026-10-05T20:00:00Z' }, true);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /S2 · Left out/);
  assert.match(html, /A closure was omitted/);
  assert.match(html, /default-src 'none'/);
  assert.ok(!/<(?:link|script|iframe|img)\b/.test(html));
});

test('empty panels never claim absence of relevant source facts', () => {
  const html = paperMarkup(input, picks, {});
  assert.match(html, /Nothing selected here/);
  assert.ok(!html.includes('No cautions'));
  assert.ok(!html.includes('Not provided'));
});

test('model request uses IDs, fixed local model, strict schema and exact source hash', async () => {
  let sent;
  const result = await selectWithModel(input, { fetcher: async (url, opts) => {
    sent = JSON.parse(opts.body);
    assert.equal(url.hostname, '127.0.0.1');
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ picks }) }, prompt_eval_count: 123, eval_count: 45 }) };
  } });
  assert.equal(sent.stream, false);
  assert.equal(sent.think, false);
  assert.equal(sent.format.additionalProperties, false);
  assert.deepEqual(result.picks, picks);
  assert.match(result.meta.sourceHash, /^[a-f0-9]{64}$/);
  await assert.rejects(selectWithModel(input, { endpoint: 'https://example.org' }), /local loopback/);
  await assert.rejects(selectWithModel(input, { fetcher: async () => ({ ok: true, json: async () => ({ message: { content: 'made up' } }) }) }), /invalid JSON/);
});
